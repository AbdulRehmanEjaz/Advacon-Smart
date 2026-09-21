import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildTripId,
  loadingSummary,
  truckToken,
} from '../lib/domain/loading';
import { canAccessView } from '../lib/domain/permissions';
import { riyadhDeparture } from '../lib/domain/date';
import type { LoadingTrip } from '../lib/domain/loading';

await test('trip IDs follow the server-side XXXX-DD/MM-HH:MM-Tn format', () => {
  const departure = { datePart: '19/09', timePart: '14:32' };
  assert.equal(buildTripId('1234', departure, 1), '1234-19/09-14:32-T1');
  assert.equal(buildTripId('1234', departure, 2), '1234-19/09-14:32-T2');
  assert.equal(
    buildTripId('ab-12', departure, 12),
    'AB12-19/09-14:32-T12',
  );
});

await test('truck tokens are sanitized for trip IDs', () => {
  assert.equal(truckToken('ab 12/45'), 'AB1245');
  assert.equal(truckToken('t-100'), 'T100');
  assert.equal(truckToken('!!!'), 'TRUCK');
  assert.equal(truckToken('ABCDEFGHIX99'), 'ABCDEFGH');
});

await test('riyadh departure splits civil date/time for trip IDs', () => {
  const departure = riyadhDeparture(new Date('2026-09-19T11:32:00Z'));
  assert.match(departure.datePart, /^\d{2}\/\d{2}$/);
  assert.match(departure.timePart, /^\d{2}:\d{2}$/);
  assert.match(departure.iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+03:00$/);
});

const trip = (status: string, trees: number) =>
  ({ status, treesLoaded: trees }) as Pick<LoadingTrip, 'status' | 'treesLoaded'>;

await test('remaining target subtracts approved trips only, never pending', () => {
  const summary = loadingSummary(10000, [trip('APPROVED', 2000), trip('PENDING', 500)]);
  assert.equal(summary.approved, 2000);
  assert.equal(summary.pending, 500);
  assert.equal(summary.remaining, 8000);
});

await test('approving pending trees reduces the remaining target', () => {
  const before = loadingSummary(10000, [trip('APPROVED', 2000), trip('PENDING', 500)]);
  assert.equal(before.remaining, 8000);
  const after = loadingSummary(10000, [
    trip('APPROVED', 2000),
    trip('APPROVED', 500),
  ]);
  assert.equal(after.approved, 2500);
  assert.equal(after.remaining, 7500);
});

await test('deleted trips never affect the target math', () => {
  const summary = loadingSummary(10000, [
    trip('APPROVED', 2000),
    trip('DELETED', 2000),
  ]);
  assert.equal(summary.approved, 2000, 'only APPROVED trips count');
  assert.equal(summary.remaining, 8000, 'soft-deleted quantities leave Remaining Trees');
  assert.equal(summary.pending, 0);
});

await test('rejected trips never affect the target math', () => {
  const summary = loadingSummary(10000, [trip('REJECTED', 999)]);
  assert.equal(summary.approved, 0);
  assert.equal(summary.pending, 0);
  assert.equal(summary.remaining, 10000);
});

await test('loading supervisors cannot access any main workspace view', () => {
  for (const view of [
    'dashboard',
    'daily',
    'approvals',
    'reports',
    'audit',
    'settings',
    'timesheet',
    'resources',
    'cost-control',
    'kpi-progress',
    'translocation',
  ]) {
    assert.equal(canAccessView('LOADING_SUPERVISOR', view), false, view);
  }
  assert.equal(canAccessView('ADMIN', 'dashboard'), true);
  assert.equal(canAccessView('FOREMAN', 'daily'), true);
  assert.equal(canAccessView('VIEWER', 'dashboard'), true);
});

await test('migration adds loading tables without touching existing schema', async () => {
  const [migration, initial] = await Promise.all([
    readFile(new URL('../d1/migrations/0009_loading_supervisors.sql', import.meta.url), 'utf8'),
    readFile(new URL('../d1/migrations/0001_initial.sql', import.meta.url), 'utf8'),
  ]);
  assert.match(migration, /CREATE TABLE loading_supervisors/);
  assert.match(migration, /CREATE TABLE loading_trips/);
  assert.match(migration, /trip_id TEXT NOT NULL UNIQUE/);
  assert.match(migration, /CHECK \(trees_loaded > 0\)/);
  assert.match(migration, /REFERENCES loading_supervisors\(id\)/);
  assert.match(migration, /idx_loading_trips_status/);
  assert.match(migration, /idx_loading_trips_supervisor/);
  assert.doesNotMatch(migration, /DROP TABLE|ALTER TABLE|INSERT INTO users|UPDATE users/i);
  // The users role constraint is untouched in the initial migration.
  assert.match(initial, /CHECK \(role IN \('ADMIN', 'FOREMAN'\)\)/);
});

await test('API route keeps loading endpoints loader-only and trip review admin-only', async () => {
  const [route, loadingModule, authModule] = await Promise.all([
    readFile(new URL('../app/api/[...path]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/loading.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/auth.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(route, /path === 'loading-state' && req\.method === 'GET'/);
  assert.doesNotMatch(route, /loading-login/);
  assert.match(route, /role: result\.user\.role/);
  assert.match(route, /path === 'loading-trip' && req\.method === 'POST'/);
  assert.match(route, /user\.role === 'LOADING_SUPERVISOR'/);
  assert.match(route, /Loading Supervisor access is limited/);
  assert.match(loadingModule, /admin\(user\)/);
  assert.match(loadingModule, /This trip has already been reviewed/);
  assert.match(loadingModule, /UNIQUE constraint failed/);
  assert.match(authModule, /initial-loader/);
  assert.match(authModule, /LOADING_PIN/);
  assert.match(authModule, /'LOADING_SUPERVISOR'/);
  assert.match(authModule, /loading_supervisors/);
  assert.doesNotMatch(authModule, /export async function loadingLogin/);
});

await test('departure time and trip identity are always generated server-side', async () => {
  const loadingModule = await readFile(
    new URL('../lib/server/loading.ts', import.meta.url),
    'utf8',
  );
  assert.match(loadingModule, /riyadhDeparture\(\)/);
  assert.match(loadingModule, /buildTripId\(/);
  assert.doesNotMatch(loadingModule, /departureTime:\s*z\.string|departure:\s*z\.string/);
  const domain = await readFile(new URL('../lib/domain/loading.ts', import.meta.url), 'utf8');
  assert.match(domain, /remaining: Math\.max\(0, target - approved\)/);
});

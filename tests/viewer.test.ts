import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canAccessView } from '../lib/domain/permissions';
import { viewerState } from '../lib/server/viewer-state';
import type { State } from '../lib/types';

void test('viewer access is limited to the approved read-only pages', () => {
  assert.equal(canAccessView('VIEWER', 'dashboard'), true);
  assert.equal(canAccessView('VIEWER', 'kpi-progress'), true);
  assert.equal(canAccessView('VIEWER', 'cost-control'), true);
  assert.equal(canAccessView('VIEWER', 'daily'), false);
  assert.equal(canAccessView('VIEWER', 'approvals'), false);
  assert.equal(canAccessView('VIEWER', 'reports'), false);
  assert.equal(canAccessView('FOREMAN', 'daily'), true);
  assert.equal(canAccessView('FOREMAN', 'cost-control'), false);
  assert.equal(canAccessView('ADMIN', 'audit'), true);
});

void test('viewer API route blocks restricted reads, downloads and mutations server-side', async () => {
  const [route, service, photos] = await Promise.all([
    readFile(new URL('../app/api/[...path]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/photos/[id]/route.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(route, /user\.role === 'VIEWER' && \(req\.method !== 'GET' \|\| path !== 'state'\)/);
  assert.match(service, /if \(user\.role === 'VIEWER'\) throw new HttpError\(403/);
  assert.match(service, /if \(!canAccessView\(user\.role, view/);
  assert.match(photos, /user\.role === 'VIEWER'/);
});

void test('viewer state strips management data and exposes only approved presentation data', () => {
  const state = {
    user: {
      id: 'viewer',
      name: 'Viewer',
      role: 'VIEWER',
      active: true,
      archivedAt: null,
      defaultPin: false,
      lastLogin: null,
      createdAt: '2026-09-11T00:00:00.000Z',
      updatedAt: '2026-09-11T00:00:00.000Z',
    },
    settings: {},
    packages: [],
    openingBalances: [
      {
        activityId: 'kpi',
        quantity: 5,
        source: 'private import',
        effectiveAt: '2026-08-15',
      },
    ],
    blocks: [{ id: 'A01' }],
    users: [{ id: 'admin', name: 'Admin', role: 'ADMIN' }],
    submissions: [
      {
        id: 'approved',
        supervisorId: 'foreman',
        supervisor: { name: 'Foreman Name' },
        status: 'APPROVED',
        workDate: '2026-09-10',
        createdAt: '2026-09-10T08:00:00.000Z',
        blockId: 'A01',
        packageId: 'pkg',
        version: 3,
        remarks: 'private remarks',
        photos: [{ id: 'photo', name: 'site.jpg' }],
        items: [
          {
            id: 'item',
            activityId: 'kpi',
            quantity: 10,
            adjustments: [{ quantity: -1, createdAt: '2026-09-11T08:00:00.000Z' }],
          },
        ],
        approvals: [
          { decision: 'APPROVED', comment: 'admin note', createdAt: '2026-09-10T09:00:00.000Z' },
        ],
      },
      {
        id: 'waiting',
        supervisorId: 'foreman',
        supervisor: { name: 'Foreman Name' },
        status: 'WAITING',
        workDate: '2026-09-11',
        createdAt: '2026-09-11T08:00:00.000Z',
        blockId: 'A02',
        packageId: 'pkg',
        version: 1,
        remarks: '',
        photos: [],
        items: [],
        approvals: [],
      },
    ],
    manpower: [
      {
        id: 'labour',
        code: 'L-001',
        name: 'Private Labour',
        company: 'Private Company',
        dailyRateHalalas: 12000,
        active: true,
        archivedAt: null,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ],
    equipment: [],
    manpowerAttendance: [
      {
        id: 'att',
        resourceId: 'labour',
        date: '2026-09-11',
        status: 'PRESENT',
        createdAt: '2026-09-11T00:00:00.000Z',
        updatedAt: '2026-09-11T00:00:00.000Z',
      },
    ],
    equipmentAttendance: [],
    fuelRecords: [
      {
        id: 'fuel',
        date: '2026-09-11',
        fuelType: 'DIESEL',
        quantityMillilitres: 1000,
        vatStatus: 'NON_VAT',
        enteredAmountHalalas: 10000,
        netAmountHalalas: 10000,
        vatRemovedHalalas: 0,
        description: 'private description',
        active: true,
        createdAt: '2026-09-11T00:00:00.000Z',
        updatedAt: '2026-09-11T00:00:00.000Z',
      },
    ],
    invoicePoRecords: [
      {
        id: 'invoice',
        recordType: 'INVOICE',
        date: '2026-09-11',
        vatStatus: 'VAT_INCLUDED',
        invoiceNo: 'INV-1',
        poNo: null,
        paidBy: 'Private Payer',
        enteredAmountHalalas: 11500,
        netAmountHalalas: 10000,
        vatRemovedHalalas: 1500,
        description: 'private invoice',
        active: true,
        createdAt: '2026-09-11T00:00:00.000Z',
        updatedAt: '2026-09-11T00:00:00.000Z',
      },
    ],
  } as unknown as State;

  const safe = viewerState(state);
  assert.equal(safe.user.role, 'VIEWER');
  assert.equal(safe.users, undefined);
  assert.equal(safe.blocks.length, 0);
  assert.equal(safe.submissions.length, 1);
  assert.equal(safe.submissions[0].remarks, '');
  assert.deepEqual(safe.submissions[0].photos, []);
  assert.equal(safe.submissions[0].supervisor.name, '');
  assert.equal(safe.submissions[0].approvals[0].comment, '');
  assert.equal(safe.openingBalances[0].source, '');
  assert.equal(safe.manpower?.[0].name, '');
  assert.equal(safe.manpower?.[0].dailyRateHalalas, 12000);
  assert.equal(safe.fuelRecords?.[0].description, '');
  assert.equal(safe.invoicePoRecords?.[0].invoiceNo, null);
  assert.equal(safe.invoicePoRecords?.[0].paidBy, '');
});

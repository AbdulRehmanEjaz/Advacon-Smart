import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseline, openingBalances, packages, zones } from '../lib/domain/baseline';
import { assertReviewable } from '../lib/domain/workflow';
import {
  approvedTotals,
  calculateKpiProgress,
  percent,
  plannedProgress,
  targetFor,
  type Submission,
} from '../lib/domain/calculations';

const sub = (
  quantities: Record<string, number>,
  status = 'APPROVED',
  workDate = '2026-09-02',
): Submission => ({
  id: crypto.randomUUID(),
  supervisorId: 'f1',
  supervisor: { name: 'Test Foreman' },
  status,
  workDate,
  createdAt: workDate,
  blockId: 'A01',
  packageId: 'irrigation',
  version: 1,
  remarks: '',
  photos: [],
  approvals: [{ decision: status, comment: '', createdAt: '2026-09-02' }],
  items: Object.entries(quantities).map(([activityId, quantity]) => ({
    id: crypto.randomUUID(),
    activityId,
    quantity,
    adjustments: [],
  })),
});
const official = (submissions: Submission[] = []) =>
  calculateKpiProgress(packages, openingBalances, submissions, baseline);
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≠ ${expected}`);

await test('approved baseline contains exactly seven groups, 23 active KPIs and 100 direct weight', () => {
  assert.equal(packages.length, 7);
  assert.equal(packages.flatMap((item) => item.activities).length, 23);
  assert.equal(packages.reduce((sum, item) => sum + item.weight, 0), 100);
  assert.equal(zones.reduce((sum, zone) => sum + zone.count, 0), 19);
});

await test('supply uses the approved four-KPI 3 + 3 + 1 + 3 model', () => {
  const supply = packages.find((item) => item.id === 'new-trees')!;
  assert.deepEqual(supply.activities.map((item) => item.weight), [3, 3, 1, 3]);
  assert.equal(supply.activities.some((item) => item.id === 'kpi-new-inspection'), false);
});

await test('final completion contributes its five percent only after approval', () => {
  const final = sub({ 'kpi-final-handover': 1 }, 'WAITING');
  final.packageId = 'final-completion';
  final.blockId = null;
  close(official([final]).overall, official().overall);
  final.status = 'APPROVED';
  close(official([final]).overall, official().overall + 5);
});

await test('opening balances produce the approved exact overall result', () => {
  const result = official();
  close(result.overall, 15.66652278138432);
  close(result.remaining, Number('84.33347721861568'));
  assert.equal(Number(result.overall.toFixed(2)), 15.67);
});

await test('opening irrigation and support group results match the approved model', () => {
  const result = official();
  const irrigation = result.groups.find((item) => item.id === 'irrigation')!;
  const support = result.groups.find((item) => item.id === 'support')!;
  close(irrigation.earned, Number('3.9229330377945765'));
  close(irrigation.progress, 15.69173215117831);
  close(support.earned, 1.743589743589744);
  close(support.progress, 6.974358974358977);
});

await test('waiting, returned and rejected work contributes zero', () => {
  for (const status of ['WAITING', 'RETURNED', 'REJECTED'])
    close(
      official([sub({ 'kpi-irrigation-hdpe': 100 }, status)]).overall,
      official().overall,
    );
});

await test('approved future submissions add to opening balances without replacing them', () => {
  const result = official([sub({ 'kpi-irrigation-hdpe': 100 })]);
  assert.equal(result.totals['kpi-irrigation-hdpe'], 900);
  assert.ok(result.overall > official().overall);
});

await test('signed adjustments affect approved totals while original quantities stay immutable', () => {
  const submission = sub({ 'kpi-irrigation-hdpe': 100 });
  submission.items[0].adjustments = [{ quantity: -20, createdAt: '2026-09-03' }];
  assert.equal(approvedTotals([submission])['kpi-irrigation-hdpe'], 80);
  assert.equal(submission.items[0].quantity, 100);
  assert.equal(approvedTotals([submission], '2026-09-02')['kpi-irrigation-hdpe'], 100);
});

await test('completion and earned progress clamp at target', () => {
  const result = official([sub({ 'kpi-irrigation-hdpe': 999999 })]);
  const activity = result.groups.flatMap((item) => item.activities)
    .find((item) => item.id === 'kpi-irrigation-hdpe')!;
  assert.equal(activity.completion, 100);
  assert.equal(activity.earned, 12);
  assert.equal(activity.remaining, 0);
});

await test('blank target safely falls back to denominator 100', () => {
  const custom = [{ ...packages[0], activities: [{ ...packages[0].activities[0], target: null, targetKey: 'none' }] }];
  const result = calculateKpiProgress(custom, [], [sub({ 'kpi-mobilization': 25 })], baseline);
  assert.equal(result.groups[0].activities[0].completion, 25);
});

await test('inactive packages and KPIs cannot affect official progress', () => {
  const inactive = [{ ...packages[0], active: false }];
  assert.equal(calculateKpiProgress(inactive, openingBalances, [sub({ 'kpi-mobilization': 1 })], baseline).overall, 0);
  const withInactiveActivity = [{ ...packages[0], activities: [{ ...packages[0].activities[0], active: false }] }];
  assert.equal(calculateKpiProgress(withInactiveActivity, openingBalances, [sub({ 'kpi-mobilization': 1 })], baseline).overall, 0);
});

await test('all exact target quantities complete to 100 without premature rounding', () => {
  const quantities = Object.fromEntries(packages.flatMap((group) =>
    group.activities.map((activity) => [activity.id, targetFor(activity, baseline)])));
  close(calculateKpiProgress(packages, [], [sub(quantities)], baseline).overall, 100);
});

await test('progress helpers handle bounds and schedules use direct project weights once', () => {
  assert.equal(percent(10, 0), 0);
  assert.equal(percent(200, 100), 100);
  const scheduled = packages.map((group) => ({
    ...group,
    activities: group.activities.map((activity) => ({
      ...activity,
      schedule: { start: '2026-09-01', finish: '2026-09-11' },
    })),
  }));
  close(plannedProgress(scheduled, '2026-09-06')!, 50);
  close(plannedProgress(scheduled, '2026-09-20')!, 100);
  assert.equal(plannedProgress(packages, '2026-09-02'), null);
});

await test('approval workflow still rejects stale and repeated review', () => {
  assert.doesNotThrow(() => assertReviewable('WAITING', 1, 1));
  assert.throws(() => assertReviewable('APPROVED', 1, 1));
  assert.throws(() => assertReviewable('WAITING', 2, 1));
});

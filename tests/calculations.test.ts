import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseline, packages, zones } from '../lib/domain/baseline';
import { assertReviewable } from '../lib/domain/workflow';
import {
  approvedTotals,
  assertStageOrder,
  percent,
  plannedProgress,
  productivity,
  progress,
  readiness,
  targetFor,
  validateWeights,
  type Submission,
  type Block,
} from '../lib/domain/calculations';
const sub = (
  quantities: Record<string, number>,
  status = 'APPROVED',
  workDate = '2026-09-02',
): Submission => ({
  id: 's1',
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
    id: activityId,
    activityId,
    quantity,
    adjustments: [],
  })),
});
const block: Block = {
  id: 'A01',
  name: 'A01',
  zoneId: 'A',
  capacity: 100,
  irrigationTarget: 50,
  supportRows: 2,
  hold: false,
};
await test('review state machine forbids double approvals and stale revisions', () => {
  assert.doesNotThrow(() => assertReviewable('WAITING', 1, 1));
  assert.throws(() => assertReviewable('APPROVED', 1, 1));
  assert.throws(() => assertReviewable('RETURNED', 1, 1));
  assert.throws(() => assertReviewable('WAITING', 2, 1));
});
await test('baseline is exact, translocation independent of nursery remainder', () => {
  assert.equal(
    zones.reduce((n, z) => n + z.capacity, 0),
    13524,
  );
  assert.equal(baseline.translocationTarget, 10000);
  assert.equal(baseline.translocationTargetIsApproximate, true);
  assert.equal(baseline.newTreeTarget, 3500);
  assert.equal(
    zones.reduce((n, z) => n + z.count, 0),
    19,
  );
  assert.equal(baseline.postTarget, baseline.rowTarget * 5);
});
await test('all overall and stage weights total 100', () => {
  assert.ok(validateWeights(packages));
  for (const p of packages) assert.ok(validateWeights(p.activities), p.id);
  assert.equal(validateWeights([{ weight: 90 }]), false);
  assert.equal(validateWeights([{ weight: -10 }, { weight: 110 }]), false);
});
await test('empty approved ledger is zero', () =>
  assert.equal(progress(packages, {}, baseline).overall, 0));
await test('waiting, returned and rejected never contribute', () => {
  for (const status of ['WAITING', 'RETURNED', 'REJECTED'])
    assert.deepEqual(approvedTotals([sub({ placed: 100 }, status)]), {});
});
await test('only correctly placed trees drive relocation package', () => {
  const transported = progress(packages, { transported: 5000 }, baseline);
  assert.equal(
    transported.work.find((p) => p.id === 'translocation')!.progress,
    0,
  );
  const placed = progress(packages, { placed: 5000 }, baseline);
  assert.equal(placed.overall, 15);
  assert.equal(placed.work.find((p) => p.id === 'translocation')!.progress, 50);
});
await test('new-tree delivery is not full planting completion', () => {
  const p = progress(
    packages,
    { sourced: 3500, pre_inspected: 3500, delivered: 3500 },
    baseline,
  );
  assert.equal(p.work.find((p) => p.id === 'new-trees')!.progress, 40);
  assert.equal(p.overall, 4);
});
await test('irrigation stage weights are quantity based', () => {
  const p = progress(packages, { pipe: 8610 }, baseline);
  assert.equal(p.work.find((p) => p.id === 'irrigation')!.progress, 17.5);
  assert.equal(p.overall, 4.375);
});
await test('posts alone do not mark all support completed', () => {
  const p = progress(packages, { posts: 1560 }, baseline);
  assert.equal(p.work.find((p) => p.id === 'support')!.progress, 25);
  assert.equal(p.overall, 5);
});
await test('all baseline quantities complete yields 100 without premature rounding', () => {
  const values = Object.fromEntries(
    packages.flatMap((p) =>
      p.activities.map((a) => [a.id, targetFor(a, baseline)]),
    ),
  );
  assert.ok(
    Math.abs(progress(packages, values, baseline).overall - 100) < 1e-9,
  );
});
await test('percent handles zero targets and caps overdelivery', () => {
  assert.equal(percent(10, 0), 0);
  assert.equal(percent(200, 100), 100);
  assert.equal(percent(-3, 100), 0);
});
await test('signed adjustments alter effective totals, not original quantities', () => {
  const s = sub({ pipe: 100 });
  s.items[0].adjustments = [{ quantity: -15, createdAt: '2026-09-03' }];
  assert.equal(approvedTotals([s]).pipe, 85);
  assert.equal(s.items[0].quantity, 100);
  assert.equal(approvedTotals([s], '2026-09-02').pipe, 100);
});
await test('actual history cannot show work before approval date', () => {
  const s = sub({ pipe: 100 }, 'APPROVED', '2026-09-01');
  assert.equal(approvedTotals([s], '2026-09-01').pipe, undefined);
  assert.equal(approvedTotals([s], '2026-09-02').pipe, 100);
});
await test('readiness requires all irrigation and support prerequisites', () => {
  assert.equal(readiness(block, []).ready, false);
  assert.equal(
    readiness(block, [sub({ commissioned: 1, passed: 1, posts: 10 })]).ready,
    false,
  );
  const complete = sub({
    commissioned: 1,
    passed: 1,
    rows: 2,
    holes: 10,
    foundations: 10,
    posts: 10,
    cable: 2,
    tensioned: 2,
    inspected_rows: 2,
    approved_rows: 2,
  });
  assert.equal(readiness(block, [complete]).ready, true);
  assert.equal(readiness({ ...block, hold: true }, [complete]).ready, false);
  assert.equal(
    readiness({ ...block, supportRows: null }, [complete]).ready,
    false,
  );
});
await test('capacity remains unknown rather than being invented', () => {
  assert.equal(readiness({ ...block, capacity: null }, []).remaining, null);
  assert.equal(
    readiness(block, [sub({ placed: 20, planted: 10 })]).remaining,
    70,
  );
});
await test('stage dependencies reject impossible and negative work', () => {
  assert.throws(() => assertStageOrder({ pipe: 10, trench: 0 }));
  assert.throws(() => assertStageOrder({ posts: 9, approved_rows: 2 }));
  assert.throws(() => assertStageOrder({ tested: 2 }));
  assert.throws(() => assertStageOrder({ pipe: -1 }));
  assert.doesNotThrow(() =>
    assertStageOrder({ route: 50, trench: 40, pipe: 35 }),
  );
});
await test('no schedule means no fabricated planned progress', () =>
  assert.equal(plannedProgress(packages, '2026-09-02'), null));
await test('linear planned progress and safe zero-duration milestones', () => {
  const scheduled = packages.map((p) => ({
    ...p,
    activities: p.activities.map((a) => ({
      ...a,
      schedule: { start: '2026-09-01', finish: '2026-09-11' },
    })),
  }));
  assert.ok(Math.abs(plannedProgress(scheduled, '2026-09-06')! - 50) < 1e-9);
  assert.ok(Math.abs(plannedProgress(scheduled, '2026-09-20')! - 100) < 1e-9);
  const same = scheduled.map((p) => ({
    ...p,
    activities: p.activities.map((a) => ({
      ...a,
      schedule: { start: '2026-09-02', finish: '2026-09-02' },
    })),
  }));
  assert.ok(Number.isFinite(plannedProgress(same, '2026-09-02')));
});
await test('productivity needs at least three productive days for forecast', () => {
  assert.equal(
    productivity([], 'placed', '2026-09-02', 10000).forecastDays,
    null,
  );
  const entries = ['2026-08-31', '2026-09-01', '2026-09-02'].map((day) =>
    sub({ placed: 280 }, 'APPROVED', day),
  );
  const result = productivity(entries, 'placed', '2026-09-02', 10000);
  assert.equal(result.average, 120);
  assert.equal(result.today, 280);
  assert.equal(result.forecastDays, 77);
});

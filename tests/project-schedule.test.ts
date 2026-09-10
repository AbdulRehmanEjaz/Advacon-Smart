import assert from 'node:assert/strict';
import test from 'node:test';
import { baseline, packages, openingBalances } from '../lib/domain/baseline';
import { calculateKpiProgress } from '../lib/domain/calculations';
import type { State } from '../lib/types';
import { mainTasks, irrigationTasks, supportTasks, scheduleComparison } from '../lib/domain/project-schedule';

const state = { packages, openingBalances, submissions: [] as State['submissions'], settings: baseline };

void test('schedule retains all 21 exact approved baseline date ranges', () => {
  const ranges = [...mainTasks, ...irrigationTasks, ...supportTasks].map((t) => `${t.id}:${t.start.slice(5)}/${t.finish.slice(5)}`);
  assert.deepEqual(ranges, ['1:08-15/08-24', '2:08-19/08-29', '3:08-29/11-15', '4:08-29/11-15', '5:10-01/11-15', '6:10-15/11-25', '7:11-26/11-29', '8:11-29/11-30', '3.1:08-29/09-09', '3.2:08-29/09-08', '3.3:09-09/09-12', '3.4:09-09/09-15', '3.5:09-15/09-19', '3.6:09-20/09-23', '3.7:09-21/09-25', '3.8:09-21/09-24', '3.9:10-01/11-15', '3.10:09-24/11-15', '4.1:08-29/09-25', '4.2:09-01/10-20', '4.3:10-04/11-15']);
});

void test('planned curve uses KPI weights once, stays bounded and does not mutate live schedules', () => {
  const before = JSON.stringify(state);
  const result = scheduleComparison(state, '2026-09-10');
  assert.equal(result.chart[0].planned, 0);
  assert.equal(result.chart.at(-1)?.planned, 100);
  assert.equal(result.chart.find((r) => r.date === '2026-08-29')?.planned, 10);
  assert.equal(result.chart.find((r) => r.date === '2026-11-26')?.planned, 95);
  assert.equal(result.chart.find((r) => r.date === '2026-11-29')?.planned, 98.75);
  for (let i = 1; i < result.chart.length; i++) assert.ok(result.chart[i].planned! >= result.chart[i - 1].planned!);
  assert.equal(JSON.stringify(state), before);
});

void test('current curve reuses authoritative opening balances, approvals and dated adjustments', () => {
  const submission: State['submissions'][number] = { id: 's', remarks: '', supervisorId: 'u', supervisor: { name: 'Supervisor' }, status: 'APPROVED', workDate: '2026-09-03', createdAt: '2026-09-03', blockId: null, packageId: 'irrigation', version: 1, photos: [], approvals: [{ decision: 'APPROVED', comment: '', createdAt: '2026-09-05' }], items: [{ id: 'i', activityId: 'kpi-irrigation-hdpe', quantity: 100, adjustments: [{ quantity: -10, createdAt: '2026-09-07' }] }] };
  const live = { ...state, submissions: [submission, { ...submission, id: 'pending', status: 'WAITING' }] };
  const result = scheduleComparison(live, '2026-09-10');
  assert.equal(result.current, calculateKpiProgress(packages, openingBalances, live.submissions, baseline).overall);
  for (const point of result.chart.filter((r) => r.date < '2026-09-10')) assert.equal(point.current, calculateKpiProgress(packages, openingBalances, live.submissions, baseline, point.date).overall);
  assert.equal(result.chart.find((r) => r.date === '2026-09-10')?.current, result.current);
  assert.ok(result.chart.filter((r) => r.date > '2026-09-10').every((r) => r.current === null));
  assert.equal(result.variance, result.current - result.planned!);
  assert.equal(result.status, 'Behind plan');
});

void test('comparison handles on/ahead of plan and dates outside the baseline', () => {
  assert.equal(scheduleComparison({ ...state, openingBalances: [] }, '2026-08-14').status, 'On plan');
  assert.equal(scheduleComparison(state, '2026-08-15').status, 'Ahead of plan');
  const after = scheduleComparison(state, '2026-12-01');
  assert.equal(after.planned, 100);
  assert.equal(after.chart.at(-1)?.date, '2026-12-01');
});

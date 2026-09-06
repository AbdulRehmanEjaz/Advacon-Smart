import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ATTENDANCE_STATUSES,
  MANPOWER_DAILY_RATE_HALALAS,
  daysInMonthThrough,
  earnedHalalas,
  monthlyCost,
  statusCounts,
  type AttendanceRecord,
} from '../lib/domain/attendance';

const record = (status: 'P' | 'A' | 'F' | 'H', date = '2026-09-01'): AttendanceRecord => ({
  id: `${status}-${date}`,
  resourceId: 'worker-1',
  date,
  status,
  createdAt: date,
  updatedAt: date,
});

await test('only Present earns the exact daily rate', () => {
  assert.equal(MANPOWER_DAILY_RATE_HALALAS, 13_000);
  for (const status of ATTENDANCE_STATUSES)
    assert.equal(earnedHalalas(status, 13_000), status === 'P' ? 13_000 : 0);
  assert.equal(earnedHalalas(undefined, 13_000), 0);
});

await test('Friday and holiday work earns when explicitly marked Present', () => {
  assert.equal(earnedHalalas('P', 13_000), 13_000);
  assert.equal(earnedHalalas('F', 13_000), 0);
  assert.equal(earnedHalalas('H', 13_000), 0);
});

await test('monthly counts and costs use saved statuses only', () => {
  const records = [record('P'), record('P', '2026-09-02'), record('A'), record('F'), record('H')];
  assert.deepEqual(statusCounts(records), { P: 2, A: 1, F: 1, H: 1 });
  assert.equal(monthlyCost(records, 13_000), 26_000);
  assert.equal(monthlyCost(records, 85_000), 170_000);
});

await test('monthly eligible days exclude future dates and future months', () => {
  assert.equal(daysInMonthThrough('2026-09', '2026-09-05'), 5);
  assert.equal(daysInMonthThrough('2026-08', '2026-09-05'), 31);
  assert.equal(daysInMonthThrough('2026-10', '2026-09-05'), 0);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { manpowerAttendanceSummary } from '../lib/domain/dashboard-attendance';
import type { Resource, AttendanceRecord } from '../lib/domain/attendance';

void test('attendance card counts recorded P/A through today without treating holidays or missing days as absent', () => {
  const person: Resource = { id: 'worker', name: 'Worker', code: '001', company: '', dailyRateHalalas: 13000, active: true, archivedAt: null, createdAt: '', updatedAt: '' };
  const records: AttendanceRecord[] = (['P', 'P', 'P', 'A', 'F', 'H'] as const).map((status, i) => ({ id: String(i), resourceId: 'worker', date: `2026-09-0${i + 1}`, status, createdAt: '', updatedAt: '' }));
  const input = { manpower: [person], manpowerAttendance: [...records, { ...records[0], id: 'future', date: '2026-09-20' }, { ...records[0], id: 'unknown', resourceId: 'unknown' }] };
  const before = JSON.stringify(input);
  assert.deepEqual(manpowerAttendanceSummary(input, '2026-09-10'), { present: 3, absent: 1, percentage: 75 });
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(manpowerAttendanceSummary(input, '2026-09-03', 'day'), { present: 1, absent: 0, percentage: 100 });
  assert.deepEqual(manpowerAttendanceSummary(input, '2026-09-04', 'day'), { present: 0, absent: 1, percentage: 0 });
  assert.deepEqual(manpowerAttendanceSummary(input, '2026-09-10', 'day'), { present: 0, absent: 0, percentage: null });
  assert.deepEqual(manpowerAttendanceSummary(input, '2026-09-06', 'day'), { present: 0, absent: 0, percentage: null });
  assert.equal(manpowerAttendanceSummary({}, '2026-09-10').percentage, null);
  assert.equal(manpowerAttendanceSummary({ manpower: [person], manpowerAttendance: [records[3]] }, '2026-09-10').percentage, 0);
  assert.equal(manpowerAttendanceSummary({ manpower: [person], manpowerAttendance: [records[0]] }, '2026-09-10').percentage, 100);
});

void test('six-card order is scoped to dashboard categories only', async () => {
  const source = await readFile(new URL('../components/cost-control.tsx', import.meta.url), 'utf8');
  assert.match(source, /dashboard && selection === 'categories'/);
  assert.match(source, /\[cards\[1\], cards\[2\], cards\[4\], cards\[5\], cards\[3\]\]/);
  assert.ok(source.indexOf('<ManpowerAttendanceCard') < source.indexOf('{orderedCards.filter'));
});

void test('attendance donut uses solid present and striped absent without the explanatory note', async () => {
  const source = await readFile(new URL('../components/manpower-attendance-card.tsx', import.meta.url), 'utf8');
  assert.match(source, /stroke="#087443"[^>]*strokeDasharray=\{`\$\{percentage\}/);
  assert.match(source, /<i aria-hidden="true" \/>Present: <b>\{present.toLocaleString\('en-US'\)\}<\/b>/);
  assert.match(source, /<i className=\{styles.striped\} aria-hidden="true" \/>Absent: <b>\{absent.toLocaleString\('en-US'\)\}<\/b>/);
  assert.doesNotMatch(source, /Project-to-date|Friday, holidays and unrecorded days excluded/);
  assert.match(source, /const today = riyadhDate\(\)/);
  assert.match(source, /manpowerAttendanceSummary\(state, selectedDate, 'day'\)/);
  assert.match(source, /aria-label="Previous attendance day" onClick=\{\(\) => changeDate\(-1\)\}/);
  assert.match(source, /aria-label="Next attendance day" onClick=\{\(\) => changeDate\(1\)\}/);
  assert.match(source, /const \{ present, absent, percentage \} = manpowerAttendanceSummary\(state, selectedDate, 'day'\)/);
  assert.doesNotMatch(source, /manpowerAttendanceSummary\(state, today\)|Cumulative manpower attendance/);
});

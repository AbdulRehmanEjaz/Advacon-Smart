import assert from 'node:assert/strict';
import test from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { buildMonthlyTimesheetXlsx } from '@/lib/server/xlsx';
import type { AttendanceRecord, Resource } from '@/lib/domain/attendance';

const resource = (id: string, name: string, rate: number): Resource => ({
  id,
  name,
  code: id.toUpperCase(),
  company: 'Site Rentals',
  dailyRateHalalas: rate,
  active: true,
  archivedAt: null,
  createdAt: '2028-02-01',
  updatedAt: '2028-02-01',
});
const attendance = (
  resourceId: string,
  date: string,
  status: AttendanceRecord['status'],
): AttendanceRecord => ({
  id: `${resourceId}-${date}`,
  resourceId,
  date,
  status,
  createdAt: date,
  updatedAt: date,
});

void test('monthly workbook combines manpower and equipment with leap-year day columns and exact totals', () => {
  const bytes = buildMonthlyTimesheetXlsx(
    {
      manpower: [resource('m1', 'Ahmed Ali', 13_000)],
      equipment: [resource('e1', 'Excavator 01', 75_000)],
      manpowerAttendance: [
        attendance('m1', '2028-02-01', 'P'),
        attendance('m1', '2028-02-02', 'A'),
      ],
      equipmentAttendance: [
        attendance('e1', '2028-02-01', 'P'),
        attendance('e1', '2028-02-02', 'P'),
      ],
    },
    '2028-02',
    '2028-02-29',
    new Date('2028-03-01T08:00:00Z'),
  );
  assert.equal(String.fromCharCode(...bytes.slice(0, 2)), 'PK');
  const files = unzipSync(bytes);
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
  assert.match(sheet, /MANPOWER \/ WORKERS/);
  assert.match(sheet, /VEHICLES &amp; EQUIPMENT/);
  assert.match(sheet, /29\nTu/);
  assert.doesNotMatch(sheet, /30\n/);
  assert.match(sheet, /Ahmed Ali/);
  assert.match(sheet, /Excavator 01/);
  assert.match(sheet, /<v>130<\/v>/);
  assert.match(sheet, /<v>1500<\/v>/);
  assert.match(sheet, /<v>1630<\/v>/);
  assert.match(strFromU8(files['xl/styles.xml']), /SAR/);
});

void test('monthly workbook excludes attendance after the supplied Riyadh date', () => {
  const bytes = buildMonthlyTimesheetXlsx(
    {
      manpower: [resource('m1', 'Ahmed Ali', 13_000)],
      equipment: [],
      manpowerAttendance: [
        attendance('m1', '2028-02-10', 'P'),
        attendance('m1', '2028-02-11', 'P'),
      ],
      equipmentAttendance: [],
    },
    '2028-02',
    '2028-02-10',
  );
  const sheet = strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml']);
  assert.match(sheet, /<v>130<\/v>/);
  assert.doesNotMatch(sheet, /<v>260<\/v>/);
});

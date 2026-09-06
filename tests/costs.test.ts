import assert from 'node:assert/strict';
import test from 'node:test';
import { MANPOWER_DAILY_RATE_HALALAS, type AttendanceRecord, type Resource } from '../lib/domain/attendance';
import { costSummary, parseScaledDecimal, vatBreakdown } from '../lib/domain/costs';

const resource = (id: string, rate: number): Resource => ({ id, code: id, name: id, company: 'Rental Co', dailyRateHalalas: rate, active: true, archivedAt: null, createdAt: '', updatedAt: '' });
const attendance = (resourceId: string, date: string, status: AttendanceRecord['status']): AttendanceRecord => ({ id: `${resourceId}-${date}`, resourceId, date, status, createdAt: '', updatedAt: '' });

void test('VAT is removed exactly once only from VAT-inclusive amounts', () => {
  assert.deepEqual(vatBreakdown(1_000_000, 'NON_VAT'), { enteredAmountHalalas: 1_000_000, netAmountHalalas: 1_000_000, vatRemovedHalalas: 0 });
  assert.deepEqual(vatBreakdown(1_150_000, 'VAT_INCLUDED'), { enteredAmountHalalas: 1_150_000, netAmountHalalas: 1_000_000, vatRemovedHalalas: 150_000 });
});

void test('money and litre input is converted to exact scaled integers', () => {
  assert.equal(parseScaledDecimal('130.00', 100), 13_000);
  assert.equal(parseScaledDecimal('125.375', 1000), 125_375);
  assert.throws(() => parseScaledDecimal('1.999', 100));
});

void test('project cost uses attendance and net financial records for the selected month', () => {
  const summary = costSummary({
    month: '2026-09',
    manpower: [resource('worker', MANPOWER_DAILY_RATE_HALALAS)],
    equipment: [resource('excavator', 85_000)],
    manpowerAttendance: [attendance('worker', '2026-09-01', 'P'), attendance('worker', '2026-09-02', 'A')],
    equipmentAttendance: [attendance('excavator', '2026-09-01', 'P'), attendance('excavator', '2026-08-31', 'P')],
    fuelRecords: [
      { id: 'f1', date: '2026-09-01', fuelType: 'DIESEL', quantityMillilitres: 10_000, vatStatus: 'NON_VAT', enteredAmountHalalas: 10_000, netAmountHalalas: 10_000, vatRemovedHalalas: 0, description: '', active: true, createdAt: '', updatedAt: '' },
      { id: 'f2', date: '2026-09-02', fuelType: 'PETROL', quantityMillilitres: 5_000, vatStatus: 'VAT_INCLUDED', enteredAmountHalalas: 11_500, netAmountHalalas: 10_000, vatRemovedHalalas: 1_500, description: '', active: true, createdAt: '', updatedAt: '' },
    ],
    invoicePoRecords: [
      { id: 'i1', date: '2026-09-03', vatStatus: 'NON_VAT', invoiceNo: 'INV-1', poNo: null, enteredAmountHalalas: 1_000_000, netAmountHalalas: 1_000_000, vatRemovedHalalas: 0, description: '', active: true, createdAt: '', updatedAt: '' },
      { id: 'i2', date: '2026-09-04', vatStatus: 'VAT_INCLUDED', invoiceNo: null, poNo: 'PO-1', enteredAmountHalalas: 1_150_000, netAmountHalalas: 1_000_000, vatRemovedHalalas: 150_000, description: '', active: true, createdAt: '', updatedAt: '' },
    ],
  });
  assert.equal(summary.manpowerHalalas, 13_000);
  assert.equal(summary.equipmentHalalas, 85_000);
  assert.equal(summary.fuelHalalas, 20_000);
  assert.equal(summary.invoiceHalalas, 2_000_000);
  assert.equal(summary.vatRemovedHalalas, 151_500);
  assert.equal(summary.totalHalalas, 2_118_000);
});

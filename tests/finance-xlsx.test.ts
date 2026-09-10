import assert from 'node:assert/strict';
import test from 'node:test';
import { unzipSync, strFromU8 } from 'fflate';
import { buildFinanceXlsx } from '../lib/server/xlsx';
import type { InvoicePoRecord } from '../lib/domain/costs';

const record: InvoicePoRecord = { id: '1', recordType: 'PO', date: '2026-09-01', vatStatus: 'NON_VAT', invoiceNo: '001', poNo: 'PO-001', paidBy: 'A & B', enteredAmountHalalas: 50000, netAmountHalalas: 50000, vatRemovedHalalas: 0, description: '=SUM(A1:A2)', active: true, createdAt: '', updatedAt: '' };

void test('finance export has exactly three styled sheets, typed amounts and all saved records', () => {
  const files = unzipSync(buildFinanceXlsx({ invoicePoRecords: [record, { ...record, id: '2', recordType: 'INVOICE', vatStatus: 'VAT_INCLUDED', enteredAmountHalalas: 57500, active: false }], fuelRecords: [{ id: '3', date: record.date, fuelType: 'DIESEL', quantityMillilitres: 125375, vatStatus: 'NON_VAT', enteredAmountHalalas: 50000, netAmountHalalas: 50000, vatRemovedHalalas: 0, description: 'Fuel', active: true, createdAt: '', updatedAt: '' }] }));
  const read = (path: string) => strFromU8(files[path]);
  assert.equal(Object.keys(files).filter((name) => name.startsWith('xl/worksheets/')).length, 3);
  assert.match(read('xl/workbook.xml'), /name="Fuel Details".*name="POs Details".*name="Invoices Details"/);
  const po = read('xl/worksheets/sheet2.xml');
  const invoice = read('xl/worksheets/sheet3.xml');
  const fuel = read('xl/worksheets/sheet1.xml');
  assert.match(po, /r="H5" s="3"><v>0<\/v>/);
  assert.match(po, /r="I5" s="3"><v>500<\/v>/);
  assert.match(po, /r="J5" s="3"><v>500<\/v>/);
  assert.match(po, /A &amp; B/);
  assert.match(po, /t="inlineStr"[^>]*><is><t[^>]*>=SUM/); // Not an executable formula.
  assert.match(invoice, /r="G5" s="3"><v>75<\/v>/);
  assert.match(invoice, /r="I5" s="3"><v>575<\/v>/);
  assert.match(invoice, /Archived/);
  assert.match(fuel, /r="D5" s="5"><v>125.375<\/v>/);
  assert.match(fuel, /r="I5" s="3"><v>575<\/v>/); // Fuel VAT remains unchanged.
  for (const sheet of [po, invoice, fuel]) {
    assert.match(sheet, /r="A5" s="4"><v>\d+<\/v>/);
    assert.match(sheet, /state="frozen"/);
    assert.match(sheet, /autoFilter ref="A4:/);
    assert.match(sheet, /customWidth="1"/);
  }
  assert.match(read('xl/styles.xml'), /dd mmm yyyy/);
  assert.match(read('xl/styles.xml'), /SAR/);
});

void test('empty finance export retains all three worksheet headers', () => {
  const files = unzipSync(buildFinanceXlsx({}));
  for (let i = 1; i <= 3; i++) assert.match(strFromU8(files[`xl/worksheets/sheet${i}.xml`]), /autoFilter ref="A4:[A-Z]+4"/);
});

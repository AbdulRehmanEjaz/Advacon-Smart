import type { AttendanceRecord, Resource } from './attendance';
import { monthlyCost } from './attendance';

export const VAT_RATE_PERCENT = 15;
export const VAT_STATUSES = ['NON_VAT', 'VAT_INCLUDED'] as const;
export type VatStatus = (typeof VAT_STATUSES)[number];
export const COST_DOCUMENT_TYPES = ['INVOICE', 'PO'] as const;
export type CostDocumentType = (typeof COST_DOCUMENT_TYPES)[number];

export type FuelRecord = {
  id: string;
  date: string;
  fuelType: 'PETROL' | 'DIESEL';
  quantityMillilitres: number;
  vatStatus: VatStatus;
  enteredAmountHalalas: number;
  netAmountHalalas: number;
  vatRemovedHalalas: number;
  description: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InvoicePoRecord = {
  id: string;
  recordType: CostDocumentType;
  date: string;
  vatStatus: VatStatus;
  invoiceNo: string | null;
  poNo: string | null;
  paidBy: string;
  enteredAmountHalalas: number;
  netAmountHalalas: number;
  vatRemovedHalalas: number;
  description: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

function safeMoney(value: bigint): number {
  if (value < BigInt(0) || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('INVALID_AMOUNT');
  return Number(value);
}

export function inclusiveCost(enteredAmountHalalas: number, vatStatus: VatStatus) {
  if (!Number.isSafeInteger(enteredAmountHalalas) || enteredAmountHalalas < 0) throw new Error('INVALID_AMOUNT');
  const entered = BigInt(enteredAmountHalalas);
  const net = vatStatus === 'VAT_INCLUDED' ? (entered * BigInt(100) + BigInt(57)) / BigInt(115) : entered;
  const gross = vatStatus === 'VAT_INCLUDED' ? entered : net + (net * BigInt(15) + BigInt(50)) / BigInt(100);
  return { netHalalas: safeMoney(net), vatHalalas: safeMoney(gross - net), grossHalalas: safeMoney(gross) };
}

export function vatBreakdown(enteredAmountHalalas: number, vatStatus: VatStatus) {
  if (!Number.isSafeInteger(enteredAmountHalalas) || enteredAmountHalalas < 0)
    throw new Error('INVALID_AMOUNT');
  const netAmountHalalas =
    vatStatus === 'VAT_INCLUDED'
      ? inclusiveCost(enteredAmountHalalas, vatStatus).netHalalas
      : enteredAmountHalalas;
  return {
    enteredAmountHalalas,
    netAmountHalalas,
    vatRemovedHalalas: enteredAmountHalalas - netAmountHalalas,
  };
}

export function parseScaledDecimal(value: string, scale: number) {
  const places = String(scale).length - 1;
  const parts = value.trim().split('.');
  if (
    parts.length > 2 ||
    !/^\d+$/.test(parts[0] || '') ||
    (parts[1] != null && (!/^\d+$/.test(parts[1]) || parts[1].length > places))
  )
    throw new Error('INVALID_DECIMAL');
  return Number(parts[0]) * scale + Number((parts[1] || '').padEnd(places, '0'));
}

export function attendanceCostForMonth(
  resources: Resource[],
  records: AttendanceRecord[],
  month: string,
) {
  return resources.map((resource) => {
    const attendance = records.filter(
      (record) => record.resourceId === resource.id && record.date.startsWith(month),
    );
    return { resource, totalHalalas: monthlyCost(attendance, resource.dailyRateHalalas) };
  });
}

export function costSummary(input: {
  month?: string;
  throughDate?: string;
  manpower: Resource[];
  equipment: Resource[];
  manpowerAttendance: AttendanceRecord[];
  equipmentAttendance: AttendanceRecord[];
  fuelRecords: FuelRecord[];
  invoicePoRecords: InvoicePoRecord[];
}) {
  const inPeriod = (record: { date: string }) =>
    (!input.month || record.date.startsWith(input.month)) &&
    (!input.throughDate || record.date <= input.throughDate);
  const manpower = attendanceCostForMonth(input.manpower, input.manpowerAttendance.filter(inPeriod), input.month || '');
  const equipment = attendanceCostForMonth(input.equipment, input.equipmentAttendance.filter(inPeriod), input.month || '');
  const fuel = input.fuelRecords.filter((record) => record.active && inPeriod(record));
  const documents = input.invoicePoRecords.filter((record) => record.active && inPeriod(record));
  const invoices = documents.filter((record) => record.recordType === 'INVOICE');
  const purchaseOrders = documents.filter((record) => record.recordType === 'PO');
  const manpowerHalalas = manpower.reduce((sum, row) => sum + row.totalHalalas, 0);
  const equipmentHalalas = equipment.reduce((sum, row) => sum + row.totalHalalas, 0);
  const fuelHalalas = fuel.reduce((sum, row) => sum + row.netAmountHalalas, 0);
  const invoiceHalalas = invoices.reduce((sum, row) => sum + row.netAmountHalalas, 0);
  const poHalalas = purchaseOrders.reduce((sum, row) => sum + row.netAmountHalalas, 0);
  const vatRemovedHalalas = [...fuel, ...documents].reduce(
    (sum, row) => sum + row.vatRemovedHalalas,
    0,
  );
  const combine = (costs: ReturnType<typeof inclusiveCost>[]) => ({
    netHalalas: safeMoney(costs.reduce((sum, cost) => sum + BigInt(cost.netHalalas), BigInt(0))),
    vatHalalas: safeMoney(costs.reduce((sum, cost) => sum + BigInt(cost.vatHalalas), BigInt(0))),
    grossHalalas: safeMoney(costs.reduce((sum, cost) => sum + BigInt(cost.grossHalalas), BigInt(0))),
  });
  const recordCost = (row: FuelRecord | InvoicePoRecord) => inclusiveCost(row.enteredAmountHalalas, row.vatStatus);
  const costs = {
    manpower: combine(manpower.map((row) => inclusiveCost(row.totalHalalas, 'NON_VAT'))),
    equipment: combine(equipment.map((row) => inclusiveCost(row.totalHalalas, 'NON_VAT'))),
    fuel: combine(fuel.map(recordCost)),
    invoices: combine(invoices.map(recordCost)),
    pos: combine(purchaseOrders.map(recordCost)),
  };
  const total = combine(Object.values(costs));
  return {
    costs,
    total,
    manpower,
    equipment,
    fuel,
    invoices,
    purchaseOrders,
    manpowerHalalas,
    equipmentHalalas,
    fuelHalalas,
    invoiceHalalas,
    poHalalas,
    vatRemovedHalalas,
    totalHalalas: total.grossHalalas,
  };
}

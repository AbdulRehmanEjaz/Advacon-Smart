import type { AttendanceRecord, Resource } from './attendance';
import { monthlyCost } from './attendance';

export const VAT_RATE_PERCENT = 15;
export const VAT_STATUSES = ['NON_VAT', 'VAT_INCLUDED'] as const;
export type VatStatus = (typeof VAT_STATUSES)[number];

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
  date: string;
  vatStatus: VatStatus;
  invoiceNo: string | null;
  poNo: string | null;
  enteredAmountHalalas: number;
  netAmountHalalas: number;
  vatRemovedHalalas: number;
  description: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export function vatBreakdown(enteredAmountHalalas: number, vatStatus: VatStatus) {
  if (!Number.isSafeInteger(enteredAmountHalalas) || enteredAmountHalalas < 0)
    throw new Error('INVALID_AMOUNT');
  const netAmountHalalas =
    vatStatus === 'VAT_INCLUDED'
      ? Math.round((enteredAmountHalalas * 100) / 115)
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
  month: string;
  manpower: Resource[];
  equipment: Resource[];
  manpowerAttendance: AttendanceRecord[];
  equipmentAttendance: AttendanceRecord[];
  fuelRecords: FuelRecord[];
  invoicePoRecords: InvoicePoRecord[];
}) {
  const manpower = attendanceCostForMonth(input.manpower, input.manpowerAttendance, input.month);
  const equipment = attendanceCostForMonth(input.equipment, input.equipmentAttendance, input.month);
  const fuel = input.fuelRecords.filter((record) => record.active && record.date.startsWith(input.month));
  const invoices = input.invoicePoRecords.filter((record) => record.active && record.date.startsWith(input.month));
  const manpowerHalalas = manpower.reduce((sum, row) => sum + row.totalHalalas, 0);
  const equipmentHalalas = equipment.reduce((sum, row) => sum + row.totalHalalas, 0);
  const fuelHalalas = fuel.reduce((sum, row) => sum + row.netAmountHalalas, 0);
  const invoiceHalalas = invoices.reduce((sum, row) => sum + row.netAmountHalalas, 0);
  const vatRemovedHalalas = [...fuel, ...invoices].reduce(
    (sum, row) => sum + row.vatRemovedHalalas,
    0,
  );
  return {
    manpower,
    equipment,
    fuel,
    invoices,
    manpowerHalalas,
    equipmentHalalas,
    fuelHalalas,
    invoiceHalalas,
    vatRemovedHalalas,
    totalHalalas: manpowerHalalas + equipmentHalalas + fuelHalalas + invoiceHalalas,
  };
}

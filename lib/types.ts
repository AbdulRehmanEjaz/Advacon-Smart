import type { PackageDefinition, Settings } from './domain/baseline';
import type { Block, OpeningBalance, Submission } from './domain/calculations';
import type { AttendanceRecord, Resource } from './domain/attendance';
import type { FuelRecord, InvoicePoRecord } from './domain/costs';
export type User = {
  id: string;
  name: string;
  role: 'ADMIN' | 'FOREMAN';
  active: boolean;
  archivedAt: string | null;
  hasHistory?: boolean;
  defaultPin: boolean;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
};
export type Inspection = {
  id: string;
  number: string;
  blockId: string;
  type: string;
  inspector: string;
  result: string;
  date: string;
  remarks: string;
  firstAttempt: boolean;
  observations: {
    id: string;
    description: string;
    responsible: string;
    dueDate: string;
    closedAt: string | null;
  }[];
};
export type State = {
  user: User;
  submissions: Submission[];
  blocks: Block[];
  packages: PackageDefinition[];
  openingBalances: OpeningBalance[];
  settings?: Settings;
  users?: User[];
  zones?: { id: string; capacity: number; spacing: string }[];
  inspections?: Inspection[];
  audit?: {
    id: string;
    action: string;
    userId: string | null;
    entityType: string;
    entityId: string | null;
    createdAt: string;
    before: unknown;
    after: unknown;
  }[];
  manpower?: Resource[];
  equipment?: Resource[];
  manpowerAttendance?: AttendanceRecord[];
  equipmentAttendance?: AttendanceRecord[];
  fuelRecords?: FuelRecord[];
  invoicePoRecords?: InvoicePoRecord[];
};
export async function post(path: string, body: unknown) {
  const r = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await r.json()) as {
    id: string;
    ok?: boolean;
    error?: string;
    outcome?: 'saved' | 'archived' | 'deleted';
  };
  if (!r.ok) throw Error(data.error || 'Request failed.');
  return data;
}
export const number = (n: number | string | undefined) =>
  Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
export const today = () => new Date().toISOString().slice(0, 10);
export const initials = (name: string) =>
  name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('');
export async function uploadPhoto(submissionId: string, file: File) {
  if (
    file.size > 5 * 1024 * 1024 ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
  )
    throw Error('Use JPG, PNG or WebP images under 5 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let value = '';
  for (let i = 0; i < bytes.length; i += 8192)
    value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return post('photo', {
    submissionId,
    name: file.name,
    mime: file.type,
    data: btoa(value),
  });
}

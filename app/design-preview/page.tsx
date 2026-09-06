import { notFound } from 'next/navigation';
import { Workspace } from '@/components/workspace';
import { baseline, openingBalances, packages, zones } from '@/lib/domain/baseline';
import type { State } from '@/lib/types';
export default async function Preview({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const { view } = await searchParams;
  const state: State = {
    user: {
      id: 'preview',
      name: 'Project Administrator',
      role: 'ADMIN',
      active: true,
      archivedAt: null,
      defaultPin: false,
      lastLogin: null,
      createdAt: '2026-09-02',
      updatedAt: '2026-09-02',
    },
    submissions: [],
    packages,
    openingBalances,
    settings: baseline,
    blocks: zones.flatMap((z) =>
      Array.from({ length: z.count }, (_, i) => ({
        id: `${z.id}${String(i + 1).padStart(2, '0')}`,
        name: `${z.id}${String(i + 1).padStart(2, '0')}`,
        zoneId: z.id,
        capacity: null,
        irrigationTarget: null,
        supportRows: null,
        hold: false,
      })),
    ),
    zones,
    users: [],
    inspections: [],
    audit: [],
    manpower: [
      { id: 'mp-1', code: 'LAB-001', name: 'Faisal Ahmad', company: 'Green Site Services', dailyRateHalalas: 13000, active: true, archivedAt: null, createdAt: '2026-09-01', updatedAt: '2026-09-01' },
      { id: 'mp-2', code: 'LAB-002', name: 'Rashid Khan', company: 'Green Site Services', dailyRateHalalas: 13000, active: true, archivedAt: null, createdAt: '2026-09-01', updatedAt: '2026-09-01' },
      { id: 'mp-3', code: 'LAB-003', name: 'Imran Ali', company: 'Oasis Workforce', dailyRateHalalas: 13000, active: true, archivedAt: null, createdAt: '2026-09-01', updatedAt: '2026-09-01' },
    ],
    equipment: [
      { id: 'eq-1', code: 'EX-01', name: 'Excavator', company: 'ABC Equipment', dailyRateHalalas: 85000, active: true, archivedAt: null, createdAt: '2026-09-01', updatedAt: '2026-09-01' },
      { id: 'eq-2', code: 'LD-02', name: 'Loader', company: 'XYZ Rentals', dailyRateHalalas: 70000, active: true, archivedAt: null, createdAt: '2026-09-01', updatedAt: '2026-09-01' },
    ],
    manpowerAttendance: [],
    equipmentAttendance: [],
  };
  return <Workspace view={view || 'dashboard'} initialState={state} preview />;
}

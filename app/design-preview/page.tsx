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
  };
  return <Workspace view={view || 'dashboard'} initialState={state} preview />;
}

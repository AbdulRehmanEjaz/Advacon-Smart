import type { State } from '@/lib/types';
import { statusCounts } from './attendance';

export function manpowerAttendanceSummary(state: Pick<State, 'manpowerAttendance' | 'manpower'>, throughDate: string) {
  const ids = new Set((state.manpower || []).map((person) => person.id));
  const counts = statusCounts((state.manpowerAttendance || []).filter((record) => ids.has(record.resourceId) && record.date <= throughDate));
  const recorded = counts.P + counts.A;
  return { present: counts.P, absent: counts.A, percentage: recorded ? counts.P / recorded * 100 : null };
}

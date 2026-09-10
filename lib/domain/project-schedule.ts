import type { State } from '@/lib/types';
import { baseline } from './baseline';
import { calculateKpiProgress, plannedProgress } from './calculations';

export const mainTasks = [
  { id: '1', name: 'Mobilization, permits & survey', start: '2026-08-15', finish: '2026-08-24', packageId: 'mobilization' },
  { id: '2', name: 'Detailed layout & drawings', start: '2026-08-19', finish: '2026-08-29', packageId: 'drawings' },
  { id: '3', name: 'Irrigation installation & testing', start: '2026-08-29', finish: '2026-11-15', packageId: 'irrigation' },
  { id: '4', name: 'Post & tension-wire installation', start: '2026-08-29', finish: '2026-11-15', packageId: 'support' },
  { id: '5', name: 'Tree translocation & arrangement', start: '2026-10-01', finish: '2026-11-15', packageId: 'translocation' },
  { id: '6', name: 'Supply 3,500 trees', start: '2026-10-15', finish: '2026-11-25', packageId: 'new-trees' },
  { id: '7', name: 'Final testing & observation closure', start: '2026-11-26', finish: '2026-11-29', packageId: 'final-completion' },
  { id: '8', name: 'Final handover', start: '2026-11-29', finish: '2026-11-30', packageId: 'final-completion' },
];
export const irrigationTasks = [
  { id: '3.1', name: 'Trenching 160 mm', start: '2026-08-29', finish: '2026-09-09' },
  { id: '3.2', name: 'Installation 160 mm', start: '2026-08-29', finish: '2026-09-08' },
  { id: '3.3', name: 'Testing 160 mm', start: '2026-09-09', finish: '2026-09-12' },
  { id: '3.4', name: 'Trenching 110 mm', start: '2026-09-09', finish: '2026-09-15' },
  { id: '3.5', name: 'Installation 110 mm', start: '2026-09-15', finish: '2026-09-19' },
  { id: '3.6', name: 'Testing 110 mm', start: '2026-09-20', finish: '2026-09-23' },
  { id: '3.7', name: 'Installation 63 mm', start: '2026-09-21', finish: '2026-09-25' },
  { id: '3.8', name: 'Valves installation', start: '2026-09-21', finish: '2026-09-24' },
  { id: '3.9', name: 'Installation 20 mm', start: '2026-10-01', finish: '2026-11-15' },
  { id: '3.10', name: 'Irrigation testing', start: '2026-09-24', finish: '2026-11-15' },
];
export const supportTasks = [
  { id: '4.1', name: 'Drilling', start: '2026-08-29', finish: '2026-09-25' },
  { id: '4.2', name: 'Post & foundations installation', start: '2026-09-01', finish: '2026-10-20' },
  { id: '4.3', name: 'Tension-wire installation', start: '2026-10-04', finish: '2026-11-15' },
];

type ScheduleState = Pick<State, 'packages' | 'openingBalances' | 'submissions' | 'settings'>;

export function scheduleComparison(state: ScheduleState, today: string) {
  const settings = state.settings || baseline;
  // Read-only view model: never persist these dates or alter authoritative KPI inputs.
  const scheduled = state.packages.filter((p) => p.active !== false).map((p) => {
    const tasks = mainTasks.filter((task) => task.packageId === p.id);
    const schedule = tasks.length ? { start: tasks[0].start, finish: tasks[tasks.length - 1].finish } : null;
    return { ...p, activities: p.activities.filter((a) => a.active !== false).map((a) => ({ ...a, schedule })) };
  });
  const current = calculateKpiProgress(state.packages, state.openingBalances, state.submissions, settings).overall;
  const planned = plannedProgress(scheduled, today);
  const variance = planned == null ? null : current - planned;
  const status = variance == null ? 'Plan unavailable' : Math.abs(variance) < 0.05 ? 'On plan' : variance > 0 ? 'Ahead of plan' : 'Behind plan';
  const start = today < mainTasks[0].start ? today : mainTasks[0].start;
  const finish = today > mainTasks[7].finish ? today : mainTasks[7].finish;
  const days = Math.round((Date.parse(finish) - Date.parse(start)) / 86400000);
  const chart = Array.from({ length: days + 1 }, (_, i) => {
    const date = new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10);
    return { date, planned: plannedProgress(scheduled, date), current: date > today ? null : date === today ? current : calculateKpiProgress(state.packages, state.openingBalances, state.submissions, settings, date).overall };
  });
  return { current, planned, variance, status, chart };
}

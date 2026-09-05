import type {
  ActivityDefinition,
  PackageDefinition,
  Settings,
} from './baseline';
export type Item = {
  id: string;
  activityId: string;
  activityName?: string;
  unit?: string;
  quantity: number;
  adjustments: { quantity: number; createdAt: string }[];
};
export type OpeningBalance = {
  activityId: string;
  quantity: number;
  source: string;
  effectiveAt: string;
};
export type Submission = {
  id: string;
  supervisorId: string;
  supervisor: { name: string };
  status: string;
  workDate: string;
  createdAt: string;
  blockId: string | null;
  packageId: string;
  version: number;
  batchNumber?: string | null;
  remarks: string;
  items: Item[];
  photos: { id: string; name: string }[];
  approvals: { decision: string; comment: string; createdAt: string }[];
};
export type Block = {
  id: string;
  name: string;
  zoneId: string;
  capacity: number | null;
  irrigationTarget: number | null;
  supportRows: number | null;
  hold: boolean;
};
export const percent = (actual: number, target: number) =>
  target > 0 ? Math.min(100, Math.max(0, (actual / target) * 100)) : 0;
export function targetFor(a: ActivityDefinition, settings: Settings): number {
  if (a.target != null) return Number(a.target);
  if (a.targetKey === 'one') return 1;
  return Number(settings[a.targetKey as keyof Settings]) || 0;
}
export function approvedTotals(
  submissions: Submission[],
  asOf?: string,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const submission of submissions) {
    if (submission.status !== 'APPROVED') continue;
    const approval = submission.approvals.find(
      (a) => a.decision === 'APPROVED',
    );
    if (
      asOf &&
      (!approval ||
        approval.createdAt.slice(0, 10) > asOf ||
        submission.workDate.slice(0, 10) > asOf)
    )
      continue;
    for (const item of submission.items)
      totals[item.activityId] =
        (totals[item.activityId] || 0) +
        Number(item.quantity) +
        item.adjustments
          .filter((a) => !asOf || a.createdAt.slice(0, 10) <= asOf)
          .reduce((sum, a) => sum + Number(a.quantity), 0);
  }
  return totals;
}
export function validateWeights(values: { weight: number }[]) {
  return (
    values.length > 0 &&
    values.every(
      (v) => Number.isFinite(Number(v.weight)) && Number(v.weight) >= 0,
    ) &&
    Math.abs(values.reduce((n, v) => n + Number(v.weight), 0) - 100) < 0.00001
  );
}
export function progress(
  packages: PackageDefinition[],
  totals: Record<string, number>,
  settings: Settings,
) {
  const work = packages.map((p) => ({
    ...p,
    earned: p.activities.reduce(
      (n, a) => n + (percent(totals[a.id] || 0, targetFor(a, settings) || 100) * Number(a.weight)) / 100,
      0,
    ),
    progress: 0,
  }));
  for (const item of work)
    item.progress = item.weight > 0 ? (item.earned / Number(item.weight)) * 100 : 0;
  return {
    work,
    overall: work.reduce((n, p) => n + p.earned, 0),
  };
}

export function calculateKpiProgress(
  packages: PackageDefinition[],
  openingBalances: OpeningBalance[],
  submissions: Submission[],
  settings: Settings,
  asOf?: string,
) {
  const approved = approvedTotals(submissions, asOf);
  const opening = openingBalances.reduce<Record<string, number>>((totals, item) => {
    if (!asOf || item.effectiveAt.slice(0, 10) <= asOf)
      totals[item.activityId] = (totals[item.activityId] || 0) + Number(item.quantity);
    return totals;
  }, {});
  const totals = { ...opening };
  for (const [activityId, quantity] of Object.entries(approved))
    totals[activityId] = (totals[activityId] || 0) + quantity;
  const groups = packages
    .filter((item) => item.active !== false)
    .map((workPackage) => {
      const activities = workPackage.activities
        .filter((item) => item.active !== false)
        .map((activity) => {
          const target = targetFor(activity, settings) || 100;
          const quantity = totals[activity.id] || 0;
          const completion = percent(quantity, target);
          const earned = (completion * Number(activity.weight)) / 100;
          return {
            ...activity,
            target,
            quantity,
            remaining: Math.max(0, target - quantity),
            completion,
            earned,
          };
        });
      const weight = activities.reduce((sum, activity) => sum + Number(activity.weight), 0);
      const earned = activities.reduce((sum, activity) => sum + activity.earned, 0);
      return {
        ...workPackage,
        activities,
        weight,
        earned,
        progress: weight > 0 ? (earned / weight) * 100 : 0,
      };
    });
  const totalWeight = groups.reduce((sum, group) => sum + group.weight, 0);
  const overall = groups.reduce((sum, group) => sum + group.earned, 0);
  return { groups, work: groups, totals, totalWeight, overall, remaining: Math.max(0, totalWeight - overall) };
}
export function plannedProgress(
  packages: PackageDefinition[],
  day: string,
): number | null {
  const weighted = packages.flatMap((p) =>
    p.activities.filter((a) => Number(a.weight) > 0).map((a) => ({ a })),
  );
  if (!weighted.length || weighted.some(({ a }) => !a.schedule)) return null;
  const at = new Date(day).getTime();
  return weighted.reduce((n, { a }) => {
    const start = new Date(a.schedule!.start).getTime(),
      end = new Date(a.schedule!.finish).getTime();
    const fraction =
      at < start ? 0 : at >= end ? 1 : (at - start) / (end - start);
    return n + fraction * Number(a.weight);
  }, 0);
}
export function readiness(block: Block, submissions: Submission[]) {
  const totals = approvedTotals(
    submissions.filter((s) => s.blockId === block.id),
  );
  const irrigation =
    (totals.commissioned || 0) >= 1 && (totals.passed || 0) >= 1;
  const r = block.supportRows;
  const support =
    r != null &&
    r > 0 &&
    ['rows', 'cable', 'tensioned', 'inspected_rows', 'approved_rows'].every(
      (k) => (totals[k] || 0) >= r,
    ) &&
    ['holes', 'foundations', 'posts'].every((k) => (totals[k] || 0) >= r * 5);
  const occupied = (totals.placed || 0) + (totals.planted || 0);
  const ready = !block.hold && irrigation && support;
  const status = block.hold
    ? 'HOLD'
    : ready && block.capacity != null && occupied >= block.capacity
      ? 'COMPLETED'
      : ready && occupied > 0
        ? 'ACTIVE'
        : ready
          ? 'READY'
          : irrigation || support
            ? 'PARTIALLY READY'
            : Object.values(totals).some((n) => n > 0)
              ? 'IN PROGRESS'
              : 'NOT STARTED';
  const reasons = [
    block.hold ? 'Administrative hold' : '',
    !irrigation ? 'Irrigation commissioning / passed test required' : '',
    !support ? 'All support row stages and inspection approval required' : '',
    block.capacity == null ? 'Block capacity not configured' : '',
  ].filter(Boolean);
  return {
    ...block,
    totals,
    irrigation,
    support,
    ready,
    occupied,
    status,
    reasons,
    remaining: block.capacity == null ? null : block.capacity - occupied,
  };
}
export function productivity(
  submissions: Submission[],
  key: string,
  today: string,
  target: number,
) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - 6 + i);
    return d.toISOString().slice(0, 10);
  });
  const series = days.map((day) => ({
    date: day,
    quantity:
      approvedTotals(
        submissions.filter((s) => s.workDate.slice(0, 10) === day),
      )[key] || 0,
  }));
  const average = series.reduce((n, d) => n + d.quantity, 0) / 7;
  const total = approvedTotals(submissions)[key] || 0;
  const enough =
    series.filter((d) => d.quantity > 0).length >= 3 && average > 0;
  return {
    today: series[6].quantity,
    average,
    series,
    total,
    remaining: Math.max(0, target - total),
    forecastDays: enough
      ? Math.ceil(Math.max(0, target - total) / average)
      : null,
  };
}
export function assertStageOrder(totals: Record<string, number>) {
  const chains = [
    ['route', 'trench', 'pipe', 'backfill'],
    ['tested', 'passed', 'commissioned'],
    ['holes', 'foundations', 'posts'],
    ['rows', 'cable', 'tensioned', 'inspected_rows', 'approved_rows'],
    ['tree_inspected', 'loaded', 'transported', 'placed', 'irrigated'],
    [
      'sourced',
      'pre_inspected',
      'delivered',
      'planted',
      'new_irrigated',
      'new_inspected',
      'accepted',
    ],
  ];
  for (const chain of chains)
    for (let i = 1; i < chain.length; i++)
      if ((totals[chain[i]] || 0) > (totals[chain[i - 1]] || 0) + 0.000001)
        throw new Error(
          `${chain[i]} cannot exceed ${chain[i - 1]}. Include prerequisite quantities or approve earlier work first.`,
        );
  if ((totals.approved_rows || 0) * 5 > (totals.posts || 0))
    throw new Error(
      'Approved rows require five completed, aligned posts per row.',
    );
  for (const key of ['tested', 'passed', 'commissioned'])
    if ((totals[key] || 0) > 1)
      throw new Error(
        'A block cannot be tested / commissioned twice in physical-progress quantities. Record retests in Quality.',
      );
  if (Object.values(totals).some((n) => n < 0))
    throw new Error('Effective quantities cannot be negative.');
}

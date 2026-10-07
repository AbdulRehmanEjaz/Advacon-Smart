export type TreeProgressEntry = 'translocation' | 'placement';

export function treeProgressEntry(activityId: string): TreeProgressEntry {
  return ['kpi-translocation-placement', 'kpi-translocation-irrigation'].includes(activityId)
    ? 'placement'
    : 'translocation';
}

export function progressRequiresBlock(
  role: string,
  packageId: string,
  items: { activityId: string }[],
) {
  if (packageId === 'new-trees') return true;
  if (packageId !== 'translocation') return false;
  return role !== 'ADMIN' || items.some((item) => treeProgressEntry(item.activityId) === 'placement');
}

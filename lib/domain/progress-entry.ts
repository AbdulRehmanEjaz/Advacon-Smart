export type TreeProgressEntry = 'translocation' | 'placement';
export type SupplyProgressEntry = 'selection-transport' | 'offload-inspection';

export function supplyProgressEntry(activityId: string): SupplyProgressEntry {
  return ['kpi-new-offloading', 'kpi-new-handover'].includes(activityId)
    ? 'offload-inspection'
    : 'selection-transport';
}

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
  if (packageId === 'new-trees')
    return items.some((item) => supplyProgressEntry(item.activityId) === 'offload-inspection');
  if (packageId !== 'translocation') return false;
  return role !== 'ADMIN' || items.some((item) => treeProgressEntry(item.activityId) === 'placement');
}

export const baseline = {
  designCapacity: 13524,
  translocationTarget: 10000,
  translocationTargetIsApproximate: true,
  newTreeTarget: 3500,
  irrigationTarget: 17220,
  blockTarget: 19,
  rowTarget: 312,
  postTarget: 1560,
  valveTarget: 19,
  decoderTarget: 19,
  productivityMin: 250,
  productivityMax: 300,
  amberVariance: -2,
  redVariance: -5,
  pendingHours: 48,
};
export type Settings = typeof baseline;
export type ActivityDefinition = {
  id: string;
  packageId: string;
  name: string;
  unit: string;
  targetKey: string;
  weight: number;
  target?: number | null;
  schedule?: { start: string; finish: string } | null;
};
export type PackageDefinition = {
  id: string;
  name: string;
  weight: number;
  order: number;
  activities: ActivityDefinition[];
};
type Entry = [string, string, string, string, number];
function pkg(
  id: string,
  name: string,
  weight: number,
  order: number,
  rows: Entry[],
): PackageDefinition {
  return {
    id,
    name,
    weight,
    order,
    activities: rows.map(([key, title, unit, targetKey, w]) => ({
      id: key,
      packageId: id,
      name: title,
      unit,
      targetKey,
      weight: w,
    })),
  };
}
function checklist(prefix: string, names: string[]): Entry[] {
  const weight = Math.floor(100_000_000 / names.length) / 1_000_000;
  return names.map((name, i) => [
    `${prefix}_${i + 1}`,
    name,
    'milestone',
    'one',
    i === names.length - 1
      ? Number((100 - (names.length - 1) * weight).toFixed(6))
      : weight,
  ]);
}
export const packages: PackageDefinition[] = [
  pkg(
    'mobilization',
    'Mobilization, Permits & Survey',
    5,
    1,
    checklist('mobilization', [
      'Mobilization',
      'Access / permits',
      'Survey',
      'Block setting-out',
      'Row setting-out',
      'Network-route setting-out',
    ]),
  ),
  pkg(
    'drawings',
    'Detailed Layout & Drawings',
    5,
    2,
    checklist('drawings', [
      'Nursery layout',
      'Irrigation layout',
      'Block layout',
      'Support layout',
      'Detailed drawings',
      'Relevant approvals',
    ]),
  ),
  pkg('irrigation', 'Site Preparation & Irrigation', 25, 3, [
    ['route', 'Route prepared', 'm', 'irrigationTarget', 10],
    ['trench', 'Trench excavated', 'm', 'irrigationTarget', 15],
    ['pipe', 'HDPE pipeline installed', 'm', 'irrigationTarget', 35],
    ['valves', 'Valves installed', 'each', 'valveTarget', 7.5],
    ['decoders', 'Decoders installed', 'each', 'decoderTarget', 7.5],
    ['backfill', 'Backfilled & compacted', 'm', 'irrigationTarget', 10],
    ['tested', 'Block tested', 'block', 'blockTarget', 0],
    ['passed', 'Block test passed', 'block', 'blockTarget', 0],
    ['commissioned', 'Block commissioned', 'block', 'blockTarget', 15],
    ['points', 'Irrigation points installed', 'each', 'none', 0],
  ]),
  pkg('support', 'Tree Support System', 20, 4, [
    ['rows', 'Rows set out', 'row', 'rowTarget', 5],
    ['holes', 'Holes drilled', 'each', 'postTarget', 15],
    ['foundations', 'Foundations completed', 'each', 'postTarget', 20],
    ['posts', 'Posts installed & aligned', 'each', 'postTarget', 25],
    ['cable', 'Rows with cable installed', 'row', 'rowTarget', 10],
    ['tensioned', 'Rows tensioned', 'row', 'rowTarget', 10],
    ['inspected_rows', 'Rows inspected', 'row', 'rowTarget', 0],
    ['approved_rows', 'Rows approved', 'row', 'rowTarget', 15],
  ]),
  pkg('translocation', 'Tree Translocation & Placement', 30, 5, [
    ['tree_inspected', 'Trees inspected', 'tree', 'translocationTarget', 0],
    ['loaded', 'Trees loaded', 'tree', 'translocationTarget', 0],
    ['transported', 'Trees transported', 'tree', 'translocationTarget', 0],
    ['placed', 'Trees correctly placed', 'tree', 'translocationTarget', 100],
    [
      'irrigated',
      'Trees immediately irrigated',
      'tree',
      'translocationTarget',
      0,
    ],
    ['damaged', 'Trees damaged', 'tree', 'translocationTarget', 0],
    ['rejected_trees', 'Trees rejected', 'tree', 'translocationTarget', 0],
  ]),
  pkg('new-trees', 'New Tree Supply & Planting', 10, 6, [
    ['sourced', 'Trees sourced / approved', 'tree', 'newTreeTarget', 10],
    ['pre_inspected', 'Pre-delivery inspection', 'tree', 'newTreeTarget', 10],
    ['delivered', 'Trees delivered & off-loaded', 'tree', 'newTreeTarget', 20],
    ['planted', 'Trees planted / placed', 'tree', 'newTreeTarget', 35],
    [
      'new_irrigated',
      'Trees immediately irrigated',
      'tree',
      'newTreeTarget',
      10,
    ],
    ['new_inspected', 'Trees inspected', 'tree', 'newTreeTarget', 0],
    ['accepted', 'Planted trees accepted', 'tree', 'newTreeTarget', 15],
    ['new_rejected', 'Trees rejected', 'tree', 'newTreeTarget', 0],
    ['new_damaged', 'Trees damaged', 'tree', 'newTreeTarget', 0],
  ]),
  pkg(
    'testing',
    'Final Testing & Observation Closure',
    3,
    7,
    checklist('testing', [
      'Irrigation final checks',
      'Support final checks',
      'Tree stability verification',
      'Rectification',
      'Reinspection',
      'Observation closure',
      'Documentation',
    ]),
  ),
  pkg(
    'handover',
    'Final Handover',
    2,
    8,
    checklist('handover', [
      'Completion inspection',
      'Irrigation acceptance',
      'Support acceptance',
      'Tree relocation completion',
      'New tree completion',
      'Observation closure',
      'Record completion',
      'Final documentation',
      'Handover approval',
    ]),
  ),
];
export const zones = [
  { id: 'A', count: 6, capacity: 4416, spacing: 'Approx. 1.00 × 1.20 m' },
  { id: 'B', count: 9, capacity: 6912, spacing: 'Approx. 1.00 × 1.20 m' },
  { id: 'C', count: 2, capacity: 1080, spacing: 'Approx. 1.50 × 1.55 m' },
  { id: 'D', count: 2, capacity: 1116, spacing: 'Approx. 1.50 × 1.55 m' },
];

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
  active?: boolean;
  kpiVersion?: string;
  schedule?: { start: string; finish: string } | null;
};
export type PackageDefinition = {
  id: string;
  name: string;
  weight: number;
  order: number;
  active?: boolean;
  kpiVersion?: string;
  activities: ActivityDefinition[];
};

type Kpi = [string, string, string, number, number];
const VERSION = 'approved-2026-09';
function pkg(id: string, name: string, order: number, rows: Kpi[]): PackageDefinition {
  const activities = rows.map(([key, title, unit, target, weight]) => ({
    id: key,
    packageId: id,
    name: title,
    unit,
    targetKey: 'fixed',
    target,
    weight,
    active: true,
    kpiVersion: VERSION,
  }));
  return {
    id,
    name,
    weight: activities.reduce((sum, activity) => sum + activity.weight, 0),
    order,
    active: true,
    kpiVersion: VERSION,
    activities,
  };
}

export const packages: PackageDefinition[] = [
  pkg('mobilization', 'Mobilization', 1, [
    ['kpi-mobilization', 'Mobilization', 'Milestone', 1, 5],
  ]),
  pkg('drawings', 'Designs & Drawings', 2, [
    ['kpi-designs-drawings', 'Designs & Drawings', 'Milestone', 1, 5],
  ]),
  pkg('irrigation', '01. Site Preparation & Irrigation', 3, [
    ['kpi-irrigation-survey', 'Survey & Setting-Out', 'Survey Points', 328, 1],
    ['kpi-irrigation-trenching', 'Trenching & Excavation – Ø160 & Ø110 mm', 'm', 620, 4],
    ['kpi-irrigation-hdpe', 'HDPE Pipe Installation', 'm', 17070, 12],
    ['kpi-irrigation-valves', 'Valves, Decoders & Cabling', 'No.', 19, 3],
    ['kpi-irrigation-backfill', 'Backfilling & Compaction', 'm', 620, 2],
    ['kpi-irrigation-testing', 'Testing & Commissioning', 'Blocks', 19, 3],
  ]),
  pkg('support', '02. Tree Support System', 4, [
    ['kpi-support-survey', 'Survey & Setting-Out', 'Survey Points', 1560, 1],
    ['kpi-support-drilling', 'Drilling & Foundation Excavation', 'Holes', 1560, 4],
    ['kpi-support-foundation-posts', 'Concrete Foundation Works & Steel Support Post Installation', 'Posts/Foundations', 1560, 12],
    ['kpi-support-wire', 'Tension-Wire Installation', 'm', 17000, 6],
    ['kpi-support-alignment', 'Alignment & Final Inspection', 'Posts', 1560, 2],
  ]),
  pkg('translocation', '03. Tree Translocation & Placement', 5, [
    ['kpi-translocation-preparation', 'Tree Preparation', 'Trees', 10000, 4],
    ['kpi-translocation-loading', 'Loading Activities', 'Progress %', 10000, 4],
    ['kpi-translocation-transportation', 'Transportation', 'Progress %', 10000, 5],
    ['kpi-translocation-placement', 'Off-Loading & Placement', 'Progress %', 10000, 8],
    ['kpi-translocation-irrigation', 'Immediate Irrigation & Final Arrangement', 'Progress %', 10000, 4],
  ]),
  pkg('new-trees', '04. Supply of 3,500 Trees', 6, [
    ['kpi-new-selection', 'Tree Selection', 'Trees', 3500, 3],
    ['kpi-new-delivery', 'Transportation & Delivery', 'Progress %', 3500, 3],
    ['kpi-new-offloading', 'Off-Loading', 'Progress %', 3500, 1],
    ['kpi-new-handover', 'Inspection, Counting & Handover', 'Progress %', 3500, 3],
  ]),
  pkg('final-completion', 'Final Completion', 7, [
    ['kpi-final-handover', 'Final Testing, Documentation & Handover', 'Milestone', 1, 5],
  ]),
];

const opening: Record<string, number> = {
  'kpi-mobilization': 1,
  'kpi-designs-drawings': 1,
  'kpi-irrigation-survey': 150,
  'kpi-irrigation-trenching': 450,
  'kpi-irrigation-hdpe': 800,
  'kpi-support-survey': 800,
  'kpi-support-drilling': 480,
};
export const openingBalances = packages.flatMap((workPackage) =>
  workPackage.activities.map((activity) => ({
    activityId: activity.id,
    quantity: opening[activity.id] || 0,
    source: 'Approved KPI Tracker Opening Balance',
    effectiveAt: '2026-09-01T00:00:00.000Z',
  })),
);

export const zones = [
  { id: 'A', count: 6, capacity: 4416, spacing: 'Approx. 1.00 × 1.20 m' },
  { id: 'B', count: 9, capacity: 6912, spacing: 'Approx. 1.00 × 1.20 m' },
  { id: 'C', count: 2, capacity: 1080, spacing: 'Approx. 1.50 × 1.55 m' },
  { id: 'D', count: 2, capacity: 1116, spacing: 'Approx. 1.50 × 1.55 m' },
];

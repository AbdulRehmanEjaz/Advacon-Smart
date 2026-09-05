import { baseline, openingBalances, packages, zones } from '../domain/baseline';

const quote = (value: string | number | boolean | null) =>
  value == null
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : `'${String(value).replaceAll("'", "''")}'`;
const row = (values: (string | number | boolean | null)[]) =>
  `(${values.map(quote).join(',')})`;

export function baselineSql(timestamp = new Date().toISOString()) {
  return [
    `INSERT OR IGNORE INTO projects (id,name,created_at) VALUES ${row(['tree-project', 'Trees Translocation Project', timestamp])};`,
    `INSERT OR IGNORE INTO project_settings (project_id,design_capacity,translocation_target,translocation_target_is_approximate,new_tree_target,irrigation_target,block_target,row_target,post_target,valve_target,decoder_target,productivity_min,productivity_max,amber_variance,red_variance,pending_hours,updated_at) VALUES ${row(['tree-project', baseline.designCapacity, baseline.translocationTarget, Number(baseline.translocationTargetIsApproximate), baseline.newTreeTarget, baseline.irrigationTarget, baseline.blockTarget, baseline.rowTarget, baseline.postTarget, baseline.valveTarget, baseline.decoderTarget, baseline.productivityMin, baseline.productivityMax, baseline.amberVariance, baseline.redVariance, baseline.pendingHours, timestamp])};`,
    `INSERT OR IGNORE INTO users (id,name,role,active,created_at,updated_at) VALUES ${row(['initial-admin', 'Project Administrator', 'ADMIN', 1, timestamp, timestamp])},${row(['initial-foreman', 'Site Supervisor', 'FOREMAN', 1, timestamp, timestamp])};`,
    `INSERT OR IGNORE INTO zones (id,project_id,capacity,spacing) VALUES ${zones.map((zone) => row([zone.id, 'tree-project', zone.capacity, zone.spacing])).join(',')};`,
    `INSERT OR IGNORE INTO blocks (id,zone_id,name,hold) VALUES ${zones
      .flatMap((zone) =>
        Array.from({ length: zone.count }, (_, index) => {
          const id = zone.id + String(index + 1).padStart(2, '0');
          return row([id, zone.id, id, 0]);
        }),
      )
      .join(',')};`,
    `UPDATE work_packages SET active=0 WHERE kpi_version='legacy';`,
    `UPDATE activities SET active=0 WHERE kpi_version='legacy';`,
    `INSERT OR IGNORE INTO work_packages (id,project_id,name,weight,sort_order,active,kpi_version) VALUES ${packages.map((item) => row([item.id, 'tree-project', item.name, item.weight, item.order, 1, item.kpiVersion!])).join(',')};`,
    ...packages.map((item) =>
      `UPDATE work_packages SET name=${quote(item.name)},weight=${item.weight},sort_order=${item.order},active=1,kpi_version=${quote(item.kpiVersion!)} WHERE id=${quote(item.id)};`,
    ),
    `INSERT OR IGNORE INTO activities (id,package_id,name,unit,target_key,target,weight,active,kpi_version,direct_project_weight) VALUES ${packages
      .flatMap((item) =>
        item.activities.map((activity) =>
          row([
            activity.id,
            item.id,
            activity.name,
            activity.unit,
            activity.targetKey,
            activity.target ?? null,
            activity.weight,
            1,
            activity.kpiVersion!,
            activity.weight,
          ]),
        ),
      )
      .join(',')};`,
    ...packages.flatMap((item) =>
      item.activities.map((activity) =>
        `UPDATE activities SET package_id=${quote(item.id)},name=${quote(activity.name)},unit=${quote(activity.unit)},target_key=${quote(activity.targetKey)},target=${quote(activity.target ?? null)},weight=${activity.weight},active=1,kpi_version=${quote(activity.kpiVersion!)},direct_project_weight=${activity.weight} WHERE id=${quote(activity.id)};`,
      ),
    ),
    `INSERT OR IGNORE INTO kpi_opening_balances (activity_id,quantity,source,effective_at,created_at) VALUES ${openingBalances
      .map((item) => row([item.activityId, item.quantity, item.source, item.effectiveAt, timestamp]))
      .join(',')};`,
  ].join('\n');
}

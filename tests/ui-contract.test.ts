import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

await test('sidebar contract removes Quality and adds instant placeholder modules', async () => {
  const source = await readFile(new URL('../components/workspace.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\['quality',\s*'Quality'/);
  assert.match(source, /\['cost-control', 'Cost Control'/);
  assert.match(source, /\['timesheet', 'Timesheet'/);
  const dashboard = source.indexOf("['dashboard', 'Dashboard'");
  const progress = source.indexOf("['kpi-progress', 'Approved KPI Progress'");
  const approvals = source.indexOf("['approvals', 'Waiting for Approval'");
  assert.ok(dashboard >= 0 && dashboard < progress && progress < approvals);
});

await test('detailed KPI register lives only on its dedicated fast workspace view', async () => {
  const [dashboard, page, dataPages] = await Promise.all([
    readFile(new URL('../components/dashboard.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/approved-kpi-progress.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/data-pages.tsx', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(dashboard, /className="card kpi-detail-card"/);
  assert.match(dashboard, /href=\{href\('kpi-progress'\)\}/);
  assert.match(dashboard, /aria-label=\{arrowLabel/);
  assert.ok(dashboard.indexOf('Project Analytics') < dashboard.indexOf('Main Activity Progress'));
  assert.match(page, /Approved KPI Progress/);
  assert.match(page, /Official/);
  assert.match(page, /KPI \/ Sub-Activity/);
  assert.match(dataPages, /view === 'kpi-progress'/);
});

await test('new progress form has no active batch or photo controls', async () => {
  const source = await readFile(new URL('../components/progress-form.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /batchNumber|type="file"|uploadPhoto/);
  assert.match(source, /Site Supervisors can submit today only/);
  assert.match(source, /kpi-final-handover/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

await test('sidebar contract includes attendance and resource management modules', async () => {
  const source = await readFile(new URL('../components/workspace.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\['quality',\s*'Quality'/);
  assert.match(source, /\['cost-control', 'Cost Control'/);
  assert.match(source, /\['timesheet', 'Timesheet & Attendance'/);
  assert.match(source, /\['resources', 'Manpower & Equipment'/);
  const dashboard = source.indexOf("['dashboard', 'Dashboard'");
  const progress = source.indexOf("['kpi-progress', 'Approved KPI Progress'");
  const approvals = source.indexOf("['approvals', 'Waiting for Approval'");
  assert.ok(dashboard >= 0 && dashboard < progress && progress < approvals);
});

await test('manpower and equipment editor uses explicit form button types', async () => {
  const source = await readFile(
    new URL('../components/attendance.tsx', import.meta.url),
    'utf8',
  );
  const editorForm = source.match(/<form onSubmit=\{save\}>[\s\S]*?<\/form>/)?.[0] || '';
  assert.match(editorForm, /<Button type="submit" className="primary"/);
  assert.match(editorForm, /<button className="secondary" type="button"/);
  assert.match(editorForm, /Save record/);
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
  const mainActivity = dashboard.indexOf('Main Activity Progress');
  const analytics = dashboard.indexOf('Project Analytics');
  const recent = dashboard.indexOf('Recent Site Activity');
  assert.ok(mainActivity >= 0 && mainActivity < analytics && analytics < recent);
  assert.match(page, /Approved KPI Progress/);
  assert.match(page, /Official/);
  assert.match(page, /KPI \/ Sub-Activity/);
  assert.match(dataPages, /view === 'kpi-progress'/);
});

await test('dashboard uses a balanced package and activity grid without artificial sizing', async () => {
  const styles = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.match(styles, /\.main-activity-dashboard\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*0;/);
  assert.match(styles, /\.dashboard-primary-grid\s*\{[^}]*gap:\s*10px;[^}]*align-items:\s*start;[^}]*margin-bottom:\s*10px;/);
  assert.match(styles, /\.packages-card\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*1;/);
  assert.match(styles, /\.main-activity-dashboard\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1;/);
  assert.doesNotMatch(styles, /grid-template-areas:/);
});

await test('dashboard compacts top KPIs and keeps the live approval indicator on approvals only', async () => {
  const dashboard = await readFile(new URL('../components/dashboard.tsx', import.meta.url), 'utf8');
  const workspace = await readFile(new URL('../components/workspace.tsx', import.meta.url), 'utf8');
  assert.match(dashboard, /title="Remaining Progress"[\s\S]*?href=\{href\('kpi-progress'\)\}[\s\S]*?arrowLabel="Open Approved KPI Progress"/);
  assert.doesNotMatch(dashboard, /title="Pending Approval"/);
  assert.equal(dashboard.match(/Work Packages/g)?.length, 1);
  assert.match(dashboard, /<PackageProgressGauge value=\{p\.progress\} \/>/);
  assert.match(dashboard, /useState\('7 Days'\)/);
  assert.match(dashboard, /p\.earned\.toFixed\(2\).*earned.*p\.weight.*weight.*\(\{p\.name\}\)/);
  assert.match(dashboard, /Math\.abs\(value - 100\).*\? '100' : value\.toFixed\(2\)/);
  assert.equal(workspace.match(/pending > 0 && <i className="dot"/g)?.length, 1);
});

await test('new progress form has no active batch or photo controls', async () => {
  const source = await readFile(new URL('../components/progress-form.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /batchNumber|type="file"|uploadPhoto/);
  assert.match(source, /Site Supervisors can submit today only/);
  assert.match(source, /kpi-final-handover/);
});

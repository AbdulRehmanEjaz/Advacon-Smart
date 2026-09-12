import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

await test('login remains PIN-only and slideshow keeps two originals plus nine new photographs', async () => {
  const login = await readFile(new URL('../components/login.tsx', import.meta.url), 'utf8');
  const slideshow = await readFile(new URL('../components/login-slideshow.tsx', import.meta.url), 'utf8');
  assert.match(login, /<form onSubmit=\{submit\}/);
  assert.match(login, /JSON.stringify\(\{ pin \}\)/);
  assert.match(login, /\[0, 1, 2\]\.map/);
  assert.match(login, /data-filled=\{position < pin.length\}/);
  assert.match(login, /className="pin-indicators" aria-hidden="true"/);
  assert.match(login, /maxLength=\{3\}/);
  assert.match(login, /pattern="\[0-9\]\{3\}"/);
  assert.match(login, /type="password"/);
  assert.match(login, /inputMode="numeric"/);
  assert.match(login, /disabled=\{busy \|\| pin.length !== 3\}/);
  assert.match(login, /type="submit"/);
  assert.doesNotMatch(login, /name="(?:email|username)"/);
  assert.doesNotMatch(slideshow, /matchMedia|prefers-reduced-motion/);
  assert.match(slideshow, /active: 0, previous: null/);
  assert.match(slideshow, /clearInterval/);
  assert.match(login, /<h1>Tree Translocation Project - 336-A<\/h1>/);
  assert.match(slideshow, /, 3000\)/);
  assert.doesNotMatch(slideshow, /login-slide-pause|setPaused/);
  assert.doesNotMatch(slideshow, /canyon-tree\.jpg|desert-landscape\.jpg|harry\.jpg/);
  const filenames = ['big-deer.jpg', 'deer-cover.jpg', ...Array.from({ length: 9 }, (_, i) => `project-${i + 1}.png`)];
  assert.equal((slideshow.match(/src: '/g) || []).length, 11);
  for (const filename of filenames) {
    assert.ok(slideshow.includes(`/images/login/${filename}`));
    const image = await readFile(new URL(`../public/images/login/${filename}`, import.meta.url));
    assert.equal(image[0], filename.endsWith('.png') ? 0x89 : 0xff);
    assert.equal(image[1], filename.endsWith('.png') ? 0x50 : 0xd8);
  }
});

await test('sidebar starts collapsed with accessible links and keeps expanded group behavior', async () => {
  const source = await readFile(new URL('../components/workspace.tsx', import.meta.url), 'utf8');
  assert.match(source, /\[collapsed, setCollapsed\] = useState\(true\)/);
  assert.match(source, /aria-expanded=\{!collapsed\}/);
  assert.match(source, /hidden=\{!collapsed && !expanded\}/);
  assert.equal((source.match(/title=\{label\}/g) || []).length, 3);
  assert.equal((source.match(/aria-label=\{label\}/g) || []).length, 3);
  assert.match(source, /isAdmin \|\| \(!isViewer && id === 'daily'\)/);
  assert.match(source, /state\.user\.role === 'VIEWER'/);
  assert.match(source, /state\.user\.role === 'VIEWER'\) return/);
  assert.match(source, /!isViewer && <ProgressForm/);
});

await test('sidebar contract includes attendance and resource management modules', async () => {
  const source = await readFile(new URL('../components/workspace.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\['quality',\s*'Quality'/);
  assert.match(source, /\['cost-control', 'Cost Control'/);
  assert.match(source, /\['timesheet', 'Timesheet & Attendance'/);
  assert.match(source, /\['resources', 'Manpower & Equipment'/);
  assert.match(source, /\['viewers', 'Viewer Access'/);
  assert.match(source, /group: 'KPIs Management'/);
  assert.match(source, /group: 'Deliverables'/);
  assert.match(source, /group: 'Cost & Resources'/);
  assert.match(source, /group: 'Dashboard Settings'/);
  assert.match(source, /\['daily', 'Daily Submissions'/);
  assert.doesNotMatch(source, /\['daily', 'Daily Progress'/);
  assert.match(source, /aria-expanded=\{expanded\}/);
  assert.match(source, /<ChevronDown className="nav-group-chevron"/);
  const dashboard = source.indexOf("['dashboard', 'Dashboard'");
  const progress = source.indexOf("['kpi-progress', 'Approved KPI Progress'");
  const daily = source.indexOf("['daily', 'Daily Submissions'");
  const approvals = source.indexOf("['approvals', 'Waiting for Approval'");
  assert.ok(dashboard >= 0 && dashboard < progress && progress < daily && daily < approvals);
});

await test('cost control uses live resource data, explicit VAT messaging and official Riyal asset', async () => {
  const [source, css] = await Promise.all([
    readFile(new URL('../components/cost-control.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/globals.css', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /costSummary\(\{ throughDate,/);
  assert.match(source, /Total Recorded Project Cost — Including VAT/);
  assert.match(source, /Total Including VAT/);
  assert.match(source, /Invoices Total/);
  assert.match(source, /POs Total/);
  assert.match(source, /kind="INVOICE"/);
  assert.match(source, /kind="PO"/);
  assert.match(source, /Paid By/);
  assert.doesNotMatch(source, />Invoices & POs</);
  assert.match(css, /\.cost-kpi strong[^}]*font-size:\s*clamp\(28px, 2\.2vw, 34px\)/);
  assert.match(source, /Equipment Cost Analysis/);
  assert.match(css, /\/saudi-riyal-symbol\.svg/);
  assert.doesNotMatch(source, /manual manpower/i);
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
  assert.doesNotMatch(dashboard, /Main Activity Progress|Recent Site Activity/);
  assert.match(dashboard, /<CostKpiCards state=\{state\} dashboard/);
  assert.match(dataPages, /<BlockReadinessOverview state=\{state\}/);
  assert.match(dataPages, /Recent Site Activity/);
  assert.match(page, /Approved KPI Progress/);
  assert.match(page, /Official/);
  assert.match(page, /KPI \/ Sub-Activity/);
  assert.match(dataPages, /view === 'kpi-progress'/);
});

await test('task pages show official cumulative KPI totals instead of submission-only totals', async () => {
  const source = await readFile(
    new URL('../components/data-pages.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /<h2 className="card-title">Task Progress<\/h2>/);
  assert.match(source, /<th>Total Progress<\/th>/);
  assert.match(source, /<th>Target<\/th>[\s\S]*?<th>Completion<\/th>[\s\S]*?<th>Package Weight<\/th>/);
  assert.match(source, /\{p\.activities\.map/);
  assert.match(source, /value = a\.quantity/);
  assert.doesNotMatch(source, /Approved Stage Quantities|<th>Approved<\/th>|data-label="Approved"/);
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
  assert.doesNotMatch(dashboard, /title="Remaining Progress"/);
  assert.match(dashboard, /<ProgressGauge value=\{calculated.overall\}/);
  assert.match(dashboard, /remaining=\{calculated.remaining\}/);
  assert.match(dashboard, /Remaining Progress: <strong>\{remaining.toFixed\(2\)\}%/);
  assert.equal(dashboard.match(/Overall Project Progress/g)?.length, 1);
  assert.doesNotMatch(dashboard, /title="Overall Project Progress"/);
  assert.doesNotMatch(dashboard, /title="Pending Approval"/);
  assert.equal(dashboard.match(/Work Packages/g)?.length, 1);
  assert.match(dashboard, /<PackageProgressGauge value=\{p\.progress\} \/>/);
  assert.match(dashboard, /<ProgressComparisonCard state=\{state\} compact \/>/);
  assert.ok(dashboard.indexOf('<ProgressComparisonCard') < dashboard.indexOf('className="dashboard-primary-grid"'));
  assert.doesNotMatch(dashboard, /pending-widget|Review Approvals|All site submissions have been reviewed/);
  assert.doesNotMatch(dashboard, /Project Analytics|7 Days|30 Days|setRange|plannedProgress/);
  const schedule = await readFile(new URL('../components/project-schedule.tsx', import.meta.url), 'utf8');
  assert.match(schedule, /<ProgressComparisonCard state=\{state\} \/>/);
  assert.equal(schedule.match(/scheduleComparison\(state, today\)/g)?.length, 1);
  assert.match(schedule, /ReferenceLine x=\{today\}/);
  assert.match(schedule, /!compact && <p>Approved baseline/);
  assert.match(schedule, /!compact && <p className="card-subtitle">Plan uses/);
  assert.match(dashboard, /p\.earned\.toFixed\(2\).*earned.*p\.weight.*weight.*\(\{p\.name\}\)/);
  assert.match(dashboard, /Math\.abs\(value - 100\).*\? '100' : value\.toFixed\(2\)/);
  assert.equal(workspace.match(/pending > 0 && <i className="dot"/g)?.length, 1);
  assert.match(workspace, /activeView !== 'dashboard' && <header className="toolbar">/);
  assert.match(workspace, /activeView === 'dashboard' && isAdmin && \(/);
  assert.match(workspace, /className="secondary dashboard-approval-shortcut"\s+href=\{href\('approvals'\)\}/);
  assert.match(workspace, /pending > 0 && <span className="dashboard-approval-count"/);
  assert.match(workspace, /query && activeView !== 'dashboard'/);
});

await test('new progress form has no active batch or photo controls', async () => {
  const source = await readFile(new URL('../components/progress-form.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /batchNumber|type="file"|uploadPhoto/);
  assert.match(source, /Site Supervisors can submit today only/);
  assert.match(source, /kpi-final-handover/);
});

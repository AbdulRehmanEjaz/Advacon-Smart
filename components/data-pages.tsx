'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  ArrowDownToLine,
  Plus,
  Printer,
  ClipboardCheck,
  Leaf,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Kpi } from './dashboard';
import { Editor, type Field, Modal, ProgressForm } from './progress-form';
import { Supervisors } from './supervisors';
import { ApprovedKpiProgress } from './approved-kpi-progress';
import { ResourcesPage, TimesheetPage } from './attendance';
import { CostControlPage } from './cost-control';
import {
  calculateKpiProgress,
  productivity,
  readiness,
  type Submission,
} from '@/lib/domain/calculations';
import { type State, number, today, post } from '@/lib/types';
type Props = {
  state: State;
  view: string;
  query: string;
  refresh: () => Promise<void>;
  preview: boolean;
  detailLoading?: boolean;
};
type Edit = {
  title: string;
  description: string;
  fields: Field[];
  initial: Record<string, unknown>;
  path: string;
  transform?: (v: Record<string, unknown>) => unknown;
};
const commentField: Field = {
  key: 'reason',
  label: 'Reason for change',
  type: 'textarea',
  required: true,
  hint: 'A permanent record of this change is kept in the audit log.',
};
export function DataPages(props: Props) {
  const { state, view, preview, refresh } = props;
  const [edit, setEdit] = useState<Edit | null>(null);
  const admin = state.user.role === 'ADMIN';
  const pkg = state.packages.find((p) => p.id === view);
  let content;
  if (['approvals', 'daily', 'search'].includes(view))
    content = <Submissions {...props} />;
  else if (view === 'kpi-progress')
    content = <ApprovedKpiProgress state={state} />;
  else if (view === 'reports')
    content = <OfficialReport state={state} />;
  else if (view === 'timesheet')
    content = props.detailLoading && !state.manpower
      ? <section className="card shell-loading">Loading attendance…</section>
      : <TimesheetPage state={state} refresh={refresh} preview={preview} />;
  else if (view === 'resources')
    content = props.detailLoading && !state.manpower
      ? <section className="card shell-loading">Loading resources…</section>
      : <ResourcesPage state={state} refresh={refresh} preview={preview} />;
  else if (view === 'cost-control')
    content = props.detailLoading && !state.fuelRecords
      ? <section className="card shell-loading">Loading cost control…</section>
      : <CostControlPage state={state} refresh={refresh} preview={preview} />;
  else if (view === 'blocks')
    content = (
      <>
        <div className="notice info">
          Block-level capacities and row / irrigation allocations must be
          entered from the approved design. Zone totals are fixed; no equal
          distribution has been assumed.
        </div>
        <div className="two-columns">
          {state.zones?.map((zone) => (
            <section className="card" key={zone.id}>
              <div className="card-heading">
                <div>
                  <h2 className="card-title">Zone {zone.id}</h2>
                  <p className="card-subtitle">
                    {number(zone.capacity)} tree capacity · {zone.spacing}
                  </p>
                </div>
                <span className="badge">
                  {state.blocks.filter((b) => b.zoneId === zone.id).length}{' '}
                  blocks
                </span>
              </div>
              {state.blocks
                .filter((b) => b.zoneId === zone.id)
                .map((b) => {
                  const r = readiness(b, state.submissions);
                  return (
                    <div className="form-section" key={b.id} id={b.id}>
                      <div className="card-heading">
                        <strong>{b.id}</strong>
                        <Badge status={r.status} />
                      </div>
                      <div className="detail-grid">
                        <div>
                          <dt>Design capacity</dt>
                          <dd>{b.capacity ?? 'Not configured'}</dd>
                        </div>
                        <div>
                          <dt>Trees placed / remaining</dt>
                          <dd>
                            {number(r.occupied)} /{' '}
                            {r.remaining == null ? '—' : number(r.remaining)}
                          </dd>
                        </div>
                        <div>
                          <dt>Irrigation</dt>
                          <dd>
                            {r.irrigation
                              ? 'Commissioned'
                              : `${number(r.totals.pipe)} / ${b.irrigationTarget == null ? '—' : number(b.irrigationTarget)} m`}
                          </dd>
                        </div>
                        <div>
                          <dt>Approved support rows</dt>
                          <dd>
                            {number(r.totals.approved_rows)} /{' '}
                            {b.supportRows ?? '—'}
                          </dd>
                        </div>
                      </div>
                      <p className="card-subtitle">
                        {r.reasons.join(' · ') ||
                          'All readiness prerequisites satisfied.'}
                      </p>
                      <button
                        className="text-button section-spacer"
                        disabled={preview}
                        onClick={() =>
                          setEdit({
                            title: `Configure block ${b.id}`,
                            description:
                              'Release requires commissioned irrigation and every support row approved. Holds prevent new placements.',
                            path: 'block',
                            initial: { ...b, reason: '' },
                            fields: [
                              {
                                key: 'capacity',
                                label: 'Design capacity (trees)',
                                type: 'number',
                                min: 0,
                              },
                              {
                                key: 'irrigationTarget',
                                label: 'Irrigation allocation (m)',
                                type: 'number',
                                min: 0,
                                step: '.001',
                              },
                              {
                                key: 'supportRows',
                                label: 'Design support rows',
                                type: 'number',
                                min: 0,
                              },
                              {
                                key: 'hold',
                                label: 'Place block on hold',
                                type: 'checkbox',
                              },
                              commentField,
                            ],
                          })
                        }
                      >
                        Configure block <ArrowRight size={12} />
                      </button>
                    </div>
                  );
                })}
            </section>
          ))}
        </div>
      </>
    );
  else if (pkg && admin) {
    const settings = state.settings!,
      p = calculateKpiProgress(
        [pkg],
        state.openingBalances,
        state.submissions,
        settings,
      ).work[0],
      tree = pkg.id === 'translocation',
      newTree = pkg.id === 'new-trees',
      production = productivity(
        state.submissions,
        tree ? 'kpi-translocation-placement' : 'kpi-new-handover',
        today(),
        Number(tree ? settings.translocationTarget : settings.newTreeTarget),
      );
    content = (
      <>
        <div className="kpi-grid">
          <Kpi
            title="Work Package Progress"
            value={`${p.progress.toFixed(2)}%`}
            footer={`${number(pkg.weight)}% of overall project`}
            featured
          />
          <Kpi
            title="Approved submissions"
            value={number(
              state.submissions.filter(
                (s) => s.packageId === pkg.id && s.status === 'APPROVED',
              ).length,
            )}
            footer="Included in physical progress"
          />
          <Kpi
            title="Waiting for approval"
            value={number(
              state.submissions.filter(
                (s) => s.packageId === pkg.id && s.status === 'WAITING',
              ).length,
            )}
            footer="Excluded from official progress"
          />
          <Kpi
            title={
              tree || newTree ? 'Remaining trees' : 'Contribution to project'
            }
            value={
              tree || newTree
                ? number(production.remaining)
                : `${p.earned.toFixed(2)}%`
            }
            footer={
              tree
                ? `${settings.translocationTargetIsApproximate ? 'Approximate ' : ''}${number(settings.translocationTarget)}-tree baseline`
                : newTree
                  ? 'Accepted planting, not delivery alone'
                  : 'Weighted approved completion'
            }
          />
        </div>
        {(tree || newTree) && (
          <div className="notice info">
            {production.forecastDays == null
              ? 'Insufficient approved production data for a completion forecast.'
              : `Forecast: ${production.forecastDays} more days at the seven-day approved average (${number(production.average)}/day).`}
          </div>
        )}
        <section className="card">
          <div className="card-heading">
            <div>
              <h2 className="card-title">Task Progress</h2>
              <p className="card-subtitle">
                Official cumulative progress · waiting, returned and rejected submissions are excluded
              </p>
            </div>
            <Leaf color="#087443" size={20} />
          </div>
          <table className="responsive-table">
            <thead>
              <tr>
                <th>Stage</th>
                <th>Total Progress</th>
                <th>Target</th>
                <th>Completion</th>
                <th>Package Weight</th>
              </tr>
            </thead>
            <tbody>
              {p.activities.map((a) => {
                const target = a.target,
                  value = a.quantity;
                return (
                  <tr key={a.id}>
                    <td data-label="Stage">{a.name}</td>
                    <td data-label="Total Progress">
                      {number(value)} {a.unit}
                    </td>
                    <td data-label="Target">
                      {target ? number(target) : 'Tracking only'}
                    </td>
                    <td data-label="Completion">
                      {target ? `${a.completion.toFixed(1)}%` : '—'}
                      {target > 0 && value > target && <Badge status="HOLD" />}
                    </td>
                    <td data-label="Package Weight">{number(a.weight)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <div className="section-spacer">
          <Submissions {...props} fixedPackage={pkg.id} />
        </div>
      </>
    );
  } else if (view === 'supervisors')
    content = <Supervisors state={state} refresh={refresh} preview={preview} />;
  else if (view === 'schedule')
    content = (
      <section className="card">
        <div className="notice info">
          Planned progress uses a transparent linear schedule for each weighted
          activity. The project planned percentage stays unavailable until all
          weighted activities have dates.
        </div>
        {state.packages.map((p) => (
          <div className="form-section" key={p.id}>
            <h3>{p.name}</h3>
            <table className="responsive-table">
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>Start</th>
                  <th>Finish</th>
                  <th>Schedule</th>
                </tr>
              </thead>
              <tbody>
                {p.activities
                  .filter((a) => Number(a.weight) > 0)
                  .map((a) => (
                    <tr key={a.id}>
                      <td data-label="Activity">{a.name}</td>
                      <td data-label="Start">
                        {a.schedule?.start.slice(0, 10) || 'Not configured'}
                      </td>
                      <td data-label="Finish">
                        {a.schedule?.finish.slice(0, 10) || '—'}
                      </td>
                      <td data-label="Schedule">
                        <button
                          className="text-button"
                          disabled={preview}
                          onClick={() =>
                            setEdit({
                              title: 'Set activity schedule',
                              description: a.name,
                              path: 'schedule',
                              initial: {
                                start: a.schedule?.start.slice(0, 10) || '',
                                finish: a.schedule?.finish.slice(0, 10) || '',
                                reason: '',
                              },
                              fields: [
                                {
                                  key: 'start',
                                  label: 'Planned start',
                                  type: 'date',
                                  required: true,
                                },
                                {
                                  key: 'finish',
                                  label: 'Planned finish',
                                  type: 'date',
                                  required: true,
                                },
                                commentField,
                              ],
                              transform: (v) => ({
                                activities: [
                                  {
                                    id: a.id,
                                    start: v.start,
                                    finish: v.finish,
                                  },
                                ],
                                reason: v.reason,
                              }),
                            })
                          }
                        >
                          Edit dates
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>
    );
  else if (view === 'settings') {
    content = (
      <section className="card">
        <div className="card-heading">
          <div>
            <h2 className="card-title">Approved KPI Baseline</h2>
            <p className="card-subtitle">
              Official targets and direct project weights are controlled and read-only.
            </p>
          </div>
          <span className="badge approved">Locked · 100%</span>
        </div>
        {state.packages.map((p) => (
          <div className="form-section" key={p.id}>
            <div className="card-heading"><strong>{p.name}</strong><span>{number(p.weight)}%</span></div>
            {p.activities.map((a) => (
              <div className="package-row" key={a.id}>
                <span style={{ flex: 1 }}>{a.name}<small className="card-subtitle">Target: {number(a.target || 100)} {a.unit}</small></span>
                <strong>{number(a.weight)}%</strong>
              </div>
            ))}
          </div>
        ))}
      </section>
    );
  } else if (view === 'quality')
    content = <Quality {...props} setEdit={setEdit} />;
  else if (view === 'audit')
    content = <Audit state={state} loading={Boolean(props.detailLoading)} />;
  else
    content = (
      <div className="card empty-note">
        This page is not available.
        <br />
        <Link href="/workspace/dashboard" className="text-button">
          Return to Dashboard
        </Link>
      </div>
    );
  return (
    <>
      {content}
      {edit && (
        <Editor {...edit} onClose={() => setEdit(null)} onSaved={refresh} />
      )}
    </>
  );
}
function OfficialReport({ state }: { state: State }) {
  const result = calculateKpiProgress(
    state.packages,
    state.openingBalances,
    state.submissions,
    state.settings!,
  );
  return (
    <section className="card">
      <div className="card-heading">
        <div><h2 className="card-title">Official Approved Progress Report</h2><p className="card-subtitle">Includes normalized opening balances and approved future work only.</p></div>
        <strong>{result.overall.toFixed(2)}%</strong>
      </div>
      <div className="table-scroll">
        <table className="responsive-table">
          <thead><tr><th>Group / KPI</th><th>Target</th><th>Approved progress</th><th>Remaining</th><th>Weight</th><th>Completion</th><th>Earned</th></tr></thead>
          <tbody>
            {result.groups.flatMap((group) => [
              <tr className="kpi-group-row" key={`report-${group.id}`}><td colSpan={7}><strong>{group.name}</strong> · {group.earned.toFixed(4)}% earned</td></tr>,
              ...group.activities.map((activity) => (
                <tr key={activity.id}>
                  <td data-label="KPI">{activity.name}</td>
                  <td data-label="Target">{number(activity.target)} {activity.unit}</td>
                  <td data-label="Approved progress">{number(activity.quantity)}</td>
                  <td data-label="Remaining">{number(activity.remaining)}</td>
                  <td data-label="Weight">{activity.weight}%</td>
                  <td data-label="Completion">{activity.completion.toFixed(2)}%</td>
                  <td data-label="Earned">{activity.earned.toFixed(4)}%</td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function Submissions({
  state,
  view,
  query,
  refresh,
  preview,
  fixedPackage,
}: Props & { fixedPackage?: string }) {
  const [now] = useState(() => Date.now());
  const [search, setSearch] = useState(''),
    [status, setStatus] = useState(''),
    [zone, setZone] = useState(''),
    [block, setBlock] = useState(''),
    [supervisor, setSupervisor] = useState(''),
    [pkg, setPackage] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState<Submission | null>(null),
    [editing, setEditing] = useState<Submission | undefined>();
  const filtered = state.submissions.filter(
    (s) =>
      (view !== 'approvals' || s.status === 'WAITING') &&
      (!fixedPackage || s.packageId === fixedPackage) &&
      (!status || s.status === status) &&
      (!zone || s.blockId?.startsWith(zone)) &&
      (!block || s.blockId === block) &&
      (!supervisor || s.supervisorId === supervisor) &&
      (!pkg || s.packageId === pkg) &&
      (!from || s.workDate.slice(0, 10) >= from) &&
      (!to || s.workDate.slice(0, 10) <= to) &&
      `${s.id} ${s.batchNumber || ''} ${s.blockId} ${s.supervisor.name} ${s.remarks} ${state.packages.find((p) => p.id === s.packageId)?.name} ${s.items.map((i) => state.packages.flatMap((p) => p.activities).find((a) => a.id === i.activityId)?.name).join(' ')}`
        .toLowerCase()
        .includes((query || search).toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 10)),
    current = Math.min(page, pages - 1);
  const admin = state.user.role === 'ADMIN';
  function csv() {
    const safe = (v: unknown) => {
      let s =
        typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replaceAll('"', '""') + '"';
    };
    const rows = [
      [
        'Submission',
        'Date',
        'Supervisor',
        'Zone',
        'Block',
        'Package',
        'Status',
        'Activity',
        'Submitted quantity',
        'Adjustment',
        'Effective quantity',
        'Unit',
        'Batch',
        'Remarks',
      ],
      ...filtered.flatMap((s) =>
        s.items.map((i) => {
          const activity = state.packages
            .flatMap((p) => p.activities)
            .find((a) => a.id === i.activityId);
          const correction = i.adjustments.reduce(
            (n, a) => n + Number(a.quantity),
            0,
          );
          return [
            s.id,
            s.workDate.slice(0, 10),
            s.supervisor.name,
            s.blockId?.[0] || '',
            s.blockId || '',
            state.packages.find((p) => p.id === s.packageId)?.name,
            s.status,
            activity?.name,
            i.quantity,
            correction,
            Number(i.quantity) + correction,
            activity?.unit,
            s.batchNumber,
            s.remarks,
          ];
        }),
      ),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ['\ufeff' + rows.map((r) => r.map(safe).join(',')).join('\r\n')],
        { type: 'text/csv;charset=utf-8' },
      ),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `tree-control-${today()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <section className="card">
        <div className="card-heading">
          <div>
            <h2 className="card-title">
              {view === 'approvals'
                ? `${filtered.length} Pending`
                : view === 'reports'
                  ? 'Project Report'
                  : view === 'search'
                    ? 'Search Results'
                    : 'Site Submissions'}
            </h2>
            <p className="card-subtitle">
              {view === 'approvals'
                ? 'Review site quantities before they enter the official progress record.'
                : `${filtered.length} records · ${admin ? 'All supervisors' : 'Your submissions only'}`}
            </p>
          </div>
          {view === 'reports' && (
            <div className="heading-actions">
              <a className="secondary" href="/api/report.pdf" download>
                <ArrowDownToLine size={13} />
                PDF
              </a>
              <button className="secondary" onClick={csv}>
                <ArrowDownToLine size={13} />
                CSV
              </button>
              <button className="secondary" onClick={() => window.print()}>
                <Printer size={13} />
                Print
              </button>
            </div>
          )}
        </div>
        <div className="table-toolbar">
          <input
            aria-label="Filter submissions"
            placeholder="Search block, batch, activity…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
          {view !== 'approvals' && (
            <select
              aria-label="Status filter"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              {['WAITING', 'APPROVED', 'RETURNED', 'REJECTED'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          )}
          <select
            aria-label="Zone filter"
            value={zone}
            onChange={(e) => {
              setZone(e.target.value);
              setBlock('');
            }}
          >
            <option value="">All zones</option>
            {['A', 'B', 'C', 'D'].map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
          <select
            aria-label="Block filter"
            value={block}
            onChange={(e) => setBlock(e.target.value)}
          >
            <option value="">All blocks</option>
            {state.blocks
              .filter((b) => !zone || b.zoneId === zone)
              .map((b) => (
                <option key={b.id}>{b.id}</option>
              ))}
          </select>
          {admin && (
            <select
              aria-label="Supervisor filter"
              value={supervisor}
              onChange={(e) => setSupervisor(e.target.value)}
            >
              <option value="">All supervisors</option>
              {state.users?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          )}
          {!fixedPackage && (
            <select
              aria-label="Work package filter"
              value={pkg}
              onChange={(e) => setPackage(e.target.value)}
            >
              <option value="">All packages</option>
              {state.packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <input
            type="date"
            aria-label="From date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <input
            type="date"
            aria-label="To date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <table className="responsive-table">
          <thead>
            <tr>
              <th>Submission / Supervisor</th>
              <th>Work date</th>
              <th>Block</th>
              <th>Work package</th>
              <th>Status</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(current * 10, current * 10 + 10).map((s) => (
              <tr key={s.id}>
                <td data-label="Supervisor">
                  {s.supervisor.name}
                  <small>{s.id.slice(-8).toUpperCase()}</small>
                </td>
                <td data-label="Work date">{s.workDate.slice(0, 10)}</td>
                <td data-label="Block">{s.blockId || 'Project-wide'}</td>
                <td data-label="Work package">
                  {state.packages.find((p) => p.id === s.packageId)?.name || 'Legacy work package'}
                </td>
                <td data-label="Status">
                  <Badge status={s.status} />
                  {s.status === 'WAITING' &&
                    now - new Date(s.createdAt).getTime() >
                      Number(state.settings?.pendingHours || 48) * 3600000 && (
                      <small>Awaiting review too long</small>
                    )}
                </td>
                <td data-label="Details">
                  <button
                    className="text-button"
                    onClick={() => setSelected(s)}
                  >
                    View <ArrowRight size={12} />
                  </button>
                  {s.status === 'RETURNED' &&
                    s.supervisorId === state.user.id && (
                      <button
                        className="text-button"
                        style={{ marginLeft: 12 }}
                        disabled={preview}
                        onClick={() => setEditing(s)}
                      >
                        Revise
                      </button>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <div className="empty-note">
            <ClipboardCheck size={30} />
            {view === 'approvals'
              ? 'All site submissions have been reviewed.'
              : 'No submissions match these filters.'}
          </div>
        )}
        <div className="pagination">
          <span>
            Page {current + 1} of {pages}
          </span>
          <div style={{ display: 'flex', gap: 15 }}>
            <button
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </button>
            <button
              disabled={current >= pages - 1}
              onClick={() => setPage(current + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
      {selected && (
        <Review
          state={state}
          submission={selected}
          refresh={refresh}
          onClose={() => setSelected(null)}
          preview={preview}
        />
      )}
      <ProgressForm
        state={state}
        open={Boolean(editing)}
        editing={editing}
        onClose={() => setEditing(undefined)}
        onSaved={refresh}
      />
    </>
  );
}
function Review({
  state,
  submission: s,
  refresh,
  onClose,
  preview,
}: {
  state: State;
  submission: Submission;
  refresh: () => Promise<void>;
  onClose: () => void;
  preview: boolean;
}) {
  const [comment, setComment] = useState(''),
    [override, setOverride] = useState(''),
    [decision, setDecision] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [adjust, setAdjust] = useState<Edit | null>(null);
  async function review() {
    setBusy(true);
    try {
      await post('review', {
        id: s.id,
        version: s.version,
        decision,
        comment,
        overrideReason: override || undefined,
      });
      await refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed.');
      setDecision('');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Submission Details"
      description={`${s.id} · Version ${s.version}`}
      open
      onClose={onClose}
    >
      <Badge status={s.status} />
      <dl className="detail-grid">
        <div>
          <dt>Supervisor</dt>
          <dd>{s.supervisor.name}</dd>
        </div>
        <div>
          <dt>Date / block</dt>
          <dd>
            {s.workDate.slice(0, 10)} · {s.blockId ? `Zone ${s.blockId[0]} / ${s.blockId}` : 'Project-wide'}
          </dd>
        </div>
        <div>
          <dt>Work package</dt>
          <dd>{state.packages.find((p) => p.id === s.packageId)?.name || 'Legacy work package'}</dd>
        </div>
        <div>
          <dt>Submitted</dt>
          <dd>{new Date(s.createdAt).toLocaleString()}</dd>
        </div>
        {s.batchNumber && <div>
          <dt>Historical batch / inspection reference</dt>
          <dd>{s.batchNumber}</dd>
        </div>}
      </dl>
      <table className="responsive-table">
        <thead>
          <tr>
            <th>Quantity</th>
            <th>Submitted</th>
            <th>Adjusted total</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {s.items.map((i) => {
            const a = state.packages
              .flatMap((p) => p.activities)
              .find((a) => a.id === i.activityId);
            return (
              <tr key={i.id}>
                <td data-label="Activity">{a?.name || i.activityName || i.activityId}</td>
                <td data-label="Submitted">
                  {number(i.quantity)} {a?.unit || i.unit}
                </td>
                <td data-label="Effective">
                  {number(
                    Number(i.quantity) +
                      i.adjustments.reduce((n, a) => n + Number(a.quantity), 0),
                  )}
                </td>
                <td data-label="Action">
                  {s.status === 'APPROVED' && state.user.role === 'ADMIN' && (
                    <button
                      className="text-button"
                      disabled={preview}
                      onClick={() =>
                        setAdjust({
                          title: 'Adjust approved quantity',
                          description:
                            'Original quantities remain unchanged. This signed correction is appended to the record.',
                          path: 'adjustment',
                          initial: {
                            requestKey: crypto.randomUUID(),
                            itemId: i.id,
                            quantity: 0,
                            reason: '',
                          },
                          fields: [
                            {
                              key: 'quantity',
                              label: 'Signed correction (+ / −)',
                              type: 'number',
                              step: a?.unit === 'm' ? '.001' : '1',
                              required: true,
                            },
                            commentField,
                            {
                              key: 'overrideReason',
                              label:
                                'Administrator override reason (if target/readiness exceeded)',
                              type: 'textarea',
                            },
                          ],
                        })
                      }
                    >
                      Adjust
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="form-section">
        <h3>Remarks</h3>
        <p>{s.remarks || 'No remarks provided.'}</p>
      </div>
      {s.photos.length > 0 && (
        <div className="form-section">
          <h3>Site Photos</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {s.photos.map((p) => (
              <a
                key={p.id}
                href={`/api/photos/${p.id}`}
                target="_blank"
                rel="noreferrer"
              >
                <Image
                  unoptimized
                  src={`/api/photos/${p.id}`}
                  alt={p.name}
                  width={100}
                  height={80}
                  style={{ objectFit: 'cover', borderRadius: 8 }}
                />
              </a>
            ))}
          </div>
        </div>
      )}
      {s.approvals.map((a, i) => (
        <div className="notice info" key={i}>
          <div>
            <strong>
              {a.decision} · {new Date(a.createdAt).toLocaleString()}
            </strong>
            <p>{a.comment || 'No review comment.'}</p>
          </div>
        </div>
      ))}
      {s.status === 'WAITING' && state.user.role === 'ADMIN' && (
        <>
          <label className="field section-spacer">
            Review comment
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Required when returning or rejecting"
              maxLength={2000}
            />
          </label>
          <label className="field section-spacer">
            Readiness / target override reason
            <textarea
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              maxLength={2000}
              placeholder="Only when an explicit administrator override is necessary"
            />
          </label>
          {decision ? (
            <div className="notice section-spacer">
              <div>
                <strong>Confirm {decision.toLowerCase()}?</strong>
                <p>
                  {decision === 'APPROVED'
                    ? 'These quantities will enter official project progress.'
                    : 'This decision and your comment will be visible to the supervisor.'}
                </p>
                <div className="review-actions">
                  <Button
                    className="primary"
                    disabled={busy || preview}
                    onClick={review}
                  >
                    {busy ? 'Saving…' : 'Confirm decision'}
                  </Button>
                  <button className="secondary" onClick={() => setDecision('')}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="review-actions">
              <Button
                className="primary"
                disabled={preview}
                onClick={() => setDecision('APPROVED')}
              >
                Approve
              </Button>
              <button
                className="secondary warning"
                disabled={preview}
                onClick={() => setDecision('RETURNED')}
              >
                Return
              </button>
              <button
                className="secondary danger"
                disabled={preview}
                onClick={() => setDecision('REJECTED')}
              >
                Reject
              </button>
            </div>
          )}
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {adjust && (
        <Editor
          {...adjust}
          onClose={() => setAdjust(null)}
          onSaved={async () => {
            await refresh();
            onClose();
          }}
        />
      )}
    </Modal>
  );
}
function Quality({
  state,
  preview,
  setEdit,
}: Props & { setEdit: (edit: Edit) => void }) {
  const inspections = state.inspections || [],
    observations = inspections.flatMap((i) => i.observations),
    open = observations.filter((o) => !o.closedAt),
    overdue = open.filter((o) => o.dueDate.slice(0, 10) < today()),
    first = inspections.filter((i) => i.firstAttempt);
  return (
    <>
      <div className="kpi-grid">
        <Kpi
          title="First-time Pass Rate"
          value={
            first.length
              ? `${((first.filter((i) => i.result === 'PASSED').length / first.length) * 100).toFixed(1)}%`
              : '—'
          }
          footer="Recorded first inspections"
          featured
        />
        <Kpi
          title="Reinspections"
          value={number(
            inspections.filter((i) => i.result === 'REINSPECTION').length,
          )}
          footer="Recorded inspection outcomes"
        />
        <Kpi
          title="Open Observations"
          value={number(open.length)}
          footer="Awaiting closure"
        />
        <Kpi
          title="Overdue"
          value={number(overdue.length)}
          footer="Open beyond due date"
        />
      </div>
      <section className="card">
        <div className="card-heading">
          <h2 className="card-title">Quality Inspections</h2>
          <Button
            className="primary"
            disabled={preview}
            onClick={() =>
              setEdit({
                title: 'Record inspection',
                description:
                  'Quality records do not directly increase physical progress. Submit an applicable acceptance milestone separately.',
                path: 'inspection',
                initial: { date: today(), firstAttempt: true, remarks: '' },
                fields: [
                  { key: 'number', label: 'Inspection number', required: true },
                  {
                    key: 'blockId',
                    label: 'Block',
                    type: 'select',
                    options: state.blocks.map((b) => ({
                      label: b.id,
                      value: b.id,
                    })),
                    required: true,
                  },
                  {
                    key: 'type',
                    label: 'Inspection type',
                    type: 'select',
                    options: [
                      'Irrigation',
                      'Support',
                      'Tree health',
                      'New tree acceptance',
                      'Final inspection',
                    ].map((v) => ({ value: v, label: v })),
                    required: true,
                  },
                  { key: 'inspector', label: 'Inspector', required: true },
                  {
                    key: 'date',
                    label: 'Inspection date',
                    type: 'date',
                    required: true,
                  },
                  {
                    key: 'result',
                    label: 'Result',
                    type: 'select',
                    options: ['PASSED', 'FAILED', 'REINSPECTION'].map((v) => ({
                      value: v,
                      label: v,
                    })),
                    required: true,
                  },
                  {
                    key: 'firstAttempt',
                    label: 'First attempt',
                    type: 'checkbox',
                  },
                  { key: 'remarks', label: 'Remarks', type: 'textarea' },
                  {
                    key: 'observation',
                    label: 'Observation',
                    type: 'textarea',
                  },
                  { key: 'responsible', label: 'Responsible person' },
                  {
                    key: 'dueDate',
                    label: 'Observation due date',
                    type: 'date',
                  },
                ],
                transform: (v) => ({ ...v, dueDate: v.dueDate || undefined }),
              })
            }
          >
            <Plus size={14} />
            Add Inspection
          </Button>
        </div>
        <table className="responsive-table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Block</th>
              <th>Type</th>
              <th>Inspector</th>
              <th>Date</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {inspections.map((i) => (
              <tr key={i.id}>
                <td data-label="Reference">{i.number}</td>
                <td data-label="Block">{i.blockId}</td>
                <td data-label="Type">{i.type}</td>
                <td data-label="Inspector">{i.inspector}</td>
                <td data-label="Date">{i.date.slice(0, 10)}</td>
                <td data-label="Result">
                  <Badge
                    status={
                      i.result === 'PASSED'
                        ? 'APPROVED'
                        : i.result === 'FAILED'
                          ? 'REJECTED'
                          : 'WAITING'
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!inspections.length && (
          <div className="empty-note">
            <ShieldCheck size={28} />
            No inspections recorded yet.
          </div>
        )}
      </section>
      <section className="card section-spacer">
        <h2 className="card-title">Open Quality Observations</h2>
        {!open.length && (
          <div className="empty-note">No open quality observations.</div>
        )}
        {open.map((o) => (
          <div className="package-row" key={o.id}>
            <div style={{ flex: 1 }}>
              <strong>{o.description}</strong>
              <p className="card-subtitle">
                {o.responsible} · Due {o.dueDate.slice(0, 10)}
              </p>
            </div>
            <button
              className="text-button"
              disabled={preview}
              onClick={() =>
                setEdit({
                  title: 'Close observation',
                  description: o.description,
                  path: 'close-observation',
                  initial: { id: o.id, reason: '' },
                  fields: [commentField],
                })
              }
            >
              Close with reason
            </button>
          </div>
        ))}
      </section>
    </>
  );
}
function Audit({ state, loading }: { state: State; loading: boolean }) {
  const [query, setQuery] = useState(''),
    [page, setPage] = useState(0),
    [detail, setDetail] =
      useState<
        State['audit'] extends (infer T)[] | undefined ? T | null : never
      >(null);
  const filtered = (state.audit || []).filter((a) =>
    `${a.action} ${a.entityType} ${a.entityId} ${a.userId}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <section className="card">
      <div className="card-heading">
        <h2 className="card-title">Immutable Audit Trail</h2>
        <span className="badge">Latest 500 events</span>
      </div>
      <div className="table-toolbar">
        <input
          aria-label="Search audit trail"
          placeholder="Search action, user or record…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
      </div>
      {loading && !state.audit ? (
        <div className="empty-note" aria-live="polite">
          Loading recent audit history in the background…
        </div>
      ) : (
      <table className="responsive-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Entity</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {filtered.slice(page * 15, page * 15 + 15).map((a) => (
            <tr key={a.id}>
              <td data-label="Time">
                {new Date(a.createdAt).toLocaleString()}
              </td>
              <td data-label="Actor">
                {state.users?.find((u) => u.id === a.userId)?.name ||
                  'System / unknown'}
              </td>
              <td data-label="Action">{a.action.replaceAll('_', ' ')}</td>
              <td data-label="Entity">
                {a.entityType}
                <small>{a.entityId}</small>
              </td>
              <td data-label="Details">
                <button className="text-button" onClick={() => setDetail(a)}>
                  View change
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
      {!loading && !filtered.length && (
        <div className="empty-note">No matching audit events.</div>
      )}
      <div className="pagination">
        <button disabled={!page} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>Page {page + 1}</span>
        <button
          disabled={(page + 1) * 15 >= filtered.length}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
      {detail && (
        <Modal
          title={detail.action}
          description={new Date(detail.createdAt).toLocaleString()}
          open
          onClose={() => setDetail(null)}
        >
          <h3>Before</h3>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              fontSize: 11,
            }}
          >
            {JSON.stringify(detail.before, null, 2)}
          </pre>
          <h3 className="section-spacer">After</h3>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              fontSize: 11,
            }}
          >
            {JSON.stringify(detail.after, null, 2)}
          </pre>
        </Modal>
      )}
    </section>
  );
}

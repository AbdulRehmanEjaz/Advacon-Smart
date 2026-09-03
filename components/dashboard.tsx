'use client';
import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  ClipboardCheck,
  Activity,
  Droplets,
  Fence,
  Trees,
  Sprout,
  ShieldCheck,
  CircleCheck,
  Leaf,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  approvedTotals,
  plannedProgress,
  progress,
  productivity,
  readiness,
} from '@/lib/domain/calculations';
import { type State, number, today, initials } from '@/lib/types';
export function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status.toLowerCase()}`}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}
export function Kpi({
  title,
  value,
  footer,
  featured = false,
}: {
  title: string;
  value: string;
  footer: string;
  featured?: boolean;
}) {
  return (
    <article className={`card kpi ${featured ? 'featured' : ''}`}>
      <div className="kpi-head">
        <span>{title}</span>
        <span className="round-arrow">
          <ArrowUpRight />
        </span>
      </div>
      <div className="kpi-value">{value}</div>
      <small>{footer}</small>
    </article>
  );
}
export function Dashboard({
  state,
  href,
}: {
  state: State;
  href: (v: string) => string;
}) {
  const [range, setRange] = useState('30 Days');
  if (state.user.role === 'FOREMAN')
    return (
      <>
        <div className="kpi-grid">
          {['WAITING', 'APPROVED', 'RETURNED', 'REJECTED'].map((status, i) => (
            <Kpi
              key={status}
              title={
                status === 'WAITING'
                  ? 'Waiting for Approval'
                  : status.charAt(0) + status.slice(1).toLowerCase()
              }
              value={number(
                state.submissions.filter((s) => s.status === status).length,
              )}
              footer="My submissions"
              featured={i === 0}
            />
          ))}
        </div>
        <div className="two-columns">
          <article className="card">
            <h2 className="card-title">My Recent Submissions</h2>
            <ActivityList state={state} />
            <a href={href('daily')} className="text-button">
              View all submissions <ArrowRight size={12} />
            </a>
          </article>
          <article className="card">
            <h2 className="card-title">Today’s Approved Work</h2>
            {state.submissions
              .filter(
                (s) =>
                  s.status === 'APPROVED' &&
                  s.workDate.slice(0, 10) === today(),
              )
              .map((s) => (
                <div className="activity-row" key={s.id}>
                  <CircleCheck size={18} color="#087443" />
                  <div>
                    <strong>{s.blockId}</strong>
                    <p className="card-subtitle">
                      {s.items
                        .map(
                          (i) =>
                            `${number(i.quantity)} ${state.packages.flatMap((p) => p.activities).find((a) => a.id === i.activityId)?.name}`,
                        )
                        .join(' · ')}
                    </p>
                  </div>
                </div>
              ))}
            {!state.submissions.some(
              (s) =>
                s.status === 'APPROVED' && s.workDate.slice(0, 10) === today(),
            ) && (
              <div className="empty-note">
                <Leaf size={26} />
                No approved work recorded for today.
              </div>
            )}
          </article>
        </div>
      </>
    );
  return (
    <AdminDashboard
      state={state}
      href={href}
      range={range}
      setRange={setRange}
    />
  );
}
function AdminDashboard({
  state,
  href,
  range,
  setRange,
}: {
  state: State;
  href: (v: string) => string;
  range: string;
  setRange: (v: string) => void;
}) {
  const [now] = useState(() => Date.now());
  const settings = state.settings!,
    totals = approvedTotals(state.submissions),
    calculated = progress(state.packages, totals, settings),
    planned = plannedProgress(state.packages, today()),
    variance = planned == null ? null : calculated.overall - planned,
    pending = state.submissions.filter((s) => s.status === 'WAITING');
  const blocks = state.blocks.map((b) => readiness(b, state.submissions));
  const ready = blocks.filter((b) => b.ready);
  const readyCapacity = ready.reduce((n, b) => n + (b.capacity || 0), 0);
  const production = productivity(
    state.submissions,
    'placed',
    today(),
    Number(settings.translocationTarget),
  );
  const chart = useMemo(() => {
    const end = new Date(today());
    let start = new Date(end);
    start.setUTCDate(end.getUTCDate() - (range === '7 Days' ? 6 : 29));
    if (range === 'Project') {
      const starts = state.packages.flatMap((p) =>
        p.activities.map((a) => a.schedule?.start).filter(Boolean),
      ) as string[];
      if (starts.length) start = new Date(starts.sort()[0]);
    }
    const span = Math.max(
      0,
      Math.round((end.getTime() - start.getTime()) / 86400000),
    );
    const step = Math.max(1, Math.ceil(span / 60));
    return Array.from({ length: Math.ceil(span / step) + 1 }, (_, i) => {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + Math.min(i * step, span));
      const date = d.toISOString().slice(0, 10);
      return {
        date,
        label: d.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        }),
        actual: progress(
          state.packages,
          approvedTotals(state.submissions, date),
          settings,
        ).overall,
        planned: plannedProgress(state.packages, date),
      };
    });
  }, [state, range, settings]);
  const compact = [
    ['Irrigation', totals.pipe || 0, Number(settings.irrigationTarget), 'm'],
    ['Support Posts', totals.posts || 0, Number(settings.postTarget), 'posts'],
    [
      'Approved Rows',
      totals.approved_rows || 0,
      Number(settings.rowTarget),
      'rows',
    ],
    [
      'Trees Relocated',
      totals.placed || 0,
      Number(settings.translocationTarget),
      'trees',
    ],
    [
      'New Trees Accepted',
      totals.accepted || 0,
      Number(settings.newTreeTarget),
      'trees',
    ],
  ] as const;
  return (
    <>
      <div className="kpi-grid">
        <Kpi
          title="Overall Project Progress"
          value={`${calculated.overall.toFixed(2)}%`}
          footer="Actual physical completion"
          featured
        />
        <Kpi
          title="Planned Progress"
          value={planned == null ? '—' : `${planned.toFixed(2)}%`}
          footer={
            planned == null ? 'Schedule not configured' : 'Planned as of today'
          }
        />
        <Kpi
          title="Schedule Variance"
          value={
            variance == null
              ? '—'
              : `${variance > 0 ? '+' : ''}${variance.toFixed(2)}%`
          }
          footer={
            variance == null
              ? 'Awaiting approved baseline'
              : 'Actual vs planned · percentage points'
          }
        />
        <Kpi
          title="Pending Approval"
          value={number(pending.length)}
          footer="Foreman submissions"
        />
      </div>
      <div className="mini-grid">
        {compact.map(([title, value, target, unit]) => (
          <div className="mini-kpi" key={title}>
            <span>{title}</span>
            <strong>
              {number(value)}{' '}
              <small>
                /{' '}
                {title === 'Trees Relocated' &&
                settings.translocationTargetIsApproximate
                  ? '≈ '
                  : ''}
                {number(target)}
              </small>
            </strong>
            <small>
              {(target ? Math.min(100, (value / target) * 100) : 0).toFixed(1)}%
              · {unit}
            </small>
          </div>
        ))}
        <div className="mini-kpi">
          <span>Ready Blocks</span>
          <strong>
            {ready.length} <small>/ {settings.blockTarget}</small>
          </strong>
          <small>Released for placement</small>
        </div>
        <div className="mini-kpi">
          <span>Ready Nursery Capacity</span>
          <strong>
            {((readyCapacity / Number(settings.designCapacity)) * 100).toFixed(
              1,
            )}
            %
          </strong>
          <small>{number(readyCapacity)} available by design</small>
        </div>
      </div>
      <div className="dashboard-grid">
        <article className="card analytics">
          <div className="card-heading">
            <div>
              <h2 className="card-title">Project Analytics</h2>
              <p className="card-subtitle">
                Planned vs actual physical progress
              </p>
            </div>
            <div className="segmented">
              {['7 Days', '30 Days', 'Project'].map((r) => (
                <button
                  key={r}
                  className={range === r ? 'selected' : ''}
                  onClick={() => setRange(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="chart">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 600, height: 210 }}
            >
              <LineChart
                data={chart}
                margin={{ top: 15, right: 12, left: -25, bottom: 0 }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="#f0f3f1"
                  strokeDasharray="3 6"
                />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  minTickGap={35}
                  tick={{ fill: '#9aa79e', fontSize: 9 }}
                />
                <YAxis
                  domain={[0, 100]}
                  axisLine={false}
                  tickLine={false}
                  ticks={[0, 25, 50, 75, 100]}
                  tick={{ fill: '#9aa79e', fontSize: 9 }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid #e9eeeb',
                    fontSize: 11,
                  }}
                  formatter={(v) => `${Number(v).toFixed(2)}%`}
                />
                <Line
                  name="Planned"
                  type="monotone"
                  dataKey="planned"
                  stroke="#bccbc1"
                  strokeDasharray="5 5"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  name="Actual"
                  type="monotone"
                  dataKey="actual"
                  stroke="#087443"
                  dot={false}
                  strokeWidth={3}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="legend">
            <span>
              <i />
              Actual
            </span>
            <span>
              <i className="muted-dot" />
              Planned
            </span>
            <span style={{ marginLeft: 'auto' }}>
              {planned == null
                ? 'Add a schedule to show the planned curve'
                : 'Approved quantities only'}
            </span>
          </div>
        </article>
        <article className="card packages-card">
          <div className="card-heading">
            <h2 className="card-title">Work Packages</h2>
            <Leaf size={16} color="#639374" />
          </div>
          {calculated.work
            .filter((p) =>
              [
                'irrigation',
                'support',
                'translocation',
                'new-trees',
                'testing',
              ].includes(p.id),
            )
            .map((p) => {
              const Icon =
                p.id === 'irrigation'
                  ? Droplets
                  : p.id === 'support'
                    ? Fence
                    : p.id === 'translocation'
                      ? Trees
                      : p.id === 'new-trees'
                        ? Sprout
                        : ShieldCheck;
              return (
                <a
                  href={href(p.id === 'testing' ? 'quality' : p.id)}
                  className="package-row"
                  key={p.id}
                >
                  <span className="package-icon">
                    <Icon />
                  </span>
                  <div className="package-meta">
                    <strong>{p.name}</strong>
                    <div className="progress-track">
                      <span style={{ width: `${p.progress}%` }} />
                    </div>
                    <small>
                      {p.progress.toFixed(1)}% ·{' '}
                      {p.progress === 0
                        ? 'Not started'
                        : p.progress >= 100
                          ? 'Completed'
                          : 'In progress'}
                    </small>
                  </div>
                </a>
              );
            })}
          <div className="pending-widget">
            <h3>Waiting for Approval</h3>
            <strong>
              {pending.length}{' '}
              <span style={{ fontSize: 13, color: '#84958a' }}>
                submissions
              </span>
            </strong>
            {pending.length ? (
              <>
                <p>
                  {pending.at(-1)!.supervisor.name} · {pending.at(-1)!.blockId}
                  <br />
                  {new Date(pending.at(-1)!.createdAt).toLocaleString()}
                </p>
                {now - new Date(pending.at(-1)!.createdAt).getTime() >
                  Number(settings.pendingHours) * 3600000 && (
                  <Badge status="WAITING" />
                )}
              </>
            ) : (
              <p>All site submissions have been reviewed.</p>
            )}
            <a
              href={href('approvals')}
              className="primary"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontSize: 11,
              }}
            >
              <ClipboardCheck size={14} />
              Review Approvals
            </a>
          </div>
        </article>
        <article className="card activity-card">
          <div className="card-heading">
            <h2 className="card-title">Recent Site Activity</h2>
            <a href={href('daily')} className="text-button">
              View all <ArrowUpRight size={12} />
            </a>
          </div>
          <ActivityList state={state} />
        </article>
        <article className="card gauge-card">
          <h2 className="card-title">Overall Project Progress</h2>
          <div className="gauge-wrap">
            <svg
              viewBox="0 0 240 142"
              aria-label={`${calculated.overall.toFixed(2)} percent physical progress`}
            >
              <defs>
                <pattern
                  id="remaining"
                  width="5"
                  height="5"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(40)"
                >
                  <rect width="5" height="5" fill="#f2f5f2" />
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="5"
                    stroke="#b4c4b9"
                    strokeWidth="1.4"
                  />
                </pattern>
              </defs>
              <path
                d="M 25 120 A 95 95 0 0 1 215 120"
                fill="none"
                stroke="url(#remaining)"
                strokeWidth="29"
                strokeLinecap="round"
              />
              <path
                d="M 25 120 A 95 95 0 0 1 215 120"
                fill="none"
                stroke="#168057"
                strokeWidth="29"
                strokeLinecap={calculated.overall > 0 ? 'round' : 'butt'}
                pathLength="100"
                strokeDasharray={`${calculated.overall} 100`}
              />
            </svg>
            <div className="gauge-number">
              <strong>{calculated.overall.toFixed(2)}%</strong>
              <small>Physical Progress</small>
            </div>
          </div>
          <div className="legend" style={{ justifyContent: 'center', gap: 10 }}>
            <span>
              <i />
              Completed
            </span>
            <span>
              <i className="muted-dot" />
              Remaining
            </span>
          </div>
          {calculated.overall === 0 && (
            <p
              className="card-subtitle"
              style={{ textAlign: 'center', marginTop: 15 }}
            >
              No approved progress has been recorded yet.
            </p>
          )}
        </article>
        <article className="card readiness-card">
          <div className="card-heading">
            <div>
              <h2 className="card-title">Block Readiness</h2>
              <p className="card-subtitle">Every block. Every prerequisite.</p>
            </div>
            <a href={href('blocks')} className="text-button">
              View blocks <ArrowUpRight size={12} />
            </a>
          </div>
          <div className="blocks-grid">
            {blocks.map((b) => (
              <a
                href={href('blocks') + `#${b.id}`}
                className={`block-tile ${b.ready ? 'ready' : b.hold ? 'hold' : b.status === 'PARTIALLY READY' ? 'partial' : ''}`}
                key={b.id}
                title={`Zone ${b.zoneId} · Capacity ${b.capacity ?? 'not set'} · ${b.reasons.join('. ')}`}
              >
                <strong>{b.id}</strong>
                <small>
                  {b.status === 'NOT STARTED' ? 'NOT STARTED' : b.status}
                </small>
              </a>
            ))}
          </div>
        </article>
        <article className="card productivity-card">
          <h2 className="card-title">Today’s Productivity</h2>
          <div className="productivity-number">{number(production.today)}</div>
          <p>Trees / Day</p>
          <p>
            Target: {settings.productivityMin}–{settings.productivityMax}
          </p>
          <div className="productivity-footer">
            <Activity size={14} />
            7-Day Avg: {number(production.average)}/day
          </div>
        </article>
      </div>
    </>
  );
}
function ActivityList({ state }: { state: State }) {
  return state.submissions.length ? (
    state.submissions.slice(0, 4).map((s) => (
      <div className="activity-row" key={s.id}>
        <span className="avatar">{initials(s.supervisor.name)}</span>
        <div className="activity-text">
          <strong>{s.supervisor.name}</strong>
          <p>
            {s.blockId} ·{' '}
            {state.packages.find((p) => p.id === s.packageId)?.name}
          </p>
        </div>
        <Badge status={s.status} />
      </div>
    ))
  ) : (
    <div className="empty-note">
      <Sprout size={28} />A fresh start for your project.
      <br />
      Site submissions will appear here.
    </div>
  );
}

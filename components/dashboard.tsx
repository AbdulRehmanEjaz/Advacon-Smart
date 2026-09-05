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
  calculateKpiProgress,
  plannedProgress,
  productivity,
  readiness,
} from '@/lib/domain/calculations';
import { type State, number, today, initials } from '@/lib/types';
const progressLabel = (value: number) =>
  `${Math.abs(value - 100) < 0.00001 ? '100' : value.toFixed(2)}%`;
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
  href,
  arrowLabel,
}: {
  title: string;
  value: string;
  footer: string;
  featured?: boolean;
  href?: string;
  arrowLabel?: string;
}) {
  return (
    <article className={`card kpi ${featured ? 'featured' : ''}`}>
      <div className="kpi-head">
        <span>{title}</span>
        {href ? (
          <a
            className="round-arrow"
            href={href}
            aria-label={arrowLabel || `Open ${title}`}
          >
            <ArrowUpRight />
          </a>
        ) : (
          <span className="round-arrow" aria-hidden="true">
            <ArrowUpRight />
          </span>
        )}
      </div>
      <div className="kpi-value">{value}</div>
      <small>{footer}</small>
    </article>
  );
}
function ProgressGauge({ value }: { value: number }) {
  return (
    <article className="card gauge-card gauge-compact">
      <h2 className="card-title">Overall Project Progress</h2>
      <div className="gauge-wrap">
        <svg viewBox="0 0 240 142" aria-label={`${progressLabel(value)} physical progress`}>
          <defs>
            <pattern id="remaining-top" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
              <rect width="5" height="5" fill="#f2f5f2" />
              <line x1="0" y1="0" x2="0" y2="5" stroke="#b4c4b9" strokeWidth="1.4" />
            </pattern>
          </defs>
          <path d="M 25 120 A 95 95 0 0 1 215 120" fill="none" stroke="url(#remaining-top)" strokeWidth="29" strokeLinecap="round" />
          <path d="M 25 120 A 95 95 0 0 1 215 120" fill="none" stroke="#168057" strokeWidth="29" strokeLinecap={value > 0 ? 'round' : 'butt'} pathLength="100" strokeDasharray={`${value} 100`} />
        </svg>
        <div className="gauge-number"><strong>{progressLabel(value)}</strong><small>Physical Progress</small></div>
      </div>
    </article>
  );
}
function PackageProgressGauge({ value }: { value: number }) {
  return (
    <span
      className="package-gauge"
      aria-label={`${progressLabel(value)} complete`}
    >
      <svg viewBox="0 0 100 58" aria-hidden="true">
        <path
          d="M 12 49 A 38 38 0 0 1 88 49"
          fill="none"
          stroke="#e5ece7"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d="M 12 49 A 38 38 0 0 1 88 49"
          fill="none"
          stroke="#168057"
          strokeWidth="10"
          strokeLinecap={value > 0 ? 'round' : 'butt'}
          pathLength="100"
          strokeDasharray={`${value} 100`}
        />
      </svg>
      <strong>{progressLabel(value)}</strong>
    </span>
  );
}
export function Dashboard({
  state,
  href,
}: {
  state: State;
  href: (v: string) => string;
}) {
  const [range, setRange] = useState('7 Days');
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
                    <strong>{s.blockId || 'Project-wide'}</strong>
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
    calculated = calculateKpiProgress(
      state.packages,
      state.openingBalances,
      state.submissions,
      settings,
    ),
    planned = plannedProgress(state.packages, today()),
    pending = state.submissions.filter((s) => s.status === 'WAITING');
  const blocks = state.blocks.map((b) => readiness(b, state.submissions));
  const production = productivity(
    state.submissions,
    'kpi-translocation-placement',
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
        actual: calculateKpiProgress(
          state.packages,
          state.openingBalances,
          state.submissions,
          settings,
          date,
        ).overall,
        planned: plannedProgress(state.packages, date),
      };
    });
  }, [state, range, settings]);
  return (
    <>
      <div className="kpi-grid dashboard-kpi-grid">
        <Kpi
          title="Overall Project Progress"
          value={progressLabel(calculated.overall)}
          footer="Actual physical completion"
          featured
          href={href('kpi-progress')}
          arrowLabel="Open Approved KPI Progress"
        />
        <Kpi
          title="Remaining Progress"
          value={progressLabel(calculated.remaining)}
          footer="Until physical completion"
          href={href('kpi-progress')}
          arrowLabel="Open Approved KPI Progress"
        />
        <ProgressGauge value={calculated.overall} />
      </div>
      <div className="dashboard-primary-grid">
        <div className="dashboard-primary-main">
          <section
            className="main-activity-dashboard"
            aria-labelledby="main-activity-progress"
          >
            <div className="card-heading">
              <div>
                <h2 className="card-title" id="main-activity-progress">
                  Main Activity Progress
                </h2>
                <p className="card-subtitle">
                  Approved completion across all seven main activities
                </p>
              </div>
            </div>
            <div className="mini-grid approved-groups">
              {calculated.groups.map((group) => (
                <div className="mini-kpi" key={group.id}>
                  <span>{group.name}</span>
                  <strong>{progressLabel(group.progress)}</strong>
                  <div className="progress-track">
                    <span style={{ width: `${group.progress}%` }} />
                  </div>
                  <small>
                    {group.earned.toFixed(2)}% earned · {group.weight}% weight
                  </small>
                </div>
              ))}
            </div>
          </section>
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
          <article className="card activity-card">
            <div className="card-heading">
              <h2 className="card-title">Recent Site Activity</h2>
              <a href={href('daily')} className="text-button">
                View all <ArrowUpRight size={12} />
              </a>
            </div>
            <ActivityList state={state} />
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
        </div>
        <div className="dashboard-primary-side">
          <article className="card packages-card">
          <div className="card-heading">
            <h2 className="card-title">Work Packages</h2>
            <Leaf size={16} color="#639374" />
          </div>
          {calculated.work
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
                      {p.earned.toFixed(2)}% earned · {p.weight}% weight · ({p.name})
                    </small>
                  </div>
                  <PackageProgressGauge value={p.progress} />
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
                  {pending.at(-1)!.supervisor.name} · {pending.at(-1)!.blockId || 'Project-wide'}
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
            {s.blockId || 'Project-wide'} ·{' '}
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

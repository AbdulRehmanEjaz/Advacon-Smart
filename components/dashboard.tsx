'use client';
import { ProgressComparisonCard } from './project-schedule';
import { CostKpiCards, CostComposition } from './cost-control';
import { ManpowerAttendanceCard } from './manpower-attendance-card';
import {
  ArrowUpRight,
  ArrowRight,
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
  calculateKpiProgress,
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
function ProgressGauge({ value, remaining, href }: { value: number; remaining: number; href: string }) {
  return (
    <article className="card gauge-card gauge-compact progress-summary">
      <h2 className="card-title">Overall Project Progress</h2>
      <a className="round-arrow" href={href} aria-label="Open Approved KPI Progress"><ArrowUpRight /></a>
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
      <p className="gauge-remaining">Remaining Progress: <strong>{remaining.toFixed(2)}%</strong></p>
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
    />
  );
}
function AdminDashboard({
  state,
  href,
}: {
  state: State;
  href: (v: string) => string;
}) {
  const settings = state.settings!,
    calculated = calculateKpiProgress(
      state.packages,
      state.openingBalances,
      state.submissions,
      settings,
    );
  const production = productivity(
    state.submissions,
    'kpi-translocation-placement',
    today(),
    Number(settings.translocationTarget),
  );
  return (
    <>
      <div className="kpi-grid dashboard-kpi-grid dashboard-summary-row">
        <ProgressGauge value={calculated.overall} remaining={calculated.remaining} href={href('kpi-progress')} />
        <ManpowerAttendanceCard state={state} />
        <CostKpiCards state={state} dashboard selection="total" href={href('cost-control')} />
        <CostComposition state={state} compact />
      </div>
      <ProgressComparisonCard state={state} compact />
      <div className="dashboard-primary-grid">
        <div className="dashboard-primary-main">
          <section className="dashboard-costs"><CostKpiCards state={state} dashboard selection="categories" /></section>
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
                  href={state.user.role === 'VIEWER' ? undefined : href(p.id === 'testing' ? 'quality' : p.id)}
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
          </article>

        </div>
      </div>
    </>
  );
}
export function ActivityList({ state }: { state: State }) {
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
export function BlockReadinessOverview({ state, preview }: { state: State; preview: boolean }) {
 const blocks = state.blocks.map((b) => readiness(b, state.submissions));
 const href = (view: string) => preview ? '/design-preview?view=' + view : '/workspace/' + view;
 return (<article className="card readiness-card">
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
          </article>);
}

'use client';

import { useId, useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import styles from './project-schedule.module.css';
import { mainTasks, irrigationTasks, supportTasks, scheduleComparison } from '@/lib/domain/project-schedule';
import { riyadhDate } from '@/lib/domain/date';
import type { State } from '@/lib/types';

const dateLabel = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const percentage = (value: number | null) => value == null ? 'Unavailable' : `${value.toFixed(1)}%`;

export function ProjectSchedule({ state }: { state: State }) {
  const gradientId = useId().replace(/:/g, '');
  const today = riyadhDate();
  const comparison = useMemo(() => scheduleComparison(state, today), [state, today]);
  return <div style={{ display: 'grid', gap: 20, minWidth: 0 }}>
    <section className={`card ${styles.chartCard}`} aria-label="Schedule progress comparison">
      <div className="card-heading"><div><h2>Planned vs Current Progress</h2><p>Approved baseline · 15 Aug–30 Nov 2026</p></div><span className={`badge ${comparison.status === 'Behind plan' ? 'rejected' : 'approved'}`}>{comparison.status}</span></div>
      <div className="kpi-grid">
        <div><small>Planned Progress · {dateLabel(today)}</small><h3>{percentage(comparison.planned)}</h3></div>
        <div><small>Current Progress · approved KPI</small><h3>{percentage(comparison.current)}</h3></div>
        <div><small>Variance · percentage points</small><h3>{comparison.variance == null ? 'Unavailable' : `${comparison.variance > 0 ? '+' : ''}${comparison.variance.toFixed(1)} pp`}</h3></div>
      </div>
      <div className={styles.legend} aria-label="Chart legend">
        <span><i style={{ background: '#5849ac' }} />Planned Progress</span>
        <span><i style={{ background: '#32bed0' }} />Current Progress</span>
      </div>
      <div className={styles.plot}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={comparison.chart} margin={{ top: 25, right: 16, bottom: 10, left: 0 }} accessibilityLayer>
            <defs>
              <linearGradient id={`${gradientId}-planned`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5849ac" stopOpacity={0.16} /><stop offset="100%" stopColor="#5849ac" stopOpacity={0} /></linearGradient>
              <linearGradient id={`${gradientId}-current`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#32bed0" stopOpacity={0.18} /><stop offset="100%" stopColor="#32bed0" stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#edf0f5" />
            <XAxis dataKey="date" tickFormatter={dateLabel} minTickGap={45} tick={{ fontSize: 12, fill: '#718ba4' }} tickMargin={12} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tickFormatter={(value: number) => `${value}%`} width={45} tick={{ fontSize: 12, fill: '#718ba4' }} axisLine={false} tickLine={false} />
            <Tooltip content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return <div className={styles.tooltip}><small>{dateLabel(String(label))} 2026</small>{payload.filter((point) => point.value != null).map((point) => <div key={String(point.dataKey)}><span>{point.name}</span><strong>{percentage(Number(point.value))}</strong></div>)}</div>;
            }} cursor={{ stroke: '#c6d0dc', strokeDasharray: '3 3' }} />
            <Area name="Planned Progress" dataKey="planned" type="monotone" stroke="#5849ac" fill={`url(#${gradientId}-planned)`} strokeWidth={3} dot={false} activeDot={{ r: 5, fill: '#fff', stroke: '#5849ac', strokeWidth: 3 }} isAnimationActive={false} />
            <Area name="Current Progress" dataKey="current" type="monotone" stroke="#32bed0" fill={`url(#${gradientId}-current)`} strokeWidth={3} dot={false} activeDot={{ r: 5, fill: '#fff', stroke: '#32bed0', strokeWidth: 3 }} connectNulls={false} isAnimationActive={false} />
            <ReferenceLine x={today} stroke="#7c827f" strokeDasharray="3 3" label={{ value: 'Today', position: 'insideTopRight', fontSize: 12 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="card-subtitle">Plan uses the existing KPI weights spread linearly across each main task window. Final testing and handover share the Final Completion weight across 26–30 Nov. Subtasks are not counted again. Current Progress uses approved KPI history, including opening balances and approved adjustments; no future actuals are projected. On plan means within 0.05 percentage points.</p>
    </section>
    {[{ title: 'Main Tasks', tasks: mainTasks }, { title: 'Irrigation Subtasks', tasks: irrigationTasks }, { title: 'Post & Wire Subtasks', tasks: supportTasks }].map(({ title, tasks }) => <section className="card" key={title}>
      <div className="card-heading"><h3>{title}</h3><span className="badge">Baseline 2026</span></div>
      <div className="table-scroll"><table className="responsive-table"><thead><tr><th scope="col">Task</th><th scope="col">Start</th><th scope="col">Finish</th></tr></thead><tbody>{tasks.map((task) => <tr key={task.id}><td data-label="Task"><strong>{task.id}</strong> · {task.name}</td><td data-label="Start"><time dateTime={task.start}>{dateLabel(task.start)}</time></td><td data-label="Finish"><time dateTime={task.finish}>{dateLabel(task.finish)}</time></td></tr>)}</tbody></table></div>
    </section>)}
  </div>;
}

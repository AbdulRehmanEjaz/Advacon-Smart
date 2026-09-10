'use client';

import { useMemo } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { mainTasks, irrigationTasks, supportTasks, scheduleComparison } from '@/lib/domain/project-schedule';
import { riyadhDate } from '@/lib/domain/date';
import type { State } from '@/lib/types';

const dateLabel = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const percentage = (value: number | null) => value == null ? 'Unavailable' : `${value.toFixed(1)}%`;

export function ProjectSchedule({ state }: { state: State }) {
  const today = riyadhDate();
  const comparison = useMemo(() => scheduleComparison(state, today), [state, today]);
  return <div style={{ display: 'grid', gap: 20, minWidth: 0 }}>
    <section className="card" aria-label="Schedule progress comparison">
      <div className="card-heading"><div><h2>Planned vs Current Progress</h2><p>Approved baseline · 15 Aug–30 Nov 2026</p></div><span className={`badge ${comparison.status === 'Behind plan' ? 'rejected' : 'approved'}`}>{comparison.status}</span></div>
      <div className="kpi-grid">
        <div><small>Planned Progress · {dateLabel(today)}</small><h3>{percentage(comparison.planned)}</h3></div>
        <div><small>Current Progress · approved KPI</small><h3>{percentage(comparison.current)}</h3></div>
        <div><small>Variance · percentage points</small><h3>{comparison.variance == null ? 'Unavailable' : `${comparison.variance > 0 ? '+' : ''}${comparison.variance.toFixed(1)} pp`}</h3></div>
      </div>
      <div style={{ width: '100%', height: 330, minWidth: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={comparison.chart} margin={{ top: 25, right: 20, bottom: 10, left: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="#e8eeea" />
            <XAxis dataKey="date" tickFormatter={dateLabel} minTickGap={45} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tickFormatter={(value: number) => `${value}%`} width={45} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip labelFormatter={(value) => dateLabel(String(value))} formatter={(value) => percentage(value == null ? null : Number(value))} />
            <Legend />
            <ReferenceLine x={today} stroke="#7c827f" strokeDasharray="3 3" label={{ value: 'Today', position: 'insideTopRight', fontSize: 12 }} />
            <Line name="Planned Progress" dataKey="planned" type="linear" stroke="#688299" strokeWidth={2.5} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
            <Line name="Current Progress" dataKey="current" type="linear" stroke="#087443" strokeWidth={3} dot={false} connectNulls={false} isAnimationActive={false} />
          </LineChart>
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

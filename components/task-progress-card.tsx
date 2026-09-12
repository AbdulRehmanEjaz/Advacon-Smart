'use client';
import { useMemo } from 'react';
import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { State } from '@/lib/types';
import { calculateKpiProgress } from '@/lib/domain/calculations';
import styles from './task-progress-card.module.css';

const TRACK_COLOR = '#EAEDED';

const COLOR_COMPLETE = '#197842';
const COLOR_IN_PROGRESS = '#B58A2E';
const COLOR_NOT_STARTED = '#9AA5A0';

/** Arc and legend-dot color follow completion status: green done, brown in progress, grey not started. */
function statusColor(progress: number): string {
  if (progress >= 100) return COLOR_COMPLETE;
  if (progress > 0) return COLOR_IN_PROGRESS;
  return COLOR_NOT_STARTED;
}

/** Strips numeric prefixes ("01. ") and replaces underscores with spaces. */
function cleanTaskName(name: string): string {
  return name
    .replace(/^\s*\d{1,2}\.\s+/, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Trims to 2 decimals without trailing zeros: 10.81, 6.97, 100, 0. */
function fmt(n: number): string {
  return String(Number(n.toFixed(2)));
}

type TaskDatum = {
  name: string;
  clean: string;
  earned: number;
  weight: number;
  progress: number;
  fill: string;
};

function TaskTooltip({ active, payload }: { active?: boolean; payload?: { payload?: TaskDatum }[] }) {
  if (!active || !payload?.length || !payload[0]?.payload) return null;
  const { clean, earned, weight } = payload[0].payload;
  return (
    <div className="cost-tooltip">
      <strong className={styles.tooltipName}>{clean}</strong>
      <span>{Number(earned).toFixed(2)}% earned / {Number(weight)}% weight</span>
    </div>
  );
}

export function TaskProgressCard({ state }: { state: State }) {
  const tasks = useMemo<TaskDatum[]>(() => {
    const settings = state.settings!;
    const { work } = calculateKpiProgress(
      state.packages,
      state.openingBalances,
      state.submissions,
      settings,
    );
    return work.map((task) => ({
      name: task.name,
      clean: cleanTaskName(task.name),
      earned: Number(task.earned.toFixed(2)),
      weight: task.weight,
      progress: Number(task.progress.toFixed(2)),
      fill: statusColor(task.progress),
    }));
  }, [state]);
  return (
    <article className={`card cost-kpi ${styles.card}`}>
      <h2 className="card-title">KPIs Tasks Tracking</h2>
      <div className={styles.chart}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            data={tasks}
            innerRadius="22%"
            outerRadius="98%"
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} angleAxisId={0} />
            <RadialBar
              background={{ fill: TRACK_COLOR }}
              dataKey="progress"
              cornerRadius={4}
            />
            <Tooltip content={<TaskTooltip />} />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <ul className={styles.legend}>
        {tasks.map((task) => (
          <li key={task.name}>
            <i style={{ background: statusColor(task.progress) }} aria-hidden="true" />
            <span className={styles.legendName}>
              {task.clean} <b>{fmt(task.progress)}%</b>
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}

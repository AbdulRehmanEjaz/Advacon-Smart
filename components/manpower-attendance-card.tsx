'use client';
import { useId, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { State } from '@/lib/types';
import { manpowerAttendanceSummary } from '@/lib/domain/dashboard-attendance';
import { riyadhDate } from '@/lib/domain/date';
import styles from './manpower-attendance-card.module.css';

export function ManpowerAttendanceCard({ state }: { state: State }) {
  const id = useId().replace(/:/g, '');
  const today = riyadhDate();
  const [selectedDate, setSelectedDate] = useState(today);
  const changeDate = (days: number) => setSelectedDate((current) => {
    const date = new Date(`${current}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  });
  const { present, absent, percentage } = manpowerAttendanceSummary(state, selectedDate, 'day');
  const label = percentage == null ? 'No records' : `${percentage.toFixed(1)}%`;
  return <article className={`cost-kpi ${styles.card}`}>
    <span>Manpower Attendance</span>
    <div className={styles.chart}>
      <svg viewBox="0 0 160 160" aria-labelledby={`${id}-title`}>
        <title id={`${id}-title`}>{`Manpower attendance for ${selectedDate}: ${label}. ${present} present, ${absent} absent.`}</title>
        <defs><pattern id={`${id}-stripes`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(25)"><rect width="5" height="5" fill="#e0f1e6" /><path d="M0 0V5" stroke="#4aa374" strokeWidth="2" /></pattern></defs>
        <circle cx="80" cy="80" r="58" fill="none" stroke={percentage == null ? '#e9eeeb' : `url(#${id}-stripes)`} strokeWidth="26" />
        {percentage != null && <circle cx="80" cy="80" r="58" fill="none" stroke="#087443" strokeWidth="26" pathLength="100" strokeDasharray={`${percentage} ${100 - percentage}`} transform="rotate(-90 80 80)" />}
        <text x="80" y="80" textAnchor="middle" dominantBaseline="middle" className={styles.value}>{label}</text>
        <text x="80" y="98" textAnchor="middle" className={styles.caption}>{percentage == null ? 'P / A not recorded' : 'Present'}</text>
      </svg>
    </div>
    <div className={styles.dateNavigation}>
      <button type="button" aria-label="Previous attendance day" onClick={() => changeDate(-1)}><ChevronLeft size={16} aria-hidden="true" /></button>
      <span>{selectedDate === today ? 'Today · ' : ''}<time dateTime={selectedDate}>{selectedDate}</time></span>
      <button type="button" aria-label="Next attendance day" onClick={() => changeDate(1)}><ChevronRight size={16} aria-hidden="true" /></button>
    </div>
    <div className={styles.legend} aria-live="polite" aria-label={`Attendance for ${selectedDate}`}>
      <span><i aria-hidden="true" />Present: <b>{present.toLocaleString('en-US')}</b></span>
      <span><i className={styles.striped} aria-hidden="true" />Absent: <b>{absent.toLocaleString('en-US')}</b></span>
    </div>
  </article>;
}

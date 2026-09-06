export const MANPOWER_DAILY_RATE_HALALAS = 13_000;
export const ATTENDANCE_STATUSES = ['P', 'A', 'F', 'H'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export type AttendanceKind = 'manpower' | 'equipment';

export type Resource = {
  id: string;
  code: string;
  name: string;
  company: string;
  dailyRateHalalas: number;
  active: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AttendanceRecord = {
  id: string;
  resourceId: string;
  date: string;
  status: AttendanceStatus;
  createdAt: string;
  updatedAt: string;
};

export function earnedHalalas(status: AttendanceStatus | undefined, rate: number) {
  return status === 'P' ? rate : 0;
}

export function statusCounts(records: AttendanceRecord[]) {
  return ATTENDANCE_STATUSES.reduce(
    (counts, status) => ({
      ...counts,
      [status]: records.filter((record) => record.status === status).length,
    }),
    { P: 0, A: 0, F: 0, H: 0 } as Record<AttendanceStatus, number>,
  );
}

export function daysInMonthThrough(month: string, today: string) {
  if (!/^\d{4}-\d{2}$/.test(month) || month > today.slice(0, 7)) return 0;
  const [year, monthNumber] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return month === today.slice(0, 7) ? Math.min(last, Number(today.slice(8, 10))) : last;
}

export function monthlyCost(records: AttendanceRecord[], rate: number) {
  return statusCounts(records).P * rate;
}

export function formatSar(halalas: number) {
  return `SAR ${(halalas / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

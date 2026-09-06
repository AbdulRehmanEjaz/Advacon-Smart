'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleOff,
  Download,
  HardHat,
  Pencil,
  Plus,
  Save,
  Search,
  UsersRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from './progress-form';
import { post, type State } from '@/lib/types';
import { riyadhDate } from '@/lib/domain/date';
import {
  ATTENDANCE_STATUSES,
  daysInMonthThrough,
  formatSar,
  monthlyCost,
  statusCounts,
  type AttendanceKind,
  type AttendanceStatus,
  type Resource,
} from '@/lib/domain/attendance';

const statusMeta: Record<AttendanceStatus, { label: string; long: string }> = {
  P: { label: 'P', long: 'Present' },
  A: { label: 'A', long: 'Absent' },
  F: { label: 'F', long: 'Friday' },
  H: { label: 'H', long: 'Holiday' },
};

function Toggle({
  value,
  options,
  onChange,
}: {
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <div className="attendance-toggle" role="tablist">
      {options.map(([id, label]) => (
        <button
          type="button"
          role="tab"
          aria-selected={value === id}
          className={value === id ? 'active' : ''}
          onClick={() => onChange(id)}
          key={id}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function MasterEditor({
  kind,
  item,
  onClose,
  onSaved,
}: {
  kind: AttendanceKind;
  item?: Resource;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const manpower = kind === 'manpower';
  const [name, setName] = useState(item?.name || '');
  const [code, setCode] = useState(item?.code || '');
  const [company, setCompany] = useState(item?.company || '');
  const [rate, setRate] = useState(
    item ? String(item.dailyRateHalalas / 100) : '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: { preventDefault(): void }) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!manpower && !/^\d+(\.\d{1,2})?$/.test(rate))
        throw Error('Enter a rate with no more than two decimal places.');
      await post(kind, {
        action: 'save',
        id: item?.id,
        name,
        code,
        company,
        ...(manpower
          ? {}
          : { dailyRateHalalas: Math.round(Number(rate) * 100) }),
      });
      await onSaved();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      title={`${item ? 'Edit' : 'Add'} ${manpower ? 'Labour' : 'Equipment'}`}
      description={
        manpower
          ? 'All labour uses the fixed project rate of SAR 130.00 per Present day.'
          : 'The daily rate is charged only when this equipment is marked Present.'
      }
      onClose={onClose}
    >
      <form onSubmit={save}>
        <div className="form-grid">
          <label className="field">
            {manpower ? 'Labour name' : 'Equipment name'}
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="field">
            {manpower ? 'Labour ID' : 'Equipment ID / Asset No.'}
            <input
              required
              maxLength={80}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <label className="field">
            Company
            <input
              required
              maxLength={120}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </label>
          <label className="field">
            Daily rate (SAR)
            <input
              required={!manpower}
              readOnly={manpower}
              inputMode="decimal"
              value={manpower ? '130.00' : rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </label>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <Button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save record'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function ResourcesPage({
  state,
  refresh,
  preview,
}: {
  state: State;
  refresh: () => Promise<void>;
  preview: boolean;
}) {
  const [kind, setKind] = useState<AttendanceKind>('manpower');
  const [editor, setEditor] = useState<Resource | 'new' | null>(null);
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [error, setError] = useState('');
  const records =
    kind === 'manpower' ? state.manpower || [] : state.equipment || [];
  const shown = records.filter(
    (item) =>
      (showInactive || item.active) &&
      `${item.name} ${item.code} ${item.company}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  async function status(item: Resource) {
    setError('');
    try {
      await post(kind, { action: 'status', id: item.id, active: !item.active });
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update.');
    }
  }
  return (
    <div className="attendance-page">
      <section className="card attendance-hero">
        <div>
          <span className="eyebrow">RESOURCE DIRECTORY</span>
          <h2>Manpower & Equipment</h2>
          <p>
            Maintain chargeable site resources without losing historical
            attendance.
          </p>
        </div>
        <Button
          className="primary"
          disabled={preview}
          onClick={() => setEditor('new')}
        >
          <Plus size={15} /> Add {kind === 'manpower' ? 'Labour' : 'Equipment'}
        </Button>
      </section>
      <Toggle
        value={kind}
        onChange={(value) => setKind(value as AttendanceKind)}
        options={[
          ['manpower', 'Manpower'],
          ['equipment', 'Equipment'],
        ]}
      />
      <section className="card">
        <div className="attendance-toolbar">
          <label className="attendance-search">
            <Search size={15} />
            <input
              aria-label="Search resources"
              placeholder={`Search ${kind} name, ID or company`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="compact-check">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />{' '}
            Show inactive
          </label>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!shown.length ? (
          <div className="attendance-empty">
            <CircleOff />
            <h3>No {kind} records added yet.</h3>
            <p>Add the first record to begin attendance tracking.</p>
            <Button
              className="primary"
              disabled={preview}
              onClick={() => setEditor('new')}
            >
              Add {kind === 'manpower' ? 'Labour' : 'Equipment'}
            </Button>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="responsive-table resource-table">
              <thead>
                <tr>
                  <th>{kind === 'manpower' ? 'Labour' : 'Equipment'}</th>
                  <th>ID / Asset No.</th>
                  <th>Company</th>
                  <th>Daily Rate</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Name">
                      <strong>{item.name}</strong>
                    </td>
                    <td data-label="ID">{item.code}</td>
                    <td data-label="Company">{item.company}</td>
                    <td data-label="Daily Rate">
                      {formatSar(item.dailyRateHalalas)}
                    </td>
                    <td data-label="Status">
                      <span
                        className={`resource-status ${item.active ? 'active' : ''}`}
                      >
                        {item.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td data-label="Updated">{item.updatedAt.slice(0, 10)}</td>
                    <td data-label="Actions">
                      <div className="inline-actions">
                        <button
                          aria-label={`Edit ${item.name}`}
                          className="text-button"
                          disabled={preview}
                          onClick={() => setEditor(item)}
                        >
                          <Pencil size={12} /> Edit
                        </button>
                        <button
                          aria-label={`${item.active ? 'Deactivate' : 'Activate'} ${item.name}`}
                          className={`text-button ${item.active ? 'danger' : ''}`}
                          disabled={preview}
                          onClick={() => void status(item)}
                        >
                          {item.active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {editor && (
        <MasterEditor
          kind={kind}
          item={editor === 'new' ? undefined : editor}
          onClose={() => setEditor(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

function MonthNav({
  month,
  setMonth,
  today,
}: {
  month: string;
  setMonth: (month: string) => void;
  today: string;
}) {
  const change = (offset: number) => {
    const [year, value] = month.split('-').map(Number);
    const next = new Date(Date.UTC(year, value - 1 + offset, 1))
      .toISOString()
      .slice(0, 7);
    if (next <= today.slice(0, 7)) setMonth(next);
  };
  return (
    <div className="month-nav">
      <button
        type="button"
        onClick={() => change(-1)}
        aria-label="Previous month"
      >
        <ChevronLeft size={15} />
      </button>
      <strong>
        {new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        })}
      </strong>
      <button
        type="button"
        disabled={month >= today.slice(0, 7)}
        onClick={() => change(1)}
        aria-label="Next month"
      >
        <ChevronRight size={15} />
      </button>
    </div>
  );
}

function MonthlyResourceTable({
  title,
  kind,
  resources,
  attendance,
  month,
  today,
}: {
  title: string;
  kind: AttendanceKind;
  resources: Resource[];
  attendance: State['manpowerAttendance'];
  month: string;
  today: string;
}) {
  const monthRows = (attendance || []).filter(
    (entry) => entry.date.startsWith(month) && entry.date <= today,
  );
  const elapsed = daysInMonthThrough(month, today);
  return (
    <section className="card monthly-section">
      <div className="monthly-section-heading">
        <div>
          <span className="eyebrow">
            {kind === 'manpower' ? 'WORKFORCE COST' : 'PLANT COST'}
          </span>
          <h3>{title}</h3>
        </div>
        <strong>
          {formatSar(
            resources.reduce(
              (total, item) =>
                total +
                monthlyCost(
                  monthRows.filter((entry) => entry.resourceId === item.id),
                  item.dailyRateHalalas,
                ),
              0,
            ),
          )}
        </strong>
      </div>
      {!resources.length ? (
        <div className="attendance-empty">
          <CalendarDays />
          <h3>No {kind} records added yet.</h3>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="responsive-table monthly-table">
            <thead>
              <tr>
                <th>{kind === 'manpower' ? 'Labour' : 'Equipment'}</th>
                <th>ID</th>
                <th>Company</th>
                <th>P</th>
                <th>A</th>
                <th>F</th>
                <th>H</th>
                <th>Unmarked</th>
                <th>Daily Rate</th>
                <th>
                  {kind === 'manpower' ? 'Monthly Salary' : 'Monthly Cost'}
                </th>
              </tr>
            </thead>
            <tbody>
              {resources.map((item) => {
                const rows = monthRows.filter(
                  (entry) => entry.resourceId === item.id,
                );
                const count = statusCounts(rows);
                return (
                  <tr key={item.id}>
                    <td data-label="Name">
                      <strong>{item.name}</strong>
                    </td>
                    <td data-label="ID">{item.code}</td>
                    <td data-label="Company">{item.company}</td>
                    {ATTENDANCE_STATUSES.map((status) => (
                      <td data-label={status} key={status}>
                        {count[status]}
                      </td>
                    ))}
                    <td data-label="Unmarked">
                      {Math.max(0, elapsed - rows.length)}
                    </td>
                    <td data-label="Daily Rate">
                      {formatSar(item.dailyRateHalalas)}
                    </td>
                    <td data-label="Total">
                      <strong>
                        {formatSar(monthlyCost(rows, item.dailyRateHalalas))}
                      </strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function TimesheetPage({
  state,
  refresh,
  preview,
}: {
  state: State;
  refresh: () => Promise<void>;
  preview: boolean;
}) {
  const today = riyadhDate();
  const [kind, setKind] = useState<AttendanceKind>('manpower');
  const [mode, setMode] = useState<'daily' | 'monthly'>('daily');
  const [selectedDate, setSelectedDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [query, setQuery] = useState('');
  const [company, setCompany] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [draft, setDraft] = useState<
    Record<string, AttendanceStatus | undefined>
  >({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const resources = useMemo(
    () => (kind === 'manpower' ? state.manpower || [] : state.equipment || []),
    [kind, state.manpower, state.equipment],
  );
  const attendance = useMemo(
    () =>
      kind === 'manpower'
        ? state.manpowerAttendance || []
        : state.equipmentAttendance || [],
    [kind, state.manpowerAttendance, state.equipmentAttendance],
  );
  const savedForDate = useMemo(
    () =>
      Object.fromEntries(
        attendance
          .filter((entry) => entry.date === selectedDate)
          .map((entry) => [entry.resourceId, entry.status]),
      ),
    [attendance, selectedDate],
  );
  useEffect(() => {
    // oxlint-disable-next-line react/react-compiler -- Reset the working attendance draft when the selected date or server snapshot changes.
    setDraft(savedForDate);
    setMessage('');
  }, [savedForDate]);
  const active = resources.filter((item) => item.active);
  const companies = [...new Set(active.map((item) => item.company))].sort();
  const visible = active.filter((item) => {
    const text = `${item.name} ${item.code}`.toLowerCase();
    const itemStatus = draft[item.id];
    return (
      text.includes(query.toLowerCase()) &&
      (!company || item.company === company) &&
      (!statusFilter ||
        (statusFilter === 'UNMARKED'
          ? !itemStatus
          : itemStatus === statusFilter))
    );
  });
  const selectedRecords = visible.flatMap((item) =>
    draft[item.id]
      ? [
          {
            id: item.id,
            resourceId: item.id,
            date: selectedDate,
            status: draft[item.id]!,
            createdAt: '',
            updatedAt: '',
          },
        ]
      : [],
  );
  const counts = statusCounts(selectedRecords);
  const unmarked = visible.length - selectedRecords.length;
  function markAll(status: AttendanceStatus | undefined) {
    if (
      !status &&
      visible.some((item) => draft[item.id]) &&
      !window.confirm(
        `Unmark attendance for ${visible.length} visible records?`,
      )
    )
      return;
    setDraft((current) => ({
      ...current,
      ...Object.fromEntries(visible.map((item) => [item.id, status])),
    }));
    setMessage('');
  }
  async function save() {
    const changed = active
      .filter((item) => draft[item.id] !== savedForDate[item.id])
      .map((item) => ({ resourceId: item.id, status: draft[item.id] || null }));
    if (!changed.length) {
      setMessage('No attendance changes to save.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await post('attendance', { kind, date: selectedDate, entries: changed });
      await refresh();
      setMessage('Attendance saved successfully.');
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : 'Unable to save attendance.',
      );
    } finally {
      setBusy(false);
    }
  }
  const manpowerMonth = (state.manpowerAttendance || []).filter(
    (entry) => entry.date.startsWith(month) && entry.date <= today,
  );
  const equipmentMonth = (state.equipmentAttendance || []).filter(
    (entry) => entry.date.startsWith(month) && entry.date <= today,
  );
  const manpowerTotal = (state.manpower || []).reduce(
    (total, item) =>
      total +
      monthlyCost(
        manpowerMonth.filter((entry) => entry.resourceId === item.id),
        item.dailyRateHalalas,
      ),
    0,
  );
  const equipmentTotal = (state.equipment || []).reduce(
    (total, item) =>
      total +
      monthlyCost(
        equipmentMonth.filter((entry) => entry.resourceId === item.id),
        item.dailyRateHalalas,
      ),
    0,
  );
  return (
    <div className="attendance-page">
      <section className="card attendance-hero">
        <div>
          <span className="eyebrow">SITE OPERATIONS</span>
          <h2>Timesheet & Attendance</h2>
          <p>Daily attendance and exact Present-day costs in Asia/Riyadh.</p>
        </div>
        <div className="attendance-hero-icon">
          {kind === 'manpower' ? <UsersRound /> : <HardHat />}
        </div>
      </section>
      <div className="attendance-switches">
        {mode === 'daily' && (
          <Toggle
            value={kind}
            onChange={(value) => {
              setKind(value as AttendanceKind);
              setQuery('');
              setCompany('');
              setStatusFilter('');
            }}
            options={[
              ['manpower', 'Manpower'],
              ['equipment', 'Equipment'],
            ]}
          />
        )}
        <Toggle
          value={mode}
          onChange={(value) => setMode(value as 'daily' | 'monthly')}
          options={[
            ['daily', 'Daily Attendance'],
            ['monthly', 'Monthly Summary'],
          ]}
        />
      </div>
      {mode === 'daily' ? (
        <>
          <section className="card attendance-filters">
            <label className="field">
              <span>Date · Asia/Riyadh</span>
              <input
                type="date"
                max={today}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Search</span>
              <input
                placeholder={`Name or ${kind === 'manpower' ? 'Labour' : 'Equipment'} ID`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Company</span>
              <select
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              >
                <option value="">All companies</option>
                {companies.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All statuses</option>
                {ATTENDANCE_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {statusMeta[value].long}
                  </option>
                ))}
                <option value="UNMARKED">Unmarked</option>
              </select>
            </label>
          </section>
          <div className="attendance-summary">
            {ATTENDANCE_STATUSES.map((status) => (
              <div className={`attendance-stat status-${status}`} key={status}>
                <span>{statusMeta[status].long}</span>
                <strong>{counts[status]}</strong>
              </div>
            ))}
            <div className="attendance-stat">
              <span>Unmarked</span>
              <strong>{unmarked}</strong>
            </div>
          </div>
          <section className="card attendance-bulk">
            <span>Apply to {visible.length} visible active records</span>
            <div>
              {ATTENDANCE_STATUSES.map((status) => (
                <button
                  type="button"
                  className={`status-button status-${status}`}
                  onClick={() => markAll(status)}
                  key={status}
                >
                  All {statusMeta[status].long}
                </button>
              ))}
              <button
                type="button"
                className="status-button"
                onClick={() => markAll(undefined)}
              >
                Unmark All
              </button>
            </div>
          </section>
          {!active.length ? (
            <section className="card attendance-empty">
              <CircleOff />
              <h3>No {kind} records added yet.</h3>
              <p>
                Add records in Manpower & Equipment before marking attendance.
              </p>
            </section>
          ) : !visible.length ? (
            <section className="card attendance-empty">
              <Search />
              <h3>No matching records</h3>
              <p>Clear one or more filters to see active resources.</p>
            </section>
          ) : (
            <div className="attendance-card-grid">
              {visible.map((item) => (
                <article className="attendance-card card" key={item.id}>
                  <div className="attendance-card-head">
                    <div className="resource-avatar">
                      {kind === 'manpower' ? <UsersRound /> : <HardHat />}
                    </div>
                    <div>
                      <h3>{item.name}</h3>
                      <p>
                        {item.code} · {item.company}
                      </p>
                    </div>
                  </div>
                  <div className="attendance-rate">
                    {formatSar(item.dailyRateHalalas)}{' '}
                    <span>per Present day</span>
                  </div>
                  <div className="status-buttons">
                    {ATTENDANCE_STATUSES.map((status) => (
                      <button
                        type="button"
                        aria-label={`Mark ${item.name} ${statusMeta[status].long}`}
                        aria-pressed={draft[item.id] === status}
                        className={`status-${status} ${draft[item.id] === status ? 'selected' : ''}`}
                        onClick={() => {
                          setDraft((current) => ({
                            ...current,
                            [item.id]: status,
                          }));
                          setMessage('');
                        }}
                        key={status}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="attendance-savebar">
            <div>
              {message && (
                <span
                  className={
                    message.includes('successfully') ? 'save-success' : ''
                  }
                >
                  {message}
                </span>
              )}
              <small>
                {selectedDate === today ? 'Today' : 'Past attendance'} · only P
                earns the daily rate
              </small>
            </div>
            <Button
              className="primary"
              disabled={preview || busy || !active.length}
              onClick={() => void save()}
            >
              <Save size={15} /> {busy ? 'Saving…' : 'Save Attendance'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <section className="card monthly-heading">
            <MonthNav month={month} setMonth={setMonth} today={today} />
            <div>
              <p>
                Only saved Present days contribute to salary or equipment cost.
                Future dates are excluded.
              </p>
              {!preview && (
                <a
                  className="secondary"
                  href={`/api/timesheet.xlsx?month=${month}`}
                  download
                >
                  <Download size={14} /> Download Monthly Timesheet (.xlsx)
                </a>
              )}
            </div>
          </section>
          <div className="monthly-cost-grid">
            <article className="monthly-cost-card">
              <span>Manpower Total</span>
              <strong>{formatSar(manpowerTotal)}</strong>
              <small>Fixed SAR 130.00 per Present day</small>
            </article>
            <article className="monthly-cost-card">
              <span>Equipment Total</span>
              <strong>{formatSar(equipmentTotal)}</strong>
              <small>Configured rate per Present day</small>
            </article>
            <article className="monthly-cost-card grand">
              <span>Grand Total</span>
              <strong>{formatSar(manpowerTotal + equipmentTotal)}</strong>
              <small>Combined selected-month cost</small>
            </article>
          </div>
          <MonthlyResourceTable
            title="Manpower / Workers"
            kind="manpower"
            resources={state.manpower || []}
            attendance={state.manpowerAttendance}
            month={month}
            today={today}
          />
          <MonthlyResourceTable
            title="Vehicles & Equipment"
            kind="equipment"
            resources={state.equipment || []}
            attendance={state.equipmentAttendance}
            month={month}
            today={today}
          />
        </>
      )}
    </div>
  );
}

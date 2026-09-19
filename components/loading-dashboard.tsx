'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  ClipboardCheck,
  LogOut,
  Truck,
  TreePine,
  Leaf,
  Sprout,
} from 'lucide-react';
import { Badge } from './dashboard';
import { initials } from '@/lib/types';

export type LoadingTripView = {
  id: string;
  tripId: string;
  supervisorName: string;
  truckNumber: string;
  treesLoaded: number;
  departureTime: string;
  notes: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedAt: string;
  approvedAt: string | null;
};

type LoadingState = {
  user: { id: string; name: string; role: string };
  target: number;
  summary: { target: number; approved: number; pending: number; remaining: number };
  trips: LoadingTripView[];
};

const riyadhStamp = (iso: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  return match ? `${match[4]}:${match[5]} · ${match[3]}/${match[2]}/${match[1]}` : iso;
};

export function LoadingDashboard({ initialState }: { initialState: LoadingState }) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [truckNumber, setTruckNumber] = useState('');
  const [treesLoaded, setTreesLoaded] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const r = await fetch('/api/loading-state', { cache: 'no-store' });
    if (r.ok) setState(await r.json());
  }

  async function submitTrip(e: { preventDefault(): void }) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const trees = Number(treesLoaded);
    if (!truckNumber.trim()) {
      setError('Truck number is required.');
      setBusy(false);
      return;
    }
    if (!Number.isInteger(trees) || trees <= 0) {
      setError('Trees loaded must be a positive whole number.');
      setBusy(false);
      return;
    }
    try {
      const r = await fetch('/api/loading-trip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ truckNumber: truckNumber.trim(), treesLoaded: trees, notes: notes.trim() }),
      });
      const d = (await r.json()) as { tripId?: string; error?: string };
      if (!r.ok) throw Error(d.error || 'Unable to record the trip.');
      setMessage(`Trip ${d.tripId} submitted — waiting for approval.`);
      setTruckNumber('');
      setTreesLoaded('');
      setNotes('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to connect.');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } finally {
      window.location.assign('/loading-login');
    }
  }

  const pending = state.trips.filter((t) => t.status === 'PENDING');
  const completed = state.trips.filter((t) => t.status === 'APPROVED');
  // KPI cards use APPROVED trips only; pending trips never affect them.
  const summaryCards = [
    { label: 'Target', value: state.summary.target, icon: TreePine, footer: 'Tree Translocation · approved KPI' },
    { label: 'Completed Trees', value: state.summary.approved, icon: Leaf, footer: 'Approved trips only' },
    { label: 'Remaining Trees', value: state.summary.remaining, icon: TreePine, footer: 'Target minus completed trees' },
  ];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <span className="brand">
          <TreePine size={28} />
          <span>TREE CONTROL</span>
        </span>
        <nav aria-label="Loading navigation">
          <p className="nav-label">LOADING</p>
          <span className="nav-link active" aria-current="page">
            <Truck />
            <span>Loading & Offloading</span>
          </span>
        </nav>
        <p className="nav-label">GENERAL</p>
        <button type="button" className="nav-link" aria-label="Logout" title="Logout" onClick={logout}>
          <LogOut />
          <span>Logout</span>
        </button>
        <div className="sidebar-foot">
          <div className="site-note">
            <Sprout size={22} />
            <strong>
              Every tree.
              <br />A stronger tomorrow.
            </strong>
            <p>
              Tree Translocation Project
              <br />
              Project Control Dashboard
            </p>
          </div>
        </div>
      </aside>
      <section className="workspace">
        <header className="toolbar">
          <div className="toolbar-right">
            <div className="user-info">
              <span className="avatar">{initials(state.user.name)}</span>
              <div>
                <strong>{state.user.name}</strong>
                <small>Loading & Offloading</small>
              </div>
            </div>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <h1>Tree Translocation Loading</h1>
              <p>TREE TRANSLOCATION PROJECT / LOADING & OFFLOADING</p>
            </div>
            <div className="heading-actions">
              <span className="secondary" style={{ pointerEvents: 'none' }}>
                <ClipboardCheck size={14} />
                {pending.length} waiting approval
              </span>
            </div>
          </div>
          {message && <div className="notice info" role="status">{message}</div>}
          {error && (
            <div className="notice" role="alert">
              {error}
              <button type="button" onClick={() => setError('')}>Dismiss</button>
            </div>
          )}
          <div className="kpi-grid loading-kpi-grid">
            {summaryCards.map(({ label, value, icon: Icon, footer }) => (
              <article className="card kpi" key={label}>
                <div className="kpi-head">
                  <span>{label}</span>
                  <span className="round-arrow" aria-hidden="true"><Icon size={14} /></span>
                </div>
                <div className="kpi-value">{value.toLocaleString('en-US')}</div>
                <small>{footer}</small>
              </article>
            ))}
          </div>

          <section className="card">
            <div className="card-heading">
              <div>
                <h2 className="card-title">Add Trip</h2>
                <p className="card-subtitle">
                  Departure time is recorded automatically at submission (Riyadh time).
                </p>
              </div>
            </div>
            <form className="table-toolbar" onSubmit={submitTrip}>
              <input
                aria-label="Truck number"
                placeholder="Truck number"
                value={truckNumber}
                onChange={(e) => setTruckNumber(e.target.value)}
                maxLength={24}
              />
              <input
                aria-label="Number of trees loaded"
                placeholder="Trees loaded"
                inputMode="numeric"
                value={treesLoaded}
                onChange={(e) => setTreesLoaded(e.target.value.replace(/\D/g, ''))}
              />
              <input
                aria-label="Notes (optional)"
                placeholder="Notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
              />
              <button
                type="submit"
                className="primary"
                style={{ whiteSpace: 'nowrap', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7 }}
                disabled={busy}
              >
                <Truck size={13} /> Submit Trip
              </button>
            </form>
          </section>

          <section className="card">
            <div className="card-heading">
              <div>
                <h2 className="card-title">Trips Waiting for Approval</h2>
                <p className="card-subtitle">{pending.length} pending · excluded from the remaining target until approved</p>
              </div>
            </div>
            <table className="responsive-table">
              <thead>
                <tr>
                  <th>Trip ID</th>
                  <th>Truck</th>
                  <th>Trees</th>
                  <th>Departure</th>
                  <th>Notes</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((t) => (
                  <tr key={t.id}>
                    <td data-label="Trip ID">{t.tripId}</td>
                    <td data-label="Truck">{t.truckNumber}</td>
                    <td data-label="Trees">{t.treesLoaded.toLocaleString('en-US')}</td>
                    <td data-label="Departure">{riyadhStamp(t.departureTime)}</td>
                    <td data-label="Notes">{t.notes || '—'}</td>
                    <td data-label="Status"><Badge status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!pending.length && (
              <div className="empty-note">
                <ClipboardCheck size={30} />
                No trips are waiting for approval.
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-heading">
              <div>
                <h2 className="card-title">Completed Trips</h2>
                <p className="card-subtitle">{completed.length} approved · counted against the target</p>
              </div>
            </div>
            <table className="responsive-table">
              <thead>
                <tr>
                  <th>Trip ID</th>
                  <th>Truck</th>
                  <th>Trees</th>
                  <th>Departure</th>
                  <th>Approved</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {completed.map((t) => (
                  <tr key={t.id}>
                    <td data-label="Trip ID">{t.tripId}</td>
                    <td data-label="Truck">{t.truckNumber}</td>
                    <td data-label="Trees">{t.treesLoaded.toLocaleString('en-US')}</td>
                    <td data-label="Departure">{riyadhStamp(t.departureTime)}</td>
                    <td data-label="Approved">{t.approvedAt ? riyadhStamp(t.approvedAt) : '—'}</td>
                    <td data-label="Status"><Badge status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!completed.length && (
              <div className="empty-note">
                <ClipboardCheck size={30} />
                No approved trips yet.
              </div>
            )}
          </section>
          <footer
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 22,
              color: '#9ba69f',
              fontSize: 10,
            }}
          >
            <span>Tree Control · Approved work. Clear progress.</span>
            <span>
              Loading workspace <ArrowUpRight size={10} style={{ display: 'inline' }} />
            </span>
          </footer>
        </div>
      </section>
    </main>
  );
}

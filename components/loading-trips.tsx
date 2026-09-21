'use client';
import { useMemo, useState } from 'react';
import { Truck, ClipboardCheck, Plus, X } from 'lucide-react';
import { Badge } from './dashboard';
import { Modal } from './progress-form';
import { post, number } from '@/lib/types';
import type { LoadingTrip, LoadingAllocation, Block } from '@/lib/types';

const riyadhStamp = (iso: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  return match ? `${match[4]}:${match[5]} · ${match[3]}/${match[2]}/${match[1]}` : iso;
};

type Row = { blockId: string; quantity: string };

function TripAllocations({
  trip,
  allocations,
  blocks,
}: {
  trip: LoadingTrip;
  allocations: LoadingAllocation[];
  blocks: Block[];
}) {
  const rows = allocations.filter((item) => item.loadingTripId === trip.id);
  if (!rows.length) return <small>—</small>;
  return (
    <span>
      {rows.map((item, index) => (
        <span key={item.id}>
          {index > 0 && ' · '}
          {blocks.find((b) => b.id === item.blockId)?.name || item.blockId} — {number(item.quantity)}
        </span>
      ))}
    </span>
  );
}

function ReviewDialog({
  trip,
  blocks,
  onClose,
  refresh,
}: {
  trip: LoadingTrip;
  blocks: Block[];
  onClose: () => void;
  refresh: () => Promise<void>;
}) {
  const [rows, setRows] = useState<Row[]>([{ blockId: '', quantity: '' }]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const assigned = rows.reduce(
    (sum, row) => sum + (Number.isInteger(Number(row.quantity)) && row.quantity !== '' ? Number(row.quantity) : 0),
    0,
  );
  const remaining = trip.treesLoaded - assigned;
  const complete = remaining === 0 && rows.length > 0 && rows.every((r) => r.blockId && Number(r.quantity) > 0);
  const available = (current: string) =>
    blocks.filter((b) => b.id === current || !rows.some((r) => r.blockId === b.id));

  function update(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  async function submit() {
    setBusy(true);
    setError('');
    try {
      await post('trip-allocate', {
        id: trip.id,
        allocations: rows.map((row) => ({ blockId: row.blockId, quantity: Number(row.quantity) })),
      });
      await refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approval failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`Review & Assign — ${trip.tripId}`}
      description="Assign the loaded trees to blocks. The assignment must exactly match the trip total before approval can complete."
      open
      onClose={onClose}
    >
      <dl className="detail-grid">
        <div><dt>Trip ID</dt><dd>{trip.tripId}</dd></div>
        <div><dt>Truck Number</dt><dd>{trip.truckNumber}</dd></div>
        <div><dt>Loading Supervisor</dt><dd>{trip.supervisorName}</dd></div>
        <div><dt>Trees Loaded</dt><dd>{number(trip.treesLoaded)}</dd></div>
        <div><dt>Departure Time</dt><dd>{riyadhStamp(trip.departureTime)}</dd></div>
        <div><dt>Notes</dt><dd>{trip.notes || '—'}</dd></div>
      </dl>
      <div className="form-section">
        <h3>Block Assignment</h3>
        {rows.map((row, index) => (
          <div key={index} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <select
              aria-label="Block"
              value={row.blockId}
              onChange={(e) => update(index, { blockId: e.target.value })}
              style={{ flex: 2 }}
            >
              <option value="">Select Block…</option>
              {available(row.blockId).map((block) => (
                <option key={block.id} value={block.id}>{block.name}</option>
              ))}
            </select>
            <input
              aria-label="Quantity"
              type="number"
              min={1}
              placeholder="Trees"
              value={row.quantity}
              onChange={(e) => update(index, { quantity: e.target.value })}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="text-button"
              style={{ color: '#a33' }}
              aria-label="Remove allocation"
              disabled={rows.length === 1}
              onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="text-button"
          onClick={() => setRows((current) => [...current, { blockId: '', quantity: '' }])}
        >
          <Plus size={13} /> Add Another Block
        </button>
      </div>
      <div className="form-section" style={{ marginTop: 18 }}>
        <h3>Summary</h3>
        <table className="responsive-table">
          <tbody>
            <tr><td>Trip Total</td><td>{number(trip.treesLoaded)} trees</td></tr>
            <tr><td>Assigned</td><td>{number(assigned)} trees</td></tr>
            <tr>
              <td>Remaining to Assign</td>
              <td style={{ color: remaining === 0 ? '#197842' : remaining < 0 ? '#a33' : '#CC9F45' }}>
                {number(remaining)} trees
              </td>
            </tr>
          </tbody>
        </table>
        {complete && <p style={{ color: '#197842', fontWeight: 600, margin: '8px 0 0' }}>✓ Fully Assigned</p>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={busy || !complete}
          onClick={submit}
        >
          {busy ? 'Approving…' : 'Approve & Complete'}
        </button>
      </div>
    </Modal>
  );
}

export function LoadingTripsCard({
  trips,
  allocations = [],
  blocks = [],
  admin,
  preview,
  refresh,
}: {
  trips: LoadingTrip[];
  allocations?: LoadingAllocation[];
  blocks?: Block[];
  admin: boolean;
  preview: boolean;
  refresh: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [reviewing, setReviewing] = useState<LoadingTrip | null>(null);
  async function reject(id: string) {
    setBusy(id);
    setError('');
    try {
      await post('trip-review', { id, decision: 'REJECTED' });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed.');
    } finally {
      setBusy('');
    }
  }
  // Soft delete: the record stays in this history with Status DELETED plus
  // Deleted By/At, but it stops feeding Completed Trees, block progress and
  // the KPIs — the engine only counts allocations of APPROVED trips.
  async function remove(id: string) {
    if (!window.confirm('Delete this trip? Its record is kept in history but excluded from all progress and KPIs.')) return;
    setBusy(id);
    setError('');
    try {
      await post('trip-delete', { id });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setBusy('');
    }
  }
  const pending = trips.filter((t) => t.status === 'PENDING');
  return (
    <section className="card">
      <div className="card-heading">
        <div>
          <h2 className="card-title">Loading Supervisor Trips</h2>
          <p className="card-subtitle">
            {pending.length
              ? `${pending.length} waiting for review & block assignment`
              : 'All submitted truck trips have been reviewed.'}
          </p>
        </div>
        <span className="badge">
          <Truck size={12} /> {trips.length}
        </span>
      </div>
      <table className="responsive-table">
        <thead>
          <tr>
            <th>Trip ID</th>
            <th>Truck</th>
            <th>Trees</th>
            <th>Departure</th>
            <th>Supervisor</th>
            <th>Notes</th>
            <th>Status</th>
            <th>Submitted</th>
            <th>Block Allocation</th>
            {admin && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {trips.map((t) => (
            <tr key={t.id}>
              <td data-label="Trip ID">{t.tripId}</td>
              <td data-label="Truck">{t.truckNumber}</td>
              <td data-label="Trees">{number(t.treesLoaded)}</td>
              <td data-label="Departure">{riyadhStamp(t.departureTime)}</td>
              <td data-label="Supervisor">{t.supervisorName}</td>
              <td data-label="Notes">{t.notes || '—'}</td>
              <td data-label="Status"><Badge status={t.status} /></td>
              <td data-label="Submitted">{riyadhStamp(t.submittedAt)}</td>
              <td data-label="Block Allocation">
                <TripAllocations trip={t} allocations={allocations} blocks={blocks} />
              </td>
              {admin && (
                <td data-label="Action">
                  {t.status === 'PENDING' ? (
                    <>
                      <button
                        type="button"
                        className="text-button"
                        disabled={Boolean(busy) || preview}
                        onClick={() => setReviewing(t)}
                      >
                        Review &amp; Assign
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        style={{ marginLeft: 12, color: '#a33' }}
                        disabled={Boolean(busy) || preview}
                        onClick={() => reject(t.id)}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        style={{ marginLeft: 12, color: '#a33' }}
                        disabled={Boolean(busy) || preview}
                        onClick={() => remove(t.id)}
                      >
                        Delete
                      </button>
                    </>
                  ) : t.status === 'APPROVED' ? (
                    <>
                      <small>{t.approvedByName ? `by ${t.approvedByName}` : ''}</small>
                      <button
                        type="button"
                        className="text-button"
                        style={{ marginLeft: 12, color: '#a33' }}
                        disabled={Boolean(busy) || preview}
                        onClick={() => remove(t.id)}
                      >
                        Delete
                      </button>
                    </>
                  ) : t.status === 'DELETED' ? (
                    <small>Deleted{t.deletedByName ? ` by ${t.deletedByName}` : ''}{t.deletedAt ? ` · ${riyadhStamp(t.deletedAt)}` : ''}</small>
                  ) : (
                    <small>{t.approvedByName ? `by ${t.approvedByName}` : ''}</small>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!trips.length && (
        <div className="empty-note">
          <ClipboardCheck size={30} />
          No loading supervisor trips have been submitted yet.
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {reviewing && (
        <ReviewDialog
          trip={reviewing}
          blocks={blocks}
          onClose={() => setReviewing(null)}
          refresh={refresh}
        />
      )}
    </section>
  );
}

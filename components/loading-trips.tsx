'use client';
import { useState } from 'react';
import { Truck, ClipboardCheck } from 'lucide-react';
import { Badge } from './dashboard';
import { post } from '@/lib/types';
import type { LoadingTrip } from '@/lib/types';

const riyadhStamp = (iso: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  return match ? `${match[4]}:${match[5]} · ${match[3]}/${match[2]}/${match[1]}` : iso;
};

export function LoadingTripsCard({
  trips,
  admin,
  preview,
  refresh,
}: {
  trips: LoadingTrip[];
  admin: boolean;
  preview: boolean;
  refresh: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  async function review(id: string, decision: 'APPROVED' | 'REJECTED') {
    setBusy(id);
    setError('');
    try {
      await post('trip-review', { id, decision });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed.');
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
              ? `${pending.length} waiting for approval`
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
            {admin && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {trips.map((t) => (
            <tr key={t.id}>
              <td data-label="Trip ID">{t.tripId}</td>
              <td data-label="Truck">{t.truckNumber}</td>
              <td data-label="Trees">{t.treesLoaded.toLocaleString('en-US')}</td>
              <td data-label="Departure">{riyadhStamp(t.departureTime)}</td>
              <td data-label="Supervisor">{t.supervisorName}</td>
              <td data-label="Notes">{t.notes || '—'}</td>
              <td data-label="Status"><Badge status={t.status} /></td>
              <td data-label="Submitted">{riyadhStamp(t.submittedAt)}</td>
              {admin && (
                <td data-label="Action">
                  {t.status === 'PENDING' ? (
                    <>
                      <button
                        type="button"
                        className="text-button"
                        disabled={Boolean(busy) || preview}
                        onClick={() => review(t.id, 'APPROVED')}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        style={{ marginLeft: 12, color: '#a33' }}
                        disabled={Boolean(busy) || preview}
                        onClick={() => review(t.id, 'REJECTED')}
                      >
                        Reject
                      </button>
                    </>
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
    </section>
  );
}

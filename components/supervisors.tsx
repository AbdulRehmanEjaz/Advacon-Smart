'use client';
import { useState } from 'react';
import { Plus, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from './progress-form';
import { Badge } from './dashboard';
import { approvedTotals } from '@/lib/domain/calculations';
import { type State, type User, initials, number, post } from '@/lib/types';

type Action = 'create' | 'rename' | 'pin' | 'status' | 'delete' | 'history';
type Selection = { action: Action; user?: User };
const timestamp = (value: string | null) =>
  value ? new Date(value).toLocaleString() : 'Not yet';
const statusOf = (user: User) =>
  user.archivedAt ? 'Archived' : user.active ? 'Active' : 'Inactive';

export function Supervisors({
  state,
  refresh,
  preview,
}: {
  state: State;
  refresh: () => Promise<void>;
  preview: boolean;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [message, setMessage] = useState('');
  const users = (state.users || []).filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) &&
      (!status || statusOf(u) === status) &&
      (!role || u.role === role),
  );
  if (state.user.role !== 'ADMIN')
    return <div className="notice">Administrator access required.</div>;
  return (
    <section className="card supervisor-card">
      <div className="card-heading">
        <div>
          <h2 className="card-title">Supervisors & access</h2>
          <p className="card-subtitle">
            Manage your site team. Project history stays protected.
          </p>
        </div>
        <Button
          className="primary"
          disabled={preview}
          onClick={() => setSelection({ action: 'create' })}
        >
          <Plus size={16} />
          Add Supervisor
        </Button>
      </div>
      {message && <output className="notice info">{message}</output>}
      <div className="table-toolbar">
        <Input
          aria-label="Search supervisors by name"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label="Account status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All statuses</option>
          {['Active', 'Inactive', 'Archived'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="Account role"
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All roles</option>
          <option value="FOREMAN">Supervisor</option>
          <option value="ADMIN">Administrator</option>
        </select>
      </div>
      <table className="responsive-table supervisor-table">
        <thead>
          <tr>
            {[
              'Supervisor',
              'Role',
              'Status',
              'Last login',
              'Total',
              'Pending',
              'Approved',
              'Actions',
            ].map((label) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.slice(page * 10, page * 10 + 10).map((u) => {
            const history = state.submissions.filter(
              (s) => s.supervisorId === u.id,
            );
            const editable = u.role === 'FOREMAN' || u.id === state.user.id;
            return (
              <tr key={u.id}>
                <td data-label="Supervisor" aria-label={u.name}>
                  <div className="supervisor-identity">
                    <span className="avatar">{initials(u.name)}</span>
                    <span>
                      <strong>{u.name}</strong>
                      <small>{u.id}</small>
                    </span>
                  </div>
                </td>
                <td data-label="Role">
                  {u.role === 'ADMIN' ? 'Administrator' : 'Supervisor'}
                </td>
                <td data-label="Status" aria-label={statusOf(u)}>
                  <span
                    className={`access-status ${u.active ? 'is-active' : ''}`}
                  >
                    {statusOf(u)}
                  </span>
                </td>
                <td data-label="Last login">{timestamp(u.lastLogin)}</td>
                <td data-label="Total">{history.length}</td>
                <td data-label="Pending">
                  {history.filter((s) => s.status === 'WAITING').length}
                </td>
                <td data-label="Approved">
                  {history.filter((s) => s.status === 'APPROVED').length}
                </td>
                <td data-label="Actions">
                  <select
                    className="supervisor-actions"
                    aria-label={`Actions for ${u.name}`}
                    value=""
                    onChange={(e) =>
                      setSelection({
                        action: e.target.value as Action,
                        user: u,
                      })
                    }
                  >
                    <option value="" disabled>
                      Actions…
                    </option>
                    {editable && (
                      <option value="rename" disabled={preview}>
                        Edit name
                      </option>
                    )}
                    {editable && (
                      <option value="pin" disabled={preview}>
                        Set new PIN
                      </option>
                    )}
                    <option value="history">View history</option>
                    {u.role === 'FOREMAN' && (
                      <option value="status" disabled={preview}>
                        {u.active ? 'Deactivate' : 'Reactivate'}
                      </option>
                    )}
                    {u.role === 'FOREMAN' && !u.archivedAt && (
                      <option value="delete" disabled={preview}>
                        Delete supervisor
                      </option>
                    )}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!users.length && (
        <div className="empty-note">
          <UsersRound size={24} />
          <p>No matching team accounts.</p>
        </div>
      )}
      <div className="pagination">
        <button disabled={!page} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>
          {users.length} accounts · Page {page + 1} of{' '}
          {Math.max(1, Math.ceil(users.length / 10))}
        </span>
        <button
          disabled={(page + 1) * 10 >= users.length}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
      <p className="card-subtitle">
        PINs are never displayed. Inactive and archived accounts cannot sign in.
        PINs remain reserved to prevent conflicts on reactivation.
      </p>
      {selection &&
        (selection.action === 'history' ? (
          <SupervisorHistory
            state={state}
            user={selection.user!}
            onClose={() => setSelection(null)}
          />
        ) : (
          <SupervisorEditor
            selection={selection}
            onClose={() => setSelection(null)}
            onSaved={async (result) => {
              setMessage(result);
              setSelection(null);
              setPage(0);
              await refresh();
            }}
          />
        ))}
    </section>
  );
}

function SupervisorEditor({
  selection,
  onClose,
  onSaved,
}: {
  selection: Selection;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const { action, user } = selection;
  const [name, setName] = useState(user?.name || '');
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const needsPin = action === 'create' || action === 'pin';
  const title =
    action === 'create'
      ? 'Add Supervisor'
      : action === 'rename'
        ? 'Edit name'
        : action === 'pin'
          ? 'Set new PIN'
          : action === 'delete'
            ? 'Delete Supervisor'
            : user?.active
              ? 'Deactivate Supervisor'
              : 'Reactivate Supervisor';
  async function save(event: { preventDefault(): void }) {
    event.preventDefault();
    setError('');
    if (needsPin && (!/^\d{3}$/.test(pin) || pin !== confirmation)) {
      setError('Enter matching three-digit PINs.');
      return;
    }
    setBusy(true);
    try {
      const result = await post('supervisor', {
        action,
        id: user?.id,
        name,
        ...(needsPin ? { pin, confirmPin: confirmation } : {}),
        active: !user?.active,
        confirmed: true,
      });
      setPin('');
      setConfirmation('');
      await onSaved(
        result.outcome === 'archived'
          ? 'Account archived. Login disabled; all history preserved.'
          : result.outcome === 'deleted'
            ? 'Unused account permanently deleted. No project history was removed.'
            : action === 'pin'
              ? 'PIN changed. Existing sessions have been revoked.'
              : 'Account updated successfully.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update account.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={title}
      description={
        user?.name || 'Create secure access for a member of your site team.'
      }
      open
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={save}>
        {(action === 'create' || action === 'rename') && (
          <label className="field" htmlFor="supervisor-name">
            Full name
            <Input
              id="supervisor-name"
              value={name}
              required
              minLength={2}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </label>
        )}
        {needsPin && (
          <div className="form-grid section-spacer">
            <label className="field" htmlFor="supervisor-pin">
              New 3-digit PIN
              <Input
                id="supervisor-pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{3}"
                maxLength={3}
                required
                autoComplete="new-password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
            </label>
            <label className="field" htmlFor="supervisor-confirm">
              Confirm PIN
              <Input
                id="supervisor-confirm"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{3}"
                maxLength={3}
                required
                autoComplete="new-password"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
          </div>
        )}
        {action === 'pin' && (
          <p className="notice info">
            Saving signs this account out of every device. The previous PIN will
            stop working.
          </p>
        )}
        {action === 'status' && (
          <p className="notice info">
            {user?.active
              ? 'Login access will be disabled and all current sessions revoked. Submissions, approvals and reports will remain unchanged.'
              : 'Login access will be restored using the current PIN. All historical records will remain linked to this account.'}
          </p>
        )}
        {action === 'delete' && (
          <div className="notice">
            {user?.hasHistory !== false
              ? 'This Supervisor has project history and cannot be permanently removed. The account will be archived and login access disabled.'
              : 'This unused account will be permanently deleted. If any project history is found during the final check, it will be archived instead.'}
          </div>
        )}
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className={action === 'delete' ? 'danger' : 'primary'}
            disabled={busy}
          >
            {busy
              ? 'Saving…'
              : action === 'delete'
                ? 'Confirm deletion / archive'
                : 'Confirm & save'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SupervisorHistory({
  state,
  user,
  onClose,
}: {
  state: State;
  user: User;
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  const history = state.submissions.filter((s) => s.supervisorId === user.id);
  const totals = approvedTotals(history);
  return (
    <Modal
      title={user.name}
      description="Read-only submission history · quantities include approved corrections"
      open
      onClose={onClose}
    >
      <dl className="detail-grid">
        <div>
          <dt>Account ID</dt>
          <dd>{user.id}</dd>
        </div>
        <div>
          <dt>Status / role</dt>
          <dd>
            {statusOf(user)} / {user.role}
          </dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{timestamp(user.createdAt)}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{timestamp(user.updatedAt)}</dd>
        </div>
        <div>
          <dt>Last login</dt>
          <dd>{timestamp(user.lastLogin)}</dd>
        </div>
        <div>
          <dt>Submissions</dt>
          <dd>{history.length}</dd>
        </div>
      </dl>
      <h3 className="section-spacer">Total approved quantities</h3>
      <div className="supervisor-totals">
        {Object.entries(totals).map(([id, qty]) => {
          const activity = state.packages
            .flatMap((p) => p.activities)
            .find((a) => a.id === id);
          return (
            <span className="badge" key={id}>
              {activity?.name || id}: {number(qty)} {activity?.unit}
            </span>
          );
        })}
      </div>
      {!Object.keys(totals).length && (
        <p className="card-subtitle">No approved quantities recorded.</p>
      )}
      <h3 className="section-spacer">Submissions</h3>
      {history.slice(page * 10, page * 10 + 10).map((s) => (
        <article className="form-section" key={s.id}>
          <div className="card-heading">
            <strong>
              {s.workDate.slice(0, 10)} · Zone{' '}
              {state.blocks.find((b) => b.id === s.blockId)?.zoneId ||
                s.blockId[0]}{' '}
              / {s.blockId}
            </strong>
            <Badge status={s.status} />
          </div>
          <p className="card-subtitle">
            {state.packages.find((p) => p.id === s.packageId)?.name} · {s.id}
          </p>
          {s.items.map((i) => (
            <p key={i.id}>
              {
                state.packages
                  .flatMap((p) => p.activities)
                  .find((a) => a.id === i.activityId)?.name
              }
              : {number(i.quantity)}
            </p>
          ))}
          {s.approvals.map((a, index) => (
            <p className="card-subtitle" key={index}>
              {a.decision} · {timestamp(a.createdAt)} ·{' '}
              {a.comment || 'No review comment'}
            </p>
          ))}
        </article>
      ))}
      {!history.length && (
        <div className="empty-note">
          No submissions recorded for this account.
        </div>
      )}
      <div className="pagination">
        <button disabled={!page} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>Page {page + 1}</span>
        <button
          disabled={(page + 1) * 10 >= history.length}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
    </Modal>
  );
}

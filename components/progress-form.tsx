'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { type State, number, post } from '@/lib/types';
import { calculateKpiProgress, targetFor, type Submission } from '@/lib/domain/calculations';
import { riyadhDate } from '@/lib/domain/date';
function fieldText(value: unknown) {
  return typeof value === 'string'
    ? value
    : typeof value === 'number'
      ? String(value)
      : '';
}
export function Modal({
  title,
  description,
  open,
  onClose,
  children,
}: {
  title: string;
  description: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl p-6 rounded-2xl">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <div className="modal-body">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
export function ProgressForm({
  state,
  open,
  onClose,
  onSaved,
  editing,
}: {
  state: State;
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  editing?: Submission;
}) {
  const sitePackages = useMemo(
    () => state.packages.filter(
      (item) => !['mobilization', 'drawings'].includes(item.id),
    ),
    [state.packages],
  );
  const [packageId, setPackage] = useState(sitePackages[0]?.id || ''),
    [blockId, setBlock] = useState(''),
    [zone, setZone] = useState('A'),
    [workDate, setDate] = useState(riyadhDate()),
    [quantities, setQuantities] = useState<Record<string, string>>({}),
    [remarks, setRemarks] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [requestKey, setRequestKey] = useState('');
  useEffect(() => {
    if (open) {
      // oxlint-disable-next-line react/react-compiler -- Reset the draft only when the modal opens or selected record changes.
      setPackage(editing?.packageId || sitePackages[0]?.id || '');
      setBlock(editing?.blockId || '');
      setZone(editing?.blockId?.[0] || 'A');
      setDate(editing?.workDate.slice(0, 10) || riyadhDate());
      setQuantities(
        Object.fromEntries(
          editing?.items.map((i) => [i.activityId, String(i.quantity)]) || [],
        ),
      );
      setRemarks(editing?.remarks || '');
      setError('');
      setRequestKey(crypto.randomUUID());
    }
  }, [open, editing, sitePackages]);
  const pkg = state.packages.find((p) => p.id === packageId);
  const official = calculateKpiProgress(
    state.packages,
    state.openingBalances,
    state.submissions,
    state.settings!,
  );
  const needsBlock = ['translocation', 'new-trees'].includes(packageId);
  const finalCompletion = packageId === 'final-completion';
  async function save(e: { preventDefault(): void }) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const items = finalCompletion
        ? [{ activityId: 'kpi-final-handover', quantity: 1 }]
        : Object.entries(quantities)
        .filter(([, q]) => Number(q) > 0)
        .map(([activityId, q]) => ({ activityId, quantity: Number(q) }));
      if (finalCompletion && quantities['kpi-final-handover'] !== '1')
        throw Error('Confirm that final completion is complete.');
      if (!items.length) throw Error('Enter at least one completed quantity.');
      await post('submission', {
        id: editing?.id,
        version: editing?.version,
        requestKey,
        workDate,
        blockId: needsBlock ? blockId : null,
        packageId,
        remarks,
        items,
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={editing ? 'Revise & resubmit' : 'Add Daily Progress'}
      description="Record completed site quantities. Only approved work counts toward project progress."
      open={open}
      onClose={onClose}
    >
      <form onSubmit={save}>
        <div className="form-grid">
          {state.user.role === 'FOREMAN' ? (
            <label className="field">
              Work date · Asia/Riyadh
              <input type="text" readOnly value={workDate} />
              <small>Site Supervisors can submit today only.</small>
            </label>
          ) : (
            <label className="field">
              Work date
              <input type="date" required value={workDate} onChange={(e) => setDate(e.target.value)} />
            </label>
          )}
          <label className="field">
            Work package
            <select
              value={packageId}
              onChange={(e) => {
                setPackage(e.target.value);
                setBlock('');
                setQuantities({});
              }}
            >
              {sitePackages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {needsBlock && <>
            <label className="field">
              Zone
              <select value={zone} onChange={(e) => { setZone(e.target.value); setBlock(''); }}>
                {['A', 'B', 'C', 'D'].map((z) => <option key={z}>{z}</option>)}
              </select>
            </label>
            <label className="field">
              Block
              <select required value={blockId} onChange={(e) => setBlock(e.target.value)}>
                <option value="">Select block</option>
                {state.blocks.filter((b) => b.zoneId === zone).map((b) => (
                  <option key={b.id} value={b.id}>{b.id}</option>
                ))}
              </select>
            </label>
          </>}
        </div>
        <div className="form-section">
          <h3>{pkg?.name} · {finalCompletion ? 'Completion confirmation' : 'Quantities completed today'}</h3>
          <div className="form-grid">
            {finalCompletion ? (
              <label className="field completion-check">
                <input
                  type="checkbox"
                  checked={quantities['kpi-final-handover'] === '1'}
                  onChange={(event) => setQuantities({ 'kpi-final-handover': event.target.checked ? '1' : '' })}
                  required
                />
                Completed
                <small>Creates a waiting submission. Progress is earned only after Admin approval.</small>
              </label>
            ) : pkg?.activities.map((a) => (
              <label className="field" key={a.id}>
                {a.name}
                <span className="card-subtitle">
                  Target {number(targetFor(a, state.settings!) || 100)} {a.unit} ·
                  Official {number(official.totals[a.id] || 0)} ·
                  Remaining {number(Math.max(0, (targetFor(a, state.settings!) || 100) - (official.totals[a.id] || 0)))}
                </span>
                <input
                  type="number"
                  min="0"
                  max={Math.max(0, (targetFor(a, state.settings!) || 100) - (official.totals[a.id] || 0))}
                  step={a.unit === 'm' ? '.001' : '1'}
                  placeholder="0"
                  value={quantities[a.id] || ''}
                  onChange={(e) =>
                    setQuantities((q) => ({ ...q, [a.id]: e.target.value }))
                  }
                />
                <small>
                  {a.unit.toLowerCase() === 'milestone'
                    ? '1 = completed milestone'
                    : a.unit + ' · approved quantities only count after review'}
                </small>
              </label>
            ))}
          </div>
        </div>
        <div className="form-grid">
          <label className="field full">
            Remarks
            <textarea
              rows={3}
              maxLength={3000}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </label>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <Button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Submit for Approval'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export type Field = {
  key: string;
  label: string;
  type?: 'number' | 'date' | 'password' | 'checkbox' | 'textarea' | 'select';
  options?: { value: string; label: string }[];
  required?: boolean;
  step?: string;
  min?: number;
  max?: number;
  hint?: string;
};
export function Editor({
  title,
  description,
  fields,
  initial,
  path,
  onClose,
  onSaved,
  transform,
}: {
  title: string;
  description: string;
  fields: Field[];
  initial: Record<string, unknown>;
  path: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  transform?: (v: Record<string, unknown>) => unknown;
}) {
  const [values, setValues] = useState(initial),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await post(path, transform ? transform(values) : values);
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={title} description={description} open onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          {fields.map((f) => (
            <label
              className={`field ${f.type === 'textarea' ? 'full' : ''}`}
              key={f.key}
            >
              {f.label}
              {f.type === 'select' ? (
                <select
                  required={f.required}
                  value={fieldText(values[f.key])}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [f.key]: e.target.value }))
                  }
                >
                  <option value="">Select…</option>
                  {f.options?.map((o) => (
                    <option value={o.value} key={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === 'textarea' ? (
                <textarea
                  required={f.required}
                  rows={3}
                  maxLength={2000}
                  value={fieldText(values[f.key])}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [f.key]: e.target.value }))
                  }
                />
              ) : f.type === 'checkbox' ? (
                <input
                  type="checkbox"
                  checked={Boolean(values[f.key])}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [f.key]: e.target.checked }))
                  }
                  style={{ width: 20, minHeight: 20 }}
                />
              ) : (
                <input
                  type={f.type || 'text'}
                  required={f.required}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  maxLength={f.type === 'password' ? 3 : undefined}
                  inputMode={f.type === 'password' ? 'numeric' : undefined}
                  autoComplete={
                    f.type === 'password' ? 'new-password' : undefined
                  }
                  value={fieldText(values[f.key])}
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      [f.key]:
                        f.type === 'number'
                          ? e.target.value === ''
                            ? null
                            : Number(e.target.value)
                          : e.target.value,
                    }))
                  }
                />
              )}
              {f.hint && <small>{f.hint}</small>}
            </label>
          ))}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <Button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

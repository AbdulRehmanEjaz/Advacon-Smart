'use client';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { type State, post, today } from '@/lib/types';
import type { Submission } from '@/lib/domain/calculations';
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
  const [packageId, setPackage] = useState('irrigation'),
    [blockId, setBlock] = useState(''),
    [zone, setZone] = useState('A'),
    [workDate, setDate] = useState(today()),
    [quantities, setQuantities] = useState<Record<string, string>>({}),
    [batch, setBatch] = useState(''),
    [remarks, setRemarks] = useState(''),
    [override, setOverride] = useState(''),
    [photos, setPhotos] = useState<File[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [requestKey, setRequestKey] = useState('');
  useEffect(() => {
    if (open) {
      // oxlint-disable-next-line react/react-compiler -- Reset the draft only when the modal opens or selected record changes.
      setPackage(editing?.packageId || 'irrigation');
      setBlock(editing?.blockId || '');
      setZone(editing?.blockId[0] || 'A');
      setDate(editing?.workDate.slice(0, 10) || today());
      setQuantities(
        Object.fromEntries(
          editing?.items.map((i) => [i.activityId, String(i.quantity)]) || [],
        ),
      );
      setRemarks(editing?.remarks || '');
      setBatch(editing?.batchNumber || '');
      setOverride('');
      setPhotos([]);
      setError('');
      setRequestKey(crypto.randomUUID());
    }
  }, [open, editing]);
  const pkg = state.packages.find((p) => p.id === packageId);
  async function save(e: { preventDefault(): void }) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const items = Object.entries(quantities)
        .filter(([, q]) => Number(q) > 0)
        .map(([activityId, q]) => ({ activityId, quantity: Number(q) }));
      if (!items.length) throw Error('Enter at least one completed quantity.');
      const result = await post('submission', {
        id: editing?.id,
        version: editing?.version,
        requestKey,
        workDate,
        blockId,
        packageId,
        batchNumber: batch,
        remarks,
        overrideReason: override || undefined,
        items,
      });
      let failed = 0;
      for (const file of photos) {
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          let value = '';
          for (let i = 0; i < bytes.length; i += 8192)
            value += String.fromCharCode(...bytes.subarray(i, i + 8192));
          await post('photo', {
            submissionId: result.id,
            name: file.name,
            mime: file.type,
            data: btoa(value),
          });
        } catch {
          failed++;
        }
      }
      await onSaved();
      if (failed) {
        setError(
          `Submission saved, but ${failed} photo(s) could not be uploaded. Close this form and attach them from the submission details.`,
        );
        setPhotos([]);
        return;
      }
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
          <label className="field">
            Work date
            <input
              type="date"
              required
              value={workDate}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="field">
            Work package
            <select
              value={packageId}
              onChange={(e) => {
                setPackage(e.target.value);
                setQuantities({});
              }}
            >
              {state.packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Zone
            <select
              value={zone}
              onChange={(e) => {
                setZone(e.target.value);
                setBlock('');
              }}
            >
              {['A', 'B', 'C', 'D'].map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Block
            <select
              required
              value={blockId}
              onChange={(e) => setBlock(e.target.value)}
            >
              <option value="">Select block</option>
              {state.blocks
                .filter((b) => b.zoneId === zone)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.id}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div className="form-section">
          <h3>{pkg?.name} · Quantities completed today</h3>
          <div className="form-grid">
            {pkg?.activities.map((a) => (
              <label className="field" key={a.id}>
                {a.name}
                <input
                  type="number"
                  min="0"
                  max={a.unit === 'milestone' ? 1 : 1000000}
                  step={a.unit === 'm' ? '.001' : '1'}
                  placeholder="0"
                  value={quantities[a.id] || ''}
                  onChange={(e) =>
                    setQuantities((q) => ({ ...q, [a.id]: e.target.value }))
                  }
                />
                <small>
                  {a.unit === 'milestone'
                    ? '1 = completed milestone'
                    : a.unit +
                      ' · cumulative stage quantities must follow sequence'}
                </small>
              </label>
            ))}
          </div>
        </div>
        <div className="form-grid">
          <label className="field">
            Batch / inspection reference
            <input
              maxLength={100}
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
            />
          </label>
          <label className="field">
            Site photos
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (
                  files.length > 5 ||
                  files.some((f) => f.size > 5 * 1024 * 1024)
                ) {
                  setError('Maximum five photos, 5 MB each.');
                  e.target.value = '';
                  return;
                }
                setPhotos(files);
              }}
            />
            <small>JPG, PNG or WebP · up to 5 MB each</small>
          </label>
          <label className="field full">
            Remarks
            <textarea
              rows={3}
              maxLength={3000}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </label>
          {state.user.role === 'ADMIN' && (
            <label className="field full">
              Readiness / capacity override reason (only if necessary)
              <textarea
                maxLength={2000}
                value={override}
                onChange={(e) => setOverride(e.target.value)}
              />
              <small>
                Overrides are recorded permanently in the audit log and checked
                again during approval.
              </small>
            </label>
          )}
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

'use client';

import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Droplets, FileCheck2, FileText, Fuel, Pencil, Plus, ReceiptText, Trash2, UsersRound, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from './progress-form';
import { formatSar } from '@/lib/domain/attendance';
import { costSummary, parseScaledDecimal, vatBreakdown, type CostDocumentType, type FuelRecord, type InvoicePoRecord, type VatStatus } from '@/lib/domain/costs';
import { riyadhDate } from '@/lib/domain/date';
import { post, type State } from '@/lib/types';

const COLORS = ['#087443', '#51a878', '#d2a84b', '#244e34', '#6aa982'];
const money = (halalas: number) => (halalas / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Money({ value }: { value: number }) {
  return <span className="riyal-money" aria-label={`${money(value)} Saudi riyals`}><i className="riyal-symbol" aria-hidden="true" />{money(value)}</span>;
}

function CostTooltip({ active, payload, label }: { active?: boolean; payload?: { value?: number; name?: string; payload?: { company?: string } }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return <div className="cost-tooltip"><strong>{label || payload[0].name}</strong>{payload[0].payload?.company && <small>{payload[0].payload.company}</small>}<Money value={Number(payload[0].value || 0)} /></div>;
}

function VatPreview({ amount, vatStatus }: { amount: string; vatStatus: VatStatus }) {
  let preview = null;
  try { preview = vatBreakdown(parseScaledDecimal(amount, 100), vatStatus); } catch {}
  if (!preview) return null;
  return <div className="vat-preview">
    <span>{vatStatus === 'VAT_INCLUDED' ? 'Gross Amount' : 'Entered Amount'}<Money value={preview.enteredAmountHalalas} /></span>
    <span>VAT Removed<Money value={preview.vatRemovedHalalas} /></span>
    <strong>Net Amount<Money value={preview.netAmountHalalas} /></strong>
  </div>;
}

function FuelEditor({ item, onClose, onSaved }: { item?: FuelRecord; onClose: () => void; onSaved: () => Promise<void> }) {
  const [date, setDate] = useState(item?.date || riyadhDate());
  const [fuelType, setFuelType] = useState(item?.fuelType || 'DIESEL');
  const [quantity, setQuantity] = useState(item ? String(item.quantityMillilitres / 1000) : '');
  const [vatStatus, setVatStatus] = useState<VatStatus>(item?.vatStatus || 'NON_VAT');
  const [amount, setAmount] = useState(item ? money(item.enteredAmountHalalas) : '');
  const [description, setDescription] = useState(item?.description || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: { preventDefault(): void }) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await post('fuel', { action: 'save', id: item?.id, date, fuelType, quantityMillilitres: parseScaledDecimal(quantity, 1000), vatStatus, enteredAmountHalalas: parseScaledDecimal(amount, 100), description });
      await onSaved(); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save fuel record.'); }
    finally { setBusy(false); }
  }
  return <Modal open title={`${item ? 'Edit' : 'Add'} Fuel Record`} description="VAT-inclusive amounts are converted to non-VAT project cost using the Saudi 15% VAT rate." onClose={onClose}>
    <form onSubmit={save}><div className="form-grid">
      <label className="field">Date<input required type="date" max={riyadhDate()} value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label className="field">Fuel Type<select value={fuelType} onChange={(event) => setFuelType(event.target.value as 'PETROL' | 'DIESEL')}><option value="PETROL">Petrol</option><option value="DIESEL">Diesel</option></select></label>
      <label className="field">Quantity (litres)<input required inputMode="decimal" placeholder="0.000" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
      <label className="field">VAT Status<select value={vatStatus} onChange={(event) => setVatStatus(event.target.value as VatStatus)}><option value="NON_VAT">Non-VAT</option><option value="VAT_INCLUDED">VAT Included</option></select></label>
      <label className="field">Fuel Amount / Price<input required inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      <label className="field full">Description / Notes<textarea maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    </div><VatPreview amount={amount} vatStatus={vatStatus} />
    {error && <p className="error" role="alert">{error}</p>}<div className="form-actions"><button className="secondary" type="button" onClick={onClose}>Cancel</button><Button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save Fuel Record'}</Button></div></form>
  </Modal>;
}

function CostDocumentEditor({ kind, item, onClose, onSaved }: { kind: CostDocumentType; item?: InvoicePoRecord; onClose: () => void; onSaved: () => Promise<void> }) {
  const label = kind === 'PO' ? 'PO' : 'Invoice';
  const [date, setDate] = useState(item?.date || riyadhDate());
  const [vatStatus, setVatStatus] = useState<VatStatus>(item?.vatStatus || 'NON_VAT');
  const [invoiceNo, setInvoiceNo] = useState(item?.invoiceNo || '');
  const [poNo, setPoNo] = useState(item?.poNo || '');
  const [amount, setAmount] = useState(item ? money(item.enteredAmountHalalas) : '');
  const [paidBy, setPaidBy] = useState(item?.paidBy || '');
  const [description, setDescription] = useState(item?.description || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: { preventDefault(): void }) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await post('invoice-po', { action: 'save', id: item?.id, recordType: kind, date, vatStatus, invoiceNo, poNo: kind === 'PO' ? poNo : '', enteredAmountHalalas: parseScaledDecimal(amount, 100), paidBy, description });
      await onSaved(); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : `Unable to save ${label.toLowerCase()}.`); }
    finally { setBusy(false); }
  }
  return <Modal open title={`${item ? 'Edit' : 'Add'} ${label}`} description="VAT-inclusive amounts are divided by 1.15 exactly once; only the net amount enters project cost." onClose={onClose}>
    <form onSubmit={save}><div className="form-grid">
      <label className="field">Date<input required type="date" max={riyadhDate()} value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label className="field">VAT Status<select value={vatStatus} onChange={(event) => setVatStatus(event.target.value as VatStatus)}><option value="NON_VAT">Non-VAT</option><option value="VAT_INCLUDED">VAT Included</option></select></label>
      <label className="field">Invoice No.<input required maxLength={100} value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} /></label>
      {kind === 'PO' && <label className="field">PO No.<input required maxLength={100} value={poNo} onChange={(event) => setPoNo(event.target.value)} /></label>}
      <label className="field">Amount (SAR)<input required inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      <label className="field">Paid By<input required maxLength={150} value={paidBy} onChange={(event) => setPaidBy(event.target.value)} /></label>
      <label className="field full">Description<textarea maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    </div><VatPreview amount={amount} vatStatus={vatStatus} />
    {error && <p className="error" role="alert">{error}</p>}<div className="form-actions"><button className="secondary" type="button" onClick={onClose}>Cancel</button><Button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : `Save ${label}`}</Button></div></form>
  </Modal>;
}

function DocumentSection({ kind, items, subtotal, preview, onAdd, onEdit, onArchive }: { kind: CostDocumentType; items: InvoicePoRecord[]; subtotal: number; preview: boolean; onAdd: () => void; onEdit: (item: InvoicePoRecord) => void; onArchive: (id: string) => void }) {
  const plural = kind === 'PO' ? 'POs' : 'Invoices';
  return <section className="card cost-section cost-document-section">
    <div className="card-heading"><div><h3>{plural}</h3><p>Separate {plural.toLowerCase()} register · net project cost</p></div><Button className="primary" disabled={preview} onClick={onAdd}><Plus size={14} /> Add {kind === 'PO' ? 'PO' : 'Invoice'}</Button></div>
    {!items.length ? <p className="cost-empty">No {plural.toLowerCase()} recorded through today.</p> : <div className="cost-records">{items.map((item) => <article key={item.id}>
      <div><strong>Invoice {item.invoiceNo || 'Legacy record'}{kind === 'PO' && ` · PO ${item.poNo || 'Legacy record'}`}</strong><small>{item.date} · {item.vatStatus === 'VAT_INCLUDED' ? 'VAT Included' : 'Non-VAT'}{item.paidBy ? ` · Paid by ${item.paidBy}` : ''}{item.description ? ` · ${item.description}` : ''}</small></div>
      <div className="cost-record-amount"><Money value={item.netAmountHalalas} /><small>{item.vatRemovedHalalas ? `Gross ${formatSar(item.enteredAmountHalalas)} · VAT removed ${formatSar(item.vatRemovedHalalas)}` : 'Entered amount used in full'}</small></div>
      <div className="inline-actions"><button className="text-button" onClick={() => onEdit(item)}><Pencil size={12} /> Edit</button><button className="text-button danger" onClick={() => onArchive(item.id)}><Trash2 size={12} /> Archive</button></div>
    </article>)}</div>}
    <div className="cost-document-subtotal"><span>{plural} subtotal</span><strong><Money value={subtotal} /></strong></div>
  </section>;
}

export function CostControlPage({ state, refresh, preview }: { state: State; refresh: () => Promise<void>; preview: boolean }) {
  const throughDate = riyadhDate();
  const [fuelEditor, setFuelEditor] = useState<FuelRecord | 'new' | null>(null);
  const [invoiceEditor, setInvoiceEditor] = useState<InvoicePoRecord | 'new' | null>(null);
  const [poEditor, setPoEditor] = useState<InvoicePoRecord | 'new' | null>(null);
  const [error, setError] = useState('');
  const input = useMemo(() => ({ manpower: state.manpower || [], equipment: state.equipment || [], manpowerAttendance: state.manpowerAttendance || [], equipmentAttendance: state.equipmentAttendance || [], fuelRecords: state.fuelRecords || [], invoicePoRecords: state.invoicePoRecords || [] }), [state]);
  const summary = useMemo(() => costSummary({ throughDate, ...input }), [input, throughDate]);
  const trend = useMemo(() => {
    const dates = [...input.manpowerAttendance, ...input.equipmentAttendance,
      ...input.fuelRecords.filter((record) => record.active),
      ...input.invoicePoRecords.filter((record) => record.active)]
      .map((record) => record.date).filter((date) => date <= throughDate).sort();
    const firstMonth = (dates[0] || throughDate).slice(0, 7);
    const [firstYear, firstNumber] = firstMonth.split('-').map(Number);
    const [lastYear, lastNumber] = throughDate.slice(0, 7).split('-').map(Number);
    return Array.from({ length: (lastYear - firstYear) * 12 + lastNumber - firstNumber + 1 }, (_, index) => {
      const key = new Date(Date.UTC(firstYear, firstNumber - 1 + index, 1)).toISOString().slice(0, 7);
      return { month: new Date(key + '-01T00:00:00Z').toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
        value: costSummary({ month: key, throughDate, ...input }).totalHalalas };
    });
  }, [input, throughDate]);
  const composition = [
    { name: 'Manpower', value: summary.manpowerHalalas, fill: COLORS[0] },
    { name: 'Equipment', value: summary.equipmentHalalas, fill: COLORS[1] },
    { name: 'Fuel', value: summary.fuelHalalas, fill: COLORS[2] },
    { name: 'Invoices', value: summary.invoiceHalalas, fill: COLORS[3] },
    { name: 'POs', value: summary.poHalalas, fill: COLORS[4] },
  ];
  const fuelAnalysis = ['PETROL', 'DIESEL'].map((type) => ({ name: type === 'PETROL' ? 'Petrol' : 'Diesel', litres: summary.fuel.filter((item) => item.fuelType === type).reduce((sum, item) => sum + item.quantityMillilitres, 0) / 1000, value: summary.fuel.filter((item) => item.fuelType === type).reduce((sum, item) => sum + item.netAmountHalalas, 0) }));
  async function archive(path: 'fuel' | 'invoice-po', id: string) {
    if (!window.confirm('Archive this cost record? Historical audit data will be preserved.')) return;
    try { await post(path, { action: 'archive', id }); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to archive record.'); }
  }
  return <div className="cost-page">
    <section className="card cost-hero"><div><span className="eyebrow">FINANCIAL CONTROL</span><h2>Total Recorded Project Cost — Non-VAT</h2><p>Live attendance-derived costs plus recorded Fuel, Invoice and PO net amounts.</p></div></section>
    {error && <div className="notice" role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
    <div className="cost-kpis">
      <article className="cost-kpi featured"><span>Total Recorded Project Cost — Non-VAT</span><strong><Money value={summary.totalHalalas} /></strong><small>No VAT is included in this figure</small></article>
      <article className="cost-kpi"><UsersRound /><span>Manpower Total</span><strong><Money value={summary.manpowerHalalas} /></strong><small>Present days × 130</small></article>
      <article className="cost-kpi"><Wrench /><span>Equipment Total</span><strong><Money value={summary.equipmentHalalas} /></strong><small>Present days × equipment rate</small></article>
      <article className="cost-kpi"><Fuel /><span>Fuel Net Cost</span><strong><Money value={summary.fuelHalalas} /></strong><small>After applicable VAT removal</small></article>
      <article className="cost-kpi"><ReceiptText /><span>Invoices Net</span><strong><Money value={summary.invoiceHalalas} /></strong><small>Invoice net project cost</small></article>
      <article className="cost-kpi"><FileCheck2 /><span>POs Net</span><strong><Money value={summary.poHalalas} /></strong><small>Purchase order net project cost</small></article>
      <article className="cost-kpi vat"><FileText /><span>Total VAT Removed</span><strong><Money value={summary.vatRemovedHalalas} /></strong><small>VAT-inclusive records only</small></article>
    </div>
    <div className="cost-chart-grid">
      <section className="card cost-chart"><div className="card-heading"><div><h3>Cost Composition</h3><p>Project-to-date · non-VAT amounts</p></div></div><ResponsiveContainer width="100%" height={250}><PieChart><Pie data={composition} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={3} /><Tooltip content={<CostTooltip />} /></PieChart></ResponsiveContainer><div className="cost-legend">{composition.map((item, index) => <span key={item.name}><i style={{ background: COLORS[index] }} />{item.name} <b><Money value={item.value} /></b></span>)}</div></section>
      <section className="card cost-chart wide"><div className="card-heading"><div><h3>Monthly Cost Trend</h3><p>Monthly history from the first project record</p></div></div><ResponsiveContainer width="100%" height={250}><AreaChart data={trend}><defs><linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#087443" stopOpacity={0.28} /><stop offset="1" stopColor="#087443" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf1ee" /><XAxis dataKey="month" axisLine={false} tickLine={false} /><YAxis hide /><Tooltip content={<CostTooltip />} /><Area type="monotone" dataKey="value" name="Project cost" stroke="#087443" strokeWidth={3} fill="url(#costFill)" /></AreaChart></ResponsiveContainer></section>
    </div>
    <section className="card cost-section"><div className="card-heading"><div><h3>Equipment Cost Analysis</h3><p>Live equipment attendance and configured daily rates</p></div><strong><Money value={summary.equipmentHalalas} /></strong></div>{!summary.equipment.length ? <p className="cost-empty">No equipment records are available.</p> : <><ResponsiveContainer width="100%" height={220}><BarChart data={summary.equipment.map((row) => ({ name: row.resource.name, company: row.resource.company, value: row.totalHalalas }))}><CartesianGrid vertical={false} stroke="#edf1ee" /><XAxis dataKey="name" axisLine={false} tickLine={false} /><YAxis hide /><Tooltip content={<CostTooltip />} /><Bar dataKey="value" fill="#2f9b67" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer><div className="table-scroll"><table className="responsive-table"><thead><tr><th>Equipment</th><th>Rental Company</th><th>Project-to-date Total</th></tr></thead><tbody>{summary.equipment.map((row) => <tr key={row.resource.id}><td data-label="Equipment"><strong>{row.resource.name}</strong></td><td data-label="Rental Company">{row.resource.company}</td><td data-label="Project-to-date Total"><Money value={row.totalHalalas} /></td></tr>)}</tbody><tfoot><tr><th colSpan={2}>Equipment Total</th><th><Money value={summary.equipmentHalalas} /></th></tr></tfoot></table></div></>}</section>
    <section className="card cost-section"><div className="card-heading"><div><h3>Fuel</h3><p>Petrol and Diesel · clear VAT treatment</p></div><Button className="primary" disabled={preview} onClick={() => setFuelEditor('new')}><Plus size={14} /> Add Fuel</Button></div><div className="fuel-mini-chart">{fuelAnalysis.map((item) => <div key={item.name}><span>{item.name}</span><strong>{item.litres.toLocaleString()} L</strong><Money value={item.value} /></div>)}</div>{!summary.fuel.length ? <p className="cost-empty">No fuel costs recorded through today.</p> : <div className="cost-records">{summary.fuel.map((item) => <article key={item.id}><div><strong>{item.fuelType === 'PETROL' ? 'Petrol' : 'Diesel'} · {(item.quantityMillilitres / 1000).toLocaleString()} L</strong><small>{item.date} · {item.vatStatus === 'VAT_INCLUDED' ? 'VAT Included' : 'Non-VAT'}</small></div><div className="cost-record-amount"><Money value={item.netAmountHalalas} /><small>{item.vatRemovedHalalas ? `VAT removed ${formatSar(item.vatRemovedHalalas)}` : 'Entered amount used in full'}</small></div><div className="inline-actions"><button className="text-button" onClick={() => setFuelEditor(item)}><Pencil size={12} /> Edit</button><button className="text-button danger" onClick={() => void archive('fuel', item.id)}><Trash2 size={12} /> Archive</button></div></article>)}</div>}</section>
    <div className="two-columns cost-document-grid">
      <DocumentSection kind="INVOICE" items={summary.invoices} subtotal={summary.invoiceHalalas} preview={preview} onAdd={() => setInvoiceEditor('new')} onEdit={setInvoiceEditor} onArchive={(id) => void archive('invoice-po', id)} />
      <DocumentSection kind="PO" items={summary.purchaseOrders} subtotal={summary.poHalalas} preview={preview} onAdd={() => setPoEditor('new')} onEdit={setPoEditor} onArchive={(id) => void archive('invoice-po', id)} />
    </div>
    <section className="card cost-summary-card"><div><Droplets /><span>Project-to-date formula</span><strong>Manpower + Equipment + Fuel Net + Invoices Net + POs Net</strong></div><strong><Money value={summary.totalHalalas} /></strong></section>
    {fuelEditor && <FuelEditor item={fuelEditor === 'new' ? undefined : fuelEditor} onClose={() => setFuelEditor(null)} onSaved={refresh} />}
    {invoiceEditor && <CostDocumentEditor kind="INVOICE" item={invoiceEditor === 'new' ? undefined : invoiceEditor} onClose={() => setInvoiceEditor(null)} onSaved={refresh} />}
    {poEditor && <CostDocumentEditor kind="PO" item={poEditor === 'new' ? undefined : poEditor} onClose={() => setPoEditor(null)} onSaved={refresh} />}
  </div>;
}

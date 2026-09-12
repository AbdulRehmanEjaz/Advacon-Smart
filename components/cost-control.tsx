'use client';

import { useMemo, useState, useId, type ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowUpRight, ChevronDown, Droplets, FileCheck2, FileText, Fuel, Pencil, Plus, ReceiptText, Trash2, UsersRound, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from './progress-form';
import { costSummary, parseScaledDecimal, inclusiveCost, documentCost, financialRecordCost, type CostDocumentType, type FuelRecord, type InvoicePoRecord, type VatStatus } from '@/lib/domain/costs';
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

function VatPreview({ amount, vatStatus, document = false }: { amount: string; vatStatus: VatStatus; document?: boolean }) {
  let preview = null;
  try { preview = (document ? documentCost : inclusiveCost)(parseScaledDecimal(amount, 100), vatStatus); } catch {}
  if (!preview) return null;
  return <div className="vat-preview">
    <span>Total Including VAT<Money value={preview.grossHalalas} /></span>
    <span>VAT Amount (15%)<Money value={preview.vatHalalas} /></span>
    <strong>Amount Without VAT<Money value={preview.netHalalas} /></strong>
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
  return <Modal open title={`${item ? 'Edit' : 'Add'} Fuel Record`} description="Non-VAT amounts receive 15% VAT. VAT Included amounts are used as entered." onClose={onClose}>
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
  return <Modal open title={`${item ? 'Edit' : 'Add'} ${label}`} description="Non-VAT amounts are final with zero VAT. VAT Included amounts already include VAT; it is never added again." onClose={onClose}>
    <form onSubmit={save}><div className="form-grid">
      <label className="field">Date<input required type="date" max={riyadhDate()} value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label className="field">VAT Status<select value={vatStatus} onChange={(event) => setVatStatus(event.target.value as VatStatus)}><option value="NON_VAT">Non-VAT</option><option value="VAT_INCLUDED">VAT Included</option></select></label>
      <label className="field">Invoice No.<input required maxLength={100} value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} /></label>
      {kind === 'PO' && <label className="field">PO No.<input required maxLength={100} value={poNo} onChange={(event) => setPoNo(event.target.value)} /></label>}
      <label className="field">Amount (SAR)<input required inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      <label className="field">Paid By<input required maxLength={150} value={paidBy} onChange={(event) => setPaidBy(event.target.value)} /></label>
      <label className="field full">Description<textarea maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    </div><VatPreview amount={amount} vatStatus={vatStatus} document />
    {error && <p className="error" role="alert">{error}</p>}<div className="form-actions"><button className="secondary" type="button" onClick={onClose}>Cancel</button><Button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : `Save ${label}`}</Button></div></form>
  </Modal>;
}

function DocumentSection({ kind, items, subtotal, preview, onAdd, onEdit, onArchive }: { kind: CostDocumentType; items: InvoicePoRecord[]; subtotal: number; preview: boolean; onAdd: () => void; onEdit: (item: InvoicePoRecord) => void; onArchive: (id: string) => void }) {
  const plural = kind === 'PO' ? 'POs' : 'Invoices';
  return <FinanceSection title={plural} count={items.length} subtotal={subtotal} addButton={<Button className="primary" disabled={preview} onClick={onAdd}><Plus size={14} /> Add {kind === 'PO' ? 'PO' : 'Invoice'}</Button>}>
    {!items.length ? <p className="cost-empty">No {plural.toLowerCase()} recorded through today.</p> : <div className="cost-records">{items.map((item) => <article key={item.id}>
      <div><strong>Invoice {item.invoiceNo || 'Legacy record'}{kind === 'PO' && ` · PO ${item.poNo || 'Legacy record'}`}</strong><small>{item.date} · {item.vatStatus === 'VAT_INCLUDED' ? 'VAT Included' : 'Non-VAT'}{item.paidBy ? ` · Paid by ${item.paidBy}` : ''}{item.description ? ` · ${item.description}` : ''}</small></div>
      <RecordCost item={item} />
      <div className="inline-actions"><button className="text-button" onClick={() => onEdit(item)}><Pencil size={12} /> Edit</button><button className="text-button danger" onClick={() => onArchive(item.id)}><Trash2 size={12} /> Archive</button></div>
    </article>)}</div>}
  </FinanceSection>;
}

export function CostControlPage({ state, refresh, preview, management = false }: { state: State; refresh: () => Promise<void>; preview: boolean; management?: boolean }) {
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
  const fuelAnalysis = ['PETROL', 'DIESEL'].map((type) => ({ name: type === 'PETROL' ? 'Petrol' : 'Diesel', litres: summary.fuel.filter((item) => item.fuelType === type).reduce((sum, item) => sum + item.quantityMillilitres, 0) / 1000, value: summary.fuel.filter((item) => item.fuelType === type).reduce((sum, item) => sum + inclusiveCost(item.enteredAmountHalalas, item.vatStatus).grossHalalas, 0) }));
  async function archive(path: 'fuel' | 'invoice-po', id: string) {
    if (!window.confirm('Archive this cost record? Historical audit data will be preserved.')) return;
    try { await post(path, { action: 'archive', id }); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to archive record.'); }
  }
  if (management) return <div className="cost-page">
    {!preview && <div className="inline-actions"><a className="secondary" href="/api/finance.xlsx" download>Download Excel</a></div>}
    {error && <div className="notice" role="alert">{error}</div>}
    <FinanceSection title="Fuel" count={summary.fuel.length} subtotal={summary.costs.fuel.grossHalalas} addButton={<Button className="primary" disabled={preview} onClick={() => setFuelEditor('new')}><Plus size={14} /> Add Fuel</Button>} summary={<div className="fuel-mini-chart">{fuelAnalysis.map((item) => <div key={item.name}><span>{item.name}</span><strong>{item.litres.toLocaleString()} L</strong><Money value={item.value} /></div>)}</div>}>{!summary.fuel.length ? <p className="cost-empty">No fuel costs recorded through today.</p> : <div className="cost-records">{summary.fuel.map((item) => <article key={item.id}><div><strong>{item.fuelType === 'PETROL' ? 'Petrol' : 'Diesel'} · {(item.quantityMillilitres / 1000).toLocaleString()} L</strong><small>{item.date} · {item.vatStatus === 'VAT_INCLUDED' ? 'VAT Included' : 'Non-VAT'}</small></div><RecordCost item={item} /><div className="inline-actions"><button className="text-button" onClick={() => setFuelEditor(item)}><Pencil size={12} /> Edit</button><button className="text-button danger" onClick={() => void archive('fuel', item.id)}><Trash2 size={12} /> Archive</button></div></article>)}</div>}</FinanceSection>
    <div className="two-columns cost-document-grid">
      <DocumentSection kind="INVOICE" items={summary.invoices} subtotal={summary.costs.invoices.grossHalalas} preview={preview} onAdd={() => setInvoiceEditor('new')} onEdit={setInvoiceEditor} onArchive={(id) => void archive('invoice-po', id)} />
      <DocumentSection kind="PO" items={summary.purchaseOrders} subtotal={summary.costs.pos.grossHalalas} preview={preview} onAdd={() => setPoEditor('new')} onEdit={setPoEditor} onArchive={(id) => void archive('invoice-po', id)} />
    </div>
    {fuelEditor && <FuelEditor item={fuelEditor === 'new' ? undefined : fuelEditor} onClose={() => setFuelEditor(null)} onSaved={refresh} />}
    {invoiceEditor && <CostDocumentEditor kind="INVOICE" item={invoiceEditor === 'new' ? undefined : invoiceEditor} onClose={() => setInvoiceEditor(null)} onSaved={refresh} />}
    {poEditor && <CostDocumentEditor kind="PO" item={poEditor === 'new' ? undefined : poEditor} onClose={() => setPoEditor(null)} onSaved={refresh} />}
  </div>;
  return <div className="cost-page">
    <section className="card cost-hero"><div><span className="eyebrow">FINANCIAL CONTROL</span><h2>Total Recorded Project Cost — Including VAT</h2><p>Live attendance-derived costs plus recorded Fuel, Invoice and PO amounts including VAT.</p></div></section>
    {error && <div className="notice" role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
    <CostKpiCards state={state} />
    <div className="cost-chart-grid">
      <CostComposition state={state} />
      <section className="card cost-chart wide"><div className="card-heading"><div><h3>Monthly Cost Trend</h3><p>Monthly history from the first project record</p></div></div><ResponsiveContainer width="100%" height={250}><AreaChart data={trend}><defs><linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#087443" stopOpacity={0.28} /><stop offset="1" stopColor="#087443" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf1ee" /><XAxis dataKey="month" axisLine={false} tickLine={false} /><YAxis hide /><Tooltip content={<CostTooltip />} /><Area type="monotone" dataKey="value" name="Project cost" stroke="#087443" strokeWidth={3} fill="url(#costFill)" /></AreaChart></ResponsiveContainer></section>
    </div>
    <section className="card cost-section"><div className="card-heading"><div><h3>Equipment Cost Analysis</h3><p>Live equipment attendance and configured daily rates</p></div><strong><Money value={summary.costs.equipment.grossHalalas} /></strong></div>{!summary.equipment.length ? <p className="cost-empty">No equipment records are available.</p> : <><ResponsiveContainer width="100%" height={220}><BarChart data={summary.equipment.map((row) => ({ name: row.resource.name, company: row.resource.company, value: inclusiveCost(row.totalHalalas, 'NON_VAT').grossHalalas }))}><CartesianGrid vertical={false} stroke="#edf1ee" /><XAxis dataKey="name" axisLine={false} tickLine={false} /><YAxis hide /><Tooltip content={<CostTooltip />} /><Bar dataKey="value" fill="#2f9b67" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer><div className="table-scroll"><table className="responsive-table"><thead><tr><th>Equipment</th><th>Rental Company</th><th>Project-to-date Total</th></tr></thead><tbody>{summary.equipment.map((row) => <tr key={row.resource.id}><td data-label="Equipment"><strong>{row.resource.name}</strong></td><td data-label="Rental Company">{row.resource.company}</td><td data-label="Project-to-date Total"><Money value={inclusiveCost(row.totalHalalas, 'NON_VAT').grossHalalas} /></td></tr>)}</tbody><tfoot><tr><th colSpan={2}>Equipment Total</th><th><Money value={summary.costs.equipment.grossHalalas} /></th></tr></tfoot></table></div></>}</section>
    <section className="card cost-summary-card"><div><Droplets /><span>Project-to-date formula</span><strong>Manpower Gross + Equipment Gross + Fuel Gross + Invoices Gross + POs Gross</strong></div><strong><Money value={summary.totalHalalas} /></strong></section>

  </div>;
}

export function CostKpiCards({ state, dashboard = false, selection = 'all', href, trailing, containerClassName }: { state: State; dashboard?: boolean; selection?: 'all' | 'total' | 'categories'; href?: string; trailing?: ReactNode; containerClassName?: string }) {
  if (!state.fuelRecords || !state.invoicePoRecords || !state.manpower) return <output className="card">Loading project costs…</output>;
  const summary = costSummary({ throughDate: riyadhDate(), manpower: state.manpower, equipment: state.equipment || [], manpowerAttendance: state.manpowerAttendance || [], equipmentAttendance: state.equipmentAttendance || [], fuelRecords: state.fuelRecords, invoicePoRecords: state.invoicePoRecords });
  const cards = [
    { label: 'Total Recorded Project Cost — Including VAT', value: summary.total, Icon: FileText },
    { label: 'Manpower Total', value: summary.costs.manpower, Icon: UsersRound },
    { label: 'Equipment Total', value: summary.costs.equipment, Icon: Wrench },
    { label: 'Fuel Total', value: summary.costs.fuel, Icon: Fuel },
    { label: 'Invoices Total', value: summary.costs.invoices, Icon: ReceiptText },
    { label: 'POs Total', value: summary.costs.pos, Icon: FileCheck2 },
  ];
  const dashboardCategories = dashboard && selection === 'categories';
  const orderedCards = dashboardCategories ? [cards[1], cards[2], cards[4], cards[5], cards[3]] : cards;
  return <div className={`cost-kpis ${dashboard ? 'dashboard-cost-kpis' : ''} ${selection === 'total' ? 'cost-total-only' : ''} ${containerClassName ?? ''}`}>
    {orderedCards.filter((_, index) => dashboardCategories || selection === 'all' || (selection === 'total' ? index === 0 : index > 0)).map(({ label, value, Icon }) => <article key={label} className={`cost-kpi ${value === summary.total ? 'featured' : ''}`}>
      <Icon /><span>{label}</span><small>Total Including VAT</small>
      {href && value === summary.total && <a className="round-arrow" href={href} aria-label="Open Cost Control"><ArrowUpRight /></a>}
      <strong><Money value={value.grossHalalas} /></strong>
      <small>VAT Amount (15%): <Money value={value.vatHalalas} /></small>
      <small>Amount Without VAT: <Money value={value.netHalalas} /></small>
    </article>)}{trailing}
  </div>;
}

function RecordCost({ item }: { item: FuelRecord | InvoicePoRecord }) {
  const value = financialRecordCost(item);
  return <div className="cost-record-amount"><span>Total Including VAT</span><Money value={value.grossHalalas} />
    <small>VAT Amount (15%): <Money value={value.vatHalalas} /></small>
    <small>Amount Without VAT: <Money value={value.netHalalas} /></small>
  </div>;
}
function FinanceSection({ title, count, subtotal, addButton, summary, children }: {
  title: string; count: number; subtotal: number; addButton: ReactNode; summary?: ReactNode; children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  return <section className="card cost-section finance-accordion">
    <div className="card-heading">
      <h3><button type="button" className="finance-toggle" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(!expanded)}>
        <ChevronDown size={18} className={expanded ? 'expanded' : ''} />{title}<span className="badge">{count}</span>
      </button></h3>
      {addButton}
    </div>
    {summary}
    <div className="cost-document-subtotal"><span>{title} subtotal · Including VAT</span><strong><Money value={subtotal} /></strong></div>
    <div id={panelId} hidden={!expanded}>{children}</div>
  </section>;
}
export function CostComposition({ state, compact = false }: { state: State; compact?: boolean }) {
  if (!state.fuelRecords || !state.invoicePoRecords || !state.manpower) return <output className="card">Loading cost composition…</output>;
  const summary = costSummary({ throughDate: riyadhDate(), manpower: state.manpower, equipment: state.equipment || [], manpowerAttendance: state.manpowerAttendance || [], equipmentAttendance: state.equipmentAttendance || [], fuelRecords: state.fuelRecords, invoicePoRecords: state.invoicePoRecords });
  const composition = [
    { name: 'Manpower', value: summary.costs.manpower.grossHalalas, fill: COLORS[0] },
    { name: 'Equipment', value: summary.costs.equipment.grossHalalas, fill: COLORS[1] },
    { name: 'Fuel', value: summary.costs.fuel.grossHalalas, fill: COLORS[2] },
    { name: 'Invoices', value: summary.costs.invoices.grossHalalas, fill: COLORS[3] },
    { name: 'POs', value: summary.costs.pos.grossHalalas, fill: COLORS[4] },
  ];

  return (<section className={`card cost-chart ${compact ? 'dashboard-composition' : ''}`}><div className="card-heading"><div><h3>Cost Composition</h3><p>Project-to-date · VAT-inclusive amounts</p></div></div><div className={compact ? 'composition-stacked' : undefined}><ResponsiveContainer width="100%" height={compact ? 200 : 250}><PieChart><Pie data={composition} dataKey="value" nameKey="name" innerRadius={compact ? '55%' : 62} outerRadius={compact ? '90%' : 92} paddingAngle={3} /><Tooltip content={<CostTooltip />} /></PieChart></ResponsiveContainer><div className="cost-legend">{composition.map((item, index) => <span key={item.name}><i style={{ background: COLORS[index] }} />{item.name} {!compact && <b><Money value={item.value} /></b>}</span>)}</div></div></section>);
}

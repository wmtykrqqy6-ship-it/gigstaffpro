import React, { useState, useEffect, useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { isMissingSchemaError, formatEventDate } from '../../utils/clientRecords';
import {
  PAYMENT_KINDS, PAYMENT_METHODS, kindLabel, methodLabel, summarizePayments,
  paymentStatusLabel, suggestPayment, validatePayment, centralToday, formatMoney
} from '../../utils/quotePayments';

// Payments on a booked quote (CRM Phase 3, docs/PAYMENTS.md): what's been
// paid and owed, and "Record payment" for checks, cash and phone payments.
// Hidden until the payments SQL (20261128120000) has been run.

const input = 'w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm';

export default function PaymentsPanel({ quote, onChange }) {
  const notify = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [on, setOn] = useState(null); // null = loading, false = SQL not run
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);

  const load = async () => {
    const { data, error } = await supabase.from('quote_payments').select('*').eq('quote_id', quote.id).order('paid_on').order('created_at');
    if (error) { setOn(isMissingSchemaError(error) ? false : true); if (!isMissingSchemaError(error)) notify(`Could not load payments: ${error.message}`); return; }
    setOn(true);
    setRows(data || []);
    onChange?.(quote.id, data || []);
  };

  useEffect(() => { if (quote?.id) load(); }, [quote?.id]);

  const summary = useMemo(() => summarizePayments(quote, rows), [quote, rows]);

  if (!quote?.id || on === null) return null;
  if (on === false) {
    return <p className="text-xs text-gray-500">Payments turn on once the payments SQL file (20261128120000) has been run.</p>;
  }

  const startAdding = () => {
    const s = suggestPayment(summary);
    setForm({ ...s, method: 'check', paid_on: centralToday(), note: '' });
    setAdding(true);
  };

  const save = async () => {
    const res = validatePayment(form, quote.id);
    if (res.error) { notify(res.error); return; }
    setSaving(true);
    const { error } = await supabase.from('quote_payments').insert([res.row]);
    setSaving(false);
    if (error) { notify(`Could not save the payment: ${error.message}`); return; }
    notify('Payment recorded');
    setAdding(false);
    load();
  };

  const remove = async (p) => {
    if (p.provider !== 'manual') return;
    if (!await confirm(`Delete this ${kindLabel(p.kind).toLowerCase()} of ${formatMoney(p.amount)}? This cannot be undone.`)) return;
    const { error } = await supabase.from('quote_payments').delete().eq('id', p.id);
    if (error) { notify(`Could not delete: ${error.message}`); return; }
    load();
  };

  const label = paymentStatusLabel(summary);
  const late = Boolean(summary.overdue);

  return (
    <section className="border rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="font-semibold text-gray-900">Payments</h4>
        {label && <span className={`text-xs px-2 py-0.5 rounded-full ${late ? 'bg-red-100 text-red-800' : summary.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>{label}</span>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <div><div className="text-xs text-gray-500">Total</div><div className="font-medium">{formatMoney(summary.total)}</div></div>
        <div><div className="text-xs text-gray-500">Paid</div><div className="font-medium">{formatMoney(summary.paid)}</div></div>
        <div><div className="text-xs text-gray-500">Still owed</div><div className={`font-medium ${late ? 'text-red-700' : ''}`}>{formatMoney(summary.owed)}</div></div>
        <div>
          <div className="text-xs text-gray-500">{summary.status === 'deposit_due' ? 'Deposit due now' : 'Balance due'}</div>
          <div className="font-medium">{summary.status === 'deposit_due' ? formatMoney(summary.depositOwed) : summary.balanceDue ? formatEventDate(summary.balanceDue) : '—'}</div>
        </div>
      </div>
      {(summary.tips > 0 || summary.pending > 0) && (
        <p className="text-xs text-gray-600">
          {summary.tips > 0 && <span>Tips for the crew: {formatMoney(summary.tips)}. </span>}
          {summary.pending > 0 && <span>Still clearing: {formatMoney(summary.pending)}.</span>}
        </p>
      )}

      {rows.length > 0 && (
        <ul className="divide-y text-sm">
          {rows.map(p => (
            <li key={p.id} className="py-1.5 flex items-center justify-between gap-2">
              <span className="min-w-0">
                <span className={p.kind === 'refund' ? 'text-red-700' : ''}>{p.kind === 'refund' ? '−' : ''}{formatMoney(p.amount)}</span>
                <span className="text-gray-600"> · {kindLabel(p.kind)} · {methodLabel(p.method)} · {formatEventDate(p.paid_on)}</span>
                {p.status !== 'paid' && <span className="text-amber-700"> · {p.status}</span>}
                {p.note && <span className="text-gray-500"> · {p.note}</span>}
              </span>
              {p.provider === 'manual' && (
                <button onClick={() => remove(p)} className="text-gray-400 hover:text-red-700 shrink-0" title="Delete this payment"><Trash2 size={14} /></button>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && form ? (
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <label className="block text-xs text-gray-600">For
              <select className={input} value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value }))}>
                {PAYMENT_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </label>
            <label className="block text-xs text-gray-600">Amount
              <input className={input} inputMode="decimal" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            </label>
            <label className="block text-xs text-gray-600">Paid by
              <select className={input} value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}>
                {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
            <label className="block text-xs text-gray-600">Date
              <input type="date" className={input} value={form.paid_on} onChange={e => setForm(f => ({ ...f, paid_on: e.target.value }))} />
            </label>
          </div>
          <label className="block text-xs text-gray-600">Note (e.g. check number)
            <input className={input} maxLength={500} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
          </label>
          <div className="flex justify-end space-x-2">
            <button onClick={() => setAdding(false)} className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">Cancel</button>
            <button onClick={save} disabled={saving} className="px-3 py-1.5 bg-red-900 text-white rounded-lg text-sm hover:bg-red-800 disabled:opacity-50">{saving ? 'Saving…' : 'Save payment'}</button>
          </div>
        </div>
      ) : (
        <button onClick={startAdding} className="text-sm text-red-900 hover:underline">+ Record payment</button>
      )}
    </section>
  );
}

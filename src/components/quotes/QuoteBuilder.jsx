import React, { useState, useEffect, useMemo } from 'react';
import { X, Plus, Trash2, MapPin, RotateCcw } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import { isMissingSchemaError } from '../../utils/clientRecords';
import { PRICE_CATEGORIES, formatPrice, unitLabel, packageSummary } from '../../utils/priceList';
import {
  AUTO_RULES, TRAVEL_FREE_MILES, priceQuote, partyHours, lineFromItem, customLine, cleanLines, suggestPackage, toTime24
} from '../../utils/quotePricing';

const input = 'w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm';
const money = (n) => `${Number(n) < 0 ? '-' : ''}$${Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const DEFAULT_TAX_RATE = 0.055; // most Wisconsin counties: 5% state + 0.5% county

function fromLead(lead) {
  const start = toTime24(lead?.start_time);
  let end = '';
  if (start) {
    const h = (Number(start.slice(0, 2)) + 3) % 24;
    end = `${String(h).padStart(2, '0')}:${start.slice(3)}`;
  }
  return {
    name: [lead?.company || lead?.name, lead?.event_location].filter(Boolean).join(' - ').slice(0, 200),
    event_date: lead?.event_date || '',
    start_time: start,
    end_time: end,
    guest_count: lead?.guest_count ?? '',
    venue: '',
    address: lead?.event_location || '',
    miles: '',
    fundraiser: false,
    extra_hour_mode: 'ahead',
    tax_rate: DEFAULT_TAX_RATE,
    tax_county: '',
    auto_off: [],
    lines: [],
    client_notes: '',
    internal_notes: ''
  };
}

// Quote builder (CRM Phase 2 step 2, docs/QUOTES.md). Opens from a lead.
// Lines come from the price list (Settings > Prices); delivery, travel,
// extra hours and the fundraiser discount are added by the rules in
// src/utils/quotePricing.js. Saves to public.quotes (admin-only).
export default function QuoteBuilder({ lead, quote, onClose, onSaved }) {
  const notify = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [originId, setOriginId] = useState('');
  const [form, setForm] = useState(() => (quote ? { ...fromLead(lead), ...quote, miles: quote.miles ?? '', guest_count: quote.guest_count ?? '', tax_rate: Number(quote.tax_rate) } : fromLead(lead)));
  const [adding, setAdding] = useState('');
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [problem, setProblem] = useState('');
  const set = (patch) => setForm(f => ({ ...f, ...patch }));

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('price_items').select('*').order('sort_order').order('name');
      if (error) setProblem(isMissingSchemaError(error) ? 'Quotes turn on once the price list SQL file (20261127130000) has been run in Supabase.' : `Could not load prices: ${error.message}`);
      else setItems(data || []);
      const { data: locs } = await supabase.from('locations').select('id, name, address').eq('is_active', true).order('name');
      const withAddress = (locs || []).filter(l => l.address);
      setLocations(withAddress);
      setOriginId(String((withAddress.find(l => /milwaukee/i.test(`${l.name} ${l.address}`)) || withAddress[0] || {}).id || ''));
      if (!quote && lead?.client_id !== null && lead?.client_id !== undefined) {
        const { data: c } = await supabase.from('clients').select('client_type').eq('id', lead.client_id).maybeSingle();
        if (c?.client_type === 'fundraiser') set({ fundraiser: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = useMemo(() => items.filter(i => i.active !== false), [items]);
  const hours = partyHours(form.start_time, form.end_time);
  const priced = useMemo(() => priceQuote(form.lines, {
    items, hours, miles: form.miles, fundraiser: form.fundraiser, taxRate: form.tax_rate,
    extraHourMode: form.extra_hour_mode, autoOff: form.auto_off, eventDate: form.event_date
  }), [form, items, hours]);
  const suggestion = form.lines.length === 0 ? suggestPackage(form.guest_count, active) : null;

  const updateLine = (id, patch) => set({ lines: form.lines.map(l => (l.id === id ? { ...l, ...patch } : l)) });
  const removeLine = (id) => set({ lines: form.lines.filter(l => l.id !== id) });
  const addItem = (key) => {
    const item = items.find(i => i.key === key);
    if (!item) return;
    const qty = item.unit === 'dealer' ? Math.max(1, priced.dealers) : 1;
    set({ lines: [...form.lines, lineFromItem(item, qty)] });
    setAdding('');
  };
  const toggleRule = (rule) => set({ auto_off: form.auto_off.includes(rule) ? form.auto_off.filter(r => r !== rule) : [...form.auto_off, rule] });

  const lookUpMiles = async () => {
    const origin = locations.find(l => String(l.id) === originId)?.address;
    if (!origin || !form.address.trim()) { notify('Add the event address first.'); return; }
    setLookingUp(true);
    try {
      const r = await fetch(`/api/get-distance?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(form.address.trim())}`);
      const d = await r.json();
      if (!r.ok || typeof d.miles !== 'number') throw new Error(d.error || 'No distance found');
      set({ miles: Math.round(d.miles * 10) / 10 });
    } catch (err) {
      notify(`Couldn't look up the distance: ${err.message}`);
    } finally {
      setLookingUp(false);
    }
  };

  const save = async () => {
    if (!form.lines.length) { notify('Add at least one item.'); return; }
    setSaving(true);
    const now = new Date().toISOString();
    const row = {
      lead_id: lead?.id || quote?.lead_id || null,
      client_id: lead?.client_id ?? quote?.client_id ?? null,
      name: String(form.name || '').trim().slice(0, 200) || null,
      event_date: form.event_date || null,
      start_time: /^\d{2}:\d{2}$/.test(form.start_time) ? form.start_time : null,
      end_time: /^\d{2}:\d{2}$/.test(form.end_time) ? form.end_time : null,
      guest_count: form.guest_count === '' ? null : Math.max(0, Math.floor(Number(form.guest_count) || 0)),
      venue: String(form.venue || '').trim().slice(0, 200) || null,
      address: String(form.address || '').trim().slice(0, 300) || null,
      miles: form.miles === '' ? null : Math.max(0, Number(form.miles) || 0),
      fundraiser: !!form.fundraiser,
      extra_hour_mode: form.extra_hour_mode === 'event' ? 'event' : 'ahead',
      tax_rate: Math.min(Math.max(Number(form.tax_rate) || 0, 0), 0.2),
      tax_county: String(form.tax_county || '').trim().slice(0, 80) || null,
      auto_off: form.auto_off,
      lines: cleanLines(form.lines),
      subtotal: priced.subtotal,
      tax: priced.tax,
      total: priced.total,
      deposit: priced.deposit,
      client_notes: String(form.client_notes || '').trim().slice(0, 4000) || null,
      internal_notes: String(form.internal_notes || '').trim().slice(0, 4000) || null,
      updated_at: now
    };
    const res = quote?.id
      ? await supabase.from('quotes').update(row).eq('id', quote.id).select().single()
      : await supabase.from('quotes').insert([row]).select().single();
    setSaving(false);
    if (res.error) {
      notify(isMissingSchemaError(res.error) ? 'Saving quotes turns on once the quotes SQL file (20261127140000) has been run.' : `Could not save: ${res.error.message}`);
      return;
    }
    notify('Quote saved');
    onSaved?.(res.data);
  };

  const remove = async () => {
    if (!quote?.id) return;
    if (!await confirm('Delete this quote? This cannot be undone.')) return;
    const { error } = await supabase.from('quotes').delete().eq('id', quote.id);
    if (error) { notify(`Could not delete: ${error.message}`); return; }
    onSaved?.(null);
  };

  const far = Number(form.miles) > TRAVEL_FREE_MILES;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
      <div className="min-h-full flex items-start justify-center p-2 sm:p-6">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div>
              <h3 className="text-lg font-bold text-gray-900">{quote?.id ? 'Edit quote' : 'New quote'}</h3>
              <p className="text-xs text-gray-500">{lead?.name}{lead?.email ? ` · ${lead.email}` : ''}{quote?.status ? ` · ${quote.status}` : ''}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Close"><X size={20} /></button>
          </div>

          {problem ? (
            <div className="m-4 bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-lg p-3">{problem}</div>
          ) : (
            <div className="p-4 space-y-5">
              <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="col-span-2 text-xs text-gray-600">Quote name<input className={input} value={form.name} onChange={e => set({ name: e.target.value })} /></label>
                <label className="text-xs text-gray-600">Date<input type="date" className={input} value={form.event_date} onChange={e => set({ event_date: e.target.value })} /></label>
                <label className="text-xs text-gray-600">Guests<input type="number" min="0" className={input} value={form.guest_count} onChange={e => set({ guest_count: e.target.value })} /></label>
                <label className="text-xs text-gray-600">Start<input type="time" className={input} value={form.start_time} onChange={e => set({ start_time: e.target.value })} /></label>
                <label className="text-xs text-gray-600">End<input type="time" className={input} value={form.end_time} onChange={e => set({ end_time: e.target.value })} /></label>
                <div className="col-span-2 text-xs text-gray-600 flex items-end pb-2">{hours ? `${hours} hour${hours === 1 ? '' : 's'}${hours > 3 ? ` (${Math.round((hours - 3) * 100) / 100} extra)` : ''}` : 'Set start and end times'}</div>
                <label className="col-span-2 text-xs text-gray-600">Venue<input className={input} value={form.venue} onChange={e => set({ venue: e.target.value })} /></label>
                <label className="col-span-2 text-xs text-gray-600">Address<input className={input} value={form.address} onChange={e => set({ address: e.target.value })} /></label>
                <label className="text-xs text-gray-600">Miles from warehouse
                  <div className="flex space-x-1">
                    <input type="number" min="0" step="0.1" className={input} value={form.miles} onChange={e => set({ miles: e.target.value })} />
                    <button type="button" onClick={lookUpMiles} disabled={lookingUp || !locations.length} title="Look up driving miles" className="px-2 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"><MapPin size={14} /></button>
                  </div>
                </label>
                {locations.length > 1 ? (
                  <label className="text-xs text-gray-600">From
                    <select className={input} value={originId} onChange={e => setOriginId(e.target.value)}>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </label>
                ) : <div />}
                <label className="text-xs text-gray-600">Sales tax (%)
                  <input type="number" min="0" max="20" step="0.01" className={input} value={Math.round(Number(form.tax_rate) * 10000) / 100}
                    onChange={e => set({ tax_rate: (Number(e.target.value) || 0) / 100 })} />
                </label>
                <label className="text-xs text-gray-600">County<input className={input} value={form.tax_county} placeholder="e.g. Waukesha" onChange={e => set({ tax_county: e.target.value })} /></label>
                <label className="col-span-2 flex items-center space-x-2 text-sm text-gray-700"><input type="checkbox" checked={form.fundraiser} onChange={e => set({ fundraiser: e.target.checked })} /><span>Fundraiser ($50 off each table)</span></label>
                <label className="col-span-2 text-xs text-gray-600">Extra hours are
                  <select className={input} value={form.extra_hour_mode} onChange={e => set({ extra_hour_mode: e.target.value })}>
                    <option value="ahead">Booked ahead ($75 + tax)</option>
                    <option value="event">Added at the event ($80, tax included)</option>
                  </select>
                </label>
              </section>
              {far && <p className="text-xs text-amber-700 -mt-3">Past {TRAVEL_FREE_MILES} miles: the far delivery fee and the dealer travel fee are added.</p>}

              <section>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b">
                        <th className="text-left py-2 font-medium">Item</th>
                        <th className="text-right py-2 font-medium w-20">Qty</th>
                        <th className="text-right py-2 font-medium w-28">Price</th>
                        <th className="text-right py-2 font-medium w-24">Amount</th>
                        <th className="w-14" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {priced.lines.map(l => (
                        <tr key={l.id} className={l.auto ? 'text-gray-600 bg-gray-50' : ''}>
                          <td className="py-2 pr-2">
                            {l.category === 'custom'
                              ? <input className={input} value={l.name} placeholder="Item name" onChange={e => updateLine(l.id, { name: e.target.value })} />
                              : <span className="font-medium text-gray-900">{l.name}</span>}
                            <div className="text-xs text-gray-500">
                              {[l.category === 'package' ? packageSummary(l.contents, items) : null, l.dealers ? `${l.dealers} dealer${l.dealers === 1 ? '' : 's'} each` : null,
                                l.auto ? 'Added automatically' : null, l.taxable === false ? 'no tax' : null].filter(Boolean).join(' · ')}
                            </div>
                          </td>
                          <td className="py-2 text-right">
                            {l.auto ? <span>{l.qty}</span> : <input type="number" min="0" step="any" className={`${input} text-right`} value={l.qty} onChange={e => updateLine(l.id, { qty: e.target.value })} />}
                          </td>
                          <td className="py-2 text-right">
                            {l.auto ? <span>{money(l.unit_price)}</span> : <input type="number" step="0.01" className={`${input} text-right`} value={l.unit_price} onChange={e => updateLine(l.id, { unit_price: e.target.value })} />}
                            <div className="text-xs text-gray-400">{unitLabel(l.unit)}</div>
                          </td>
                          <td className="py-2 text-right font-medium">{money(l.amount)}</td>
                          <td className="py-2 text-right">
                            {l.auto
                              ? <button onClick={() => toggleRule(l.auto)} title="Leave this off the quote" className="text-gray-400 hover:text-red-700"><X size={15} /></button>
                              : (
                                <div className="flex justify-end space-x-1">
                                  <button onClick={() => updateLine(l.id, { taxable: l.taxable === false })} title={l.taxable === false ? 'Add tax' : 'No tax on this line'} className={`text-xs ${l.taxable === false ? 'text-gray-400' : 'text-gray-600'}`}>Tax</button>
                                  <button onClick={() => removeLine(l.id)} className="text-gray-400 hover:text-red-700" aria-label="Remove"><Trash2 size={15} /></button>
                                </div>
                              )}
                          </td>
                        </tr>
                      ))}
                      {priced.lines.length === 0 && (
                        <tr><td colSpan={5} className="py-6 text-center text-sm text-gray-500">
                          No items yet.{suggestion && <> <button onClick={() => addItem(suggestion.key)} className="text-red-900 hover:underline">Start with the {suggestion.name} ({formatPrice(suggestion.price)})</button></>}
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <select className={`${input} sm:w-80`} value={adding} onChange={e => addItem(e.target.value)}>
                    <option value="">Add an item from the price list…</option>
                    {PRICE_CATEGORIES.map(c => {
                      const list = active.filter(i => i.category === c.id);
                      return list.length ? (
                        <optgroup key={c.id} label={c.label}>
                          {list.map(i => <option key={i.key} value={i.key}>{i.name} ({formatPrice(i.price)}{i.price !== null && i.price !== undefined ? ` ${unitLabel(i.unit)}` : ''})</option>)}
                        </optgroup>
                      ) : null;
                    })}
                  </select>
                  <button onClick={() => set({ lines: [...form.lines, customLine()] })} className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm hover:bg-gray-200 flex items-center space-x-1"><Plus size={14} /><span>Custom line</span></button>
                </div>
                {form.auto_off.length > 0 && (
                  <p className="text-xs text-gray-500 mt-2">Left off this quote: {form.auto_off.map(r => (
                    <button key={r} onClick={() => toggleRule(r)} className="inline-flex items-center space-x-0.5 mr-2 text-red-900 hover:underline"><RotateCcw size={11} /><span>{AUTO_RULES.find(a => a.id === r)?.label || r}</span></button>
                  ))}</p>
                )}
              </section>

              <section className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 space-y-2">
                  <label className="block text-xs text-gray-600">Note to the client (shown on the quote)
                    <textarea rows={3} className={input} value={form.client_notes || ''} onChange={e => set({ client_notes: e.target.value })} />
                  </label>
                  <label className="block text-xs text-gray-600">Internal note (team only)
                    <textarea rows={2} className={input} value={form.internal_notes || ''} onChange={e => set({ internal_notes: e.target.value })} />
                  </label>
                </div>
                <div className="sm:w-72 bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span>Subtotal</span><span>{money(priced.subtotal)}</span></div>
                  <div className="flex justify-between"><span>Tax ({Math.round(Number(form.tax_rate) * 10000) / 100}%{form.tax_county ? `, ${form.tax_county}` : ''})</span><span>{money(priced.tax)}</span></div>
                  <div className="flex justify-between font-bold text-gray-900 border-t pt-1"><span>Total</span><span>{money(priced.total)}</span></div>
                  <div className="flex justify-between text-gray-600"><span>50% deposit at signing</span><span>{money(priced.deposit)}</span></div>
                  <div className="flex justify-between text-gray-600"><span>Balance{priced.balanceDue ? ` due ${new Date(`${priced.balanceDue}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</span><span>{money(priced.balance)}</span></div>
                  <p className="text-xs text-gray-500 pt-1">{priced.tables} table{priced.tables === 1 ? '' : 's'}, {priced.dealers} dealer{priced.dealers === 1 ? '' : 's'}</p>
                </div>
              </section>
            </div>
          )}

          <div className="flex items-center justify-between px-4 py-3 border-t">
            <div>{quote?.id && <button onClick={remove} className="text-sm text-gray-500 hover:text-red-700">Delete quote</button>}</div>
            <div className="flex space-x-2">
              <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">Cancel</button>
              {!problem && <button onClick={save} disabled={saving} className="px-4 py-2 bg-red-900 text-white rounded-lg text-sm hover:bg-red-800 disabled:opacity-50">{saving ? 'Saving…' : 'Save draft'}</button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useMemo } from 'react';
import { X, Upload, FileText, AlertTriangle, Link2, RefreshCw, Plus } from 'lucide-react';
import AddEventModal from '../modals/AddEventModal';
import AddressAutocomplete from '../AddressAutocomplete';
import { useToast } from '../ui/Toast';
import { parseDateSafe, formatTime } from '../../utils/dateHelpers';
import { parsePullSheet, cleanAddress } from '../../utils/logistics/pullSheetParser';
import {
  buildCatalogMap, classifyLineItems, applyClassifications, normalizeItemName,
  SIZE_CLASSES, SIZE_CLASS_LABELS
} from '../../utils/logistics/catalog';
import { findImportMatch, diffEquipment, formatDiff } from '../../utils/logistics/importMatch';
import { checkAllTrucks, summarizeEquipment } from '../../utils/logistics/capacity';
import {
  buildStaffingMap, suggestStaffing, staffingFromItems, toPositionList,
  proposeStaffing, staffingWarnings
} from '../../utils/logistics/staffing';
import { getPositionLabel } from '../../utils/positionHelpers';
import { FitsOnBadges, equipmentSummaryText } from './CapacityDisplay';
import {
  saveCatalogEntries, replaceEventEquipment, linkEventToInvoice, updateEventPositions,
  isMissingSchemaError, LOGISTICS_MIGRATION
} from './logisticsData';

const formatDate = (d) =>
  d ? parseDateSafe(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const errorText = (err) =>
  isMissingSchemaError(err)
    ? `The logistics tables aren't in the database yet — run ${LOGISTICS_MIGRATION} first.`
    : err?.message || String(err);

export default function ImportPullSheetModal({
  open,
  onClose,
  onImported,
  events = [],
  trucks = [],
  catalog = [],
  equipmentByEvent = {},
  positions,
  workers,
  assignments = [],
  timeFormat
}) {
  const notify = useToast();
  const [step, setStep] = useState('upload'); // upload | review | create-form
  const [parsing, setParsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState(null);
  const [baseItems, setBaseItems] = useState([]);
  const [unknown, setUnknown] = useState([]);
  const [answers, setAnswers] = useState({});
  const [address, setAddress] = useState('');
  // Snapshot handed to the event form (kept stable so it's applied once).
  const [createPrefill, setCreatePrefill] = useState(null);
  const [keepExistingAddress, setKeepExistingAddress] = useState(false);
  // Existing events' staffing is only changed when the admin says so:
  // null (not chosen yet) | 'apply' | 'skip'.
  const [staffingChoice, setStaffingChoice] = useState(null);

  const reset = () => {
    setStep('upload');
    setParsing(false);
    setBusy(false);
    setError(null);
    setFileName('');
    setParsed(null);
    setBaseItems([]);
    setUnknown([]);
    setAnswers({});
    setAddress('');
    setCreatePrefill(null);
    setKeepExistingAddress(false);
    setStaffingChoice(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleFile = async (file) => {
    if (!file) return;
    setError(null);
    setFileName(file.name);
    setParsing(true);
    try {
      const { extractPdfPages } = await import('../../utils/logistics/pdfText');
      const result = parsePullSheet(await extractPdfPages(file));
      if (!result.isPullSheet || !result.lineItems.length) {
        setError(result.warnings[0] || 'Could not read this pull sheet.');
        return;
      }
      const { items, unknown: unknownItems } = classifyLineItems(result.lineItems, buildCatalogMap(catalog));
      setParsed(result);
      setBaseItems(items);
      setUnknown(unknownItems);
      setAnswers(Object.fromEntries(unknownItems.map(u => [normalizeItemName(u.name), u.suggestion])));
      setAddress(result.address.full);
      setStep('review');
    } catch (err) {
      setError('Could not read that PDF: ' + (err?.message || err));
    } finally {
      setParsing(false);
    }
  };

  const items = useMemo(() => applyClassifications(baseItems, answers), [baseItems, answers]);
  const counts = useMemo(() => summarizeEquipment(items), [items]);
  const fit = useMemo(() => checkAllTrucks(trucks, counts), [trucks, counts]);
  const match = useMemo(() => (parsed ? findImportMatch(parsed, events) : null), [parsed, events]);
  const streetMissing = cleanAddress(address).streetMissing;

  // Staffing from tables. Needs the catalog staffing columns
  // (20260930120000_add_catalog_staffing.sql); before that migration the
  // import works exactly as before, just without staffing.
  const staffingEnabled = catalog.some(row => 'staff_per_unit' in row);
  const unknownStaffing = (name) => suggestStaffing(name, answers[normalizeItemName(name)], positions);
  const staffingMap = useMemo(() => {
    const map = buildStaffingMap(catalog);
    for (const u of unknown) {
      const d = unknownStaffing(u.name);
      if (d.position_key && d.staff_per_unit > 0) map.set(normalizeItemName(u.name), d);
    }
    return map;
  }, [catalog, unknown, answers, positions]);
  const suggestedStaff = useMemo(
    () => (staffingEnabled ? staffingFromItems(items, staffingMap) : {}),
    [staffingEnabled, items, staffingMap]
  );

  // Proposed staffing change for an existing event (re-import: apply the
  // table difference; attach: raise to what the tables need, never lower).
  const staffingProposal = (event, mode) => {
    if (!staffingEnabled || !event) return { positions: [], changes: [], warnings: [] };
    const before = mode === 'delta' ? staffingFromItems(equipmentByEvent[event.id] || [], staffingMap) : {};
    const proposal = proposeStaffing({ current: event.positions || [], before, after: suggestedStaff, mode });
    return { ...proposal, warnings: staffingWarnings(proposal.changes, assignments, event.id) };
  };

  // The pull sheet is the source of truth for the address: when the address
  // field has a street, it's written to the event (create, attach, and
  // re-import alike) unless the user chooses to keep a different address the
  // event already has.
  const sameAddress = (a, b) =>
    normalizeItemName(a).replace(/[.,]/g, '') === normalizeItemName(b).replace(/[.,]/g, '');
  const addressToWrite = (event) => {
    if (streetMissing) return null;
    if (event?.address && sameAddress(event.address, address)) return null;
    if (event?.address && keepExistingAddress) return null;
    return address.trim();
  };

  const saveAnswers = async () => {
    await saveCatalogEntries(unknown.map(u => ({
      name: u.name,
      size_class: answers[normalizeItemName(u.name)],
      ...(staffingEnabled ? unknownStaffing(u.name) : {})
    })));
  };

  const handleUpdate = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveAnswers();
      await replaceEventEquipment(match.event.id, items);
      const staffing = staffingProposal(match.event, 'delta');
      const applyStaff = staffingChoice === 'apply' && staffing.changes.length > 0;
      if (applyStaff) await updateEventPositions(match.event.id, staffing.positions);
      const newAddress = addressToWrite(match.event);
      if (newAddress) {
        await linkEventToInvoice(match.event.id, {
          invoice: parsed.invoice,
          deliveryType: parsed.deliveryType,
          address: newAddress
        });
      }
      notify(`Updated ${[ 'equipment', newAddress && 'address', applyStaff && 'staffing'].filter(Boolean).join(', ')} for ${match.event.name}.`);
      onImported?.();
      close();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const handleAttach = async (event) => {
    if (!event.address && streetMissing) {
      setError('Enter the street address first — this event has no address yet.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveAnswers();
      await linkEventToInvoice(event.id, {
        invoice: parsed.invoice,
        deliveryType: parsed.deliveryType,
        address: addressToWrite(event),
        venue: event.venue ? null : parsed.address.venue
      });
      await replaceEventEquipment(event.id, items);
      const staffing = staffingProposal(event, 'atLeast');
      if (staffingChoice === 'apply' && staffing.changes.length) await updateEventPositions(event.id, staffing.positions);
      notify(`Attached pull sheet #${parsed.invoice} to ${event.name}.`);
      onImported?.();
      close();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const handleContinueToCreate = async () => {
    if (streetMissing) {
      setError('Enter the street address before creating the event.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveAnswers();
      setCreatePrefill({
        name: parsed.eventName || '',
        client: parsed.clientName || '',
        client_contact: parsed.clientPhone || '',
        date: parsed.date || '',
        time: parsed.startTime || '',
        end_time: parsed.endTime || '',
        address: address.trim(),
        venue: parsed.address.venue || '',
        ...(staffingEnabled ? { positions: toPositionList(suggestedStaff) } : {})
      });
      setStep('create-form');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  // Called by the event form right after the new event is inserted.
  const handleCreated = async (eventId) => {
    try {
      await linkEventToInvoice(eventId, { invoice: parsed.invoice, deliveryType: parsed.deliveryType });
      await replaceEventEquipment(eventId, items);
    } catch (err) {
      notify('Event saved, but its equipment could not be saved: ' + errorText(err));
    }
  };

  if (!open) return null;

  if (step === 'create-form') {
    return (
      <AddEventModal
        open
        positions={positions}
        workers={workers}
        initialData={createPrefill}
        onCreated={handleCreated}
        onSuccess={onImported}
        onClose={close}
      />
    );
  }

  const unclassified = items.some(i => !i.size_class);
  const diff = match?.type === 'update' ? diffEquipment(equipmentByEvent[match.event.id] || [], items) : [];
  const dateChanged = match?.type === 'update' && (
    (match.event.date || '').split('T')[0] !== parsed.date ||
    (parsed.startTime && (match.event.time || '').slice(0, 5) !== parsed.startTime)
  );
  const warnings = (parsed?.warnings || []).filter(w => !(/Street address/.test(w) && !streetMissing));
  const updateStaffing = match?.type === 'update' ? staffingProposal(match.event, 'delta') : null;
  const staffSummary = toPositionList(suggestedStaff).map(p => `${p.count} ${getPositionLabel(p.key)}`).join(', ');
  const needsStaffingChoice = (proposal) => proposal && proposal.changes.length > 0 && staffingChoice === null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
      <div className="min-h-screen flex items-center justify-center p-4 py-8">
        <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full">
          <div className="p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-2xl font-bold text-gray-900">Import Pull Sheet</h3>
              <button onClick={close} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
            </div>

            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg p-3">{error}</div>
            )}

            {step === 'upload' && (
              <label className="block border-2 border-dashed border-gray-300 rounded-lg p-10 text-center cursor-pointer hover:border-red-400 hover:bg-red-50 transition-colors">
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  disabled={parsing}
                  onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
                />
                {parsing ? (
                  <>
                    <FileText size={40} className="mx-auto text-gray-400 mb-3 animate-pulse" />
                    <p className="text-gray-700 font-medium">Reading {fileName}…</p>
                  </>
                ) : (
                  <>
                    <Upload size={40} className="mx-auto text-gray-400 mb-3" />
                    <p className="text-gray-900 font-medium">Choose a Goodshuffle pull sheet PDF</p>
                    <p className="text-sm text-gray-500 mt-1">The file named like <span className="font-mono">pullsheetlineitemgroup-…pdf</span></p>
                  </>
                )}
              </label>
            )}

            {step === 'review' && parsed && (
              <div className="space-y-5">
                {/* Event summary */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h4 className="text-lg font-semibold text-gray-900">{parsed.eventName || 'Untitled event'}</h4>
                    <span className="text-xs font-mono bg-white border border-gray-200 rounded px-2 py-0.5 text-gray-600">#{parsed.invoice || '—'}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mt-2 text-sm text-gray-700">
                    <div><span className="text-gray-500">Date:</span> {formatDate(parsed.date)}</div>
                    <div>
                      <span className="text-gray-500">Time:</span>{' '}
                      {parsed.startTime ? `${formatTime(parsed.startTime, timeFormat)} – ${formatTime(parsed.endTime, timeFormat)}` : 'TBD'}
                    </div>
                    <div><span className="text-gray-500">Client:</span> {parsed.clientName || '—'} {parsed.clientPhone && <span className="text-gray-500">{parsed.clientPhone}</span>}</div>
                    <div><span className="text-gray-500">Delivery:</span> {parsed.deliveryType || '—'}</div>
                  </div>
                </div>

                {warnings.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                    {warnings.map(w => (
                      <div key={w} className="flex items-start gap-2 text-sm text-amber-800">
                        <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /> {w}
                      </div>
                    ))}
                  </div>
                )}

                {/* Address — always from the pull sheet, editable */}
                {(() => {
                  const existing = match.type === 'update' ? [match.event] : match.type === 'attach' ? match.candidates : [];
                  const differing = streetMissing ? [] : existing.filter(ev => ev.address && !sameAddress(ev.address, address));
                  return (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Delivery address {match.type === 'update' ? '' : '*'}
                      {!parsed.address.streetMissing && <span className="ml-2 text-xs font-normal text-green-700">from pull sheet</span>}
                    </label>
                    {parsed.address.venue && (
                      <p className="text-xs text-gray-500 mb-1">Venue on pull sheet: <span className="text-gray-800">{parsed.address.venue}</span></p>
                    )}
                    <AddressAutocomplete
                      value={address}
                      onChange={setAddress}
                      placeholder="Street address, city, state"
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent ${
                        streetMissing ? 'border-amber-400 bg-amber-50' : 'border-gray-300'
                      }`}
                    />
                    {streetMissing && (
                      <p className="text-xs text-amber-700 mt-1">
                        {match.type === 'update'
                          ? "Goodshuffle didn't include a street address — the event's current address is kept."
                          : "Goodshuffle didn't include a street address. Enter or confirm it."}
                      </p>
                    )}
                    {differing.length > 0 && (
                      <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-2 text-xs text-blue-900 space-y-1">
                        {differing.map(ev => (
                          <div key={ev.id}>
                            <strong>{ev.name}</strong> currently has <span className="font-medium">{ev.address}</span>
                            {keepExistingAddress ? ' — keeping it.' : ' — will be replaced with the address above.'}
                          </div>
                        ))}
                        <label className="flex items-center gap-2 pt-1">
                          <input type="checkbox" checked={keepExistingAddress} onChange={(e) => setKeepExistingAddress(e.target.checked)} />
                          Keep the event's current address instead
                        </label>
                      </div>
                    )}
                  </div>
                  );
                })()}

                {/* Unknown catalog items */}
                {unknown.length > 0 && (
                  <div>
                    <h5 className="text-sm font-semibold text-gray-900 mb-1">New items — how should these be counted?</h5>
                    <p className="text-xs text-gray-500 mb-2">Asked once; saved to the equipment catalog for future imports.</p>
                    <div className="border border-gray-200 rounded-lg divide-y">
                      {unknown.map(u => {
                        const key = normalizeItemName(u.name);
                        return (
                          <div key={key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2">
                            <span className="text-sm text-gray-900">{u.name}</span>
                            <select
                              value={answers[key] || ''}
                              onChange={(e) => setAnswers(a => ({ ...a, [key]: e.target.value }))}
                              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
                            >
                              {SIZE_CLASSES.map(c => <option key={c} value={c}>{SIZE_CLASS_LABELS[c]}</option>)}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Equipment */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <h5 className="text-sm font-semibold text-gray-900">Equipment · <span className="font-normal text-gray-600">{equipmentSummaryText(counts)}</span></h5>
                    <FitsOnBadges results={fit.results} suggestion={fit.suggestion} />
                  </div>
                  <div className="border border-gray-200 rounded-lg divide-y text-sm">
                    {items.map((item, i) => (
                      <div key={i} className={`flex items-center justify-between px-3 py-1.5 ${item.isAccessory ? 'pl-8 text-gray-600 bg-gray-50' : ''}`}>
                        <span>
                          <span className="font-medium text-gray-900 mr-2">{item.quantity}×</span>
                          {item.isAccessory && <span className="text-gray-400 mr-1">↳</span>}
                          {item.name}
                        </span>
                        <span className="text-xs text-gray-500">{item.size_class ? SIZE_CLASS_LABELS[item.size_class].split(' (')[0] : 'Unclassified'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {staffingEnabled && staffSummary && (
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold text-gray-900">Staffing from tables:</span> {staffSummary}
                  </p>
                )}

                {/* What happens next */}
                {match.type === 'update' && (
                  <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
                    <div className="flex items-start gap-2 text-sm text-blue-900">
                      <RefreshCw size={16} className="mt-0.5 flex-shrink-0" />
                      <div>
                        Already imported as <strong>{match.event.name}</strong> ({formatDate(match.event.date)}).
                        <div className="mt-1 font-medium">{formatDiff(diff)}</div>
                        {dateChanged && (
                          <div className="mt-1 text-amber-800">
                            Note: the pull sheet's date/time differs from the event. Only equipment is updated — edit the event to change its date or time.
                          </div>
                        )}
                      </div>
                    </div>
                    <StaffingDecision proposal={updateStaffing} choice={staffingChoice} onChoose={setStaffingChoice} />
                    <button
                      onClick={handleUpdate}
                      disabled={busy || unclassified || needsStaffingChoice(updateStaffing)}
                      className="mt-3 bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 text-sm disabled:opacity-50"
                    >
                      {busy ? 'Saving…' : 'Update equipment'}
                    </button>
                  </div>
                )}

                {match.type === 'attach' && (
                  <div className="border border-gray-200 rounded-lg p-4 space-y-2">
                    <p className="text-sm text-gray-700">
                      {match.candidates.length === 1 ? 'An event' : `${match.candidates.length} events`} on {formatDate(parsed.date)} {match.candidates.length === 1 ? "doesn't" : "don't"} have a Goodshuffle invoice yet:
                    </p>
                    {match.candidates.map(ev => {
                      const proposal = staffingProposal(ev, 'atLeast');
                      return (
                      <div key={ev.id} className="space-y-2">
                      <button
                        onClick={() => handleAttach(ev)}
                        disabled={busy || unclassified || needsStaffingChoice(proposal)}
                        className="w-full flex items-center justify-between gap-2 text-left border border-gray-200 rounded-lg px-3 py-2 hover:bg-red-50 hover:border-red-200 disabled:opacity-50"
                      >
                        <span className="text-sm">
                          <span className="font-medium text-gray-900">Attach to {ev.name}</span>
                          <span className="text-gray-500"> · {ev.time ? formatTime(ev.time, timeFormat) : ''}{ev.venue ? ` · ${ev.venue}` : ''}</span>
                        </span>
                        <Link2 size={16} className="text-gray-400 flex-shrink-0" />
                      </button>
                      <StaffingDecision proposal={proposal} choice={staffingChoice} onChoose={setStaffingChoice} eventName={match.candidates.length > 1 ? ev.name : null} />
                      </div>
                      );
                    })}
                    <button
                      onClick={handleContinueToCreate}
                      disabled={busy || unclassified}
                      className="text-sm text-red-800 hover:text-red-900 underline disabled:opacity-50"
                    >
                      No — create a new event instead
                    </button>
                  </div>
                )}

                {match.type === 'create' && (
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    {staffingEnabled && staffSummary && (
                      <p className="text-xs text-gray-500 mr-auto">Staffing is prefilled in the form — add extra dealers there for bigger events.</p>
                    )}
                    <button
                      onClick={handleContinueToCreate}
                      disabled={busy || unclassified}
                      className="bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 text-sm flex items-center gap-2 disabled:opacity-50"
                    >
                      <Plus size={16} />
                      {busy ? 'Saving…' : 'Continue to event form'}
                    </button>
                  </div>
                )}

                <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-700 underline">Choose a different file</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Shown when importing into an existing event would change its staffing.
// Nothing is changed until the admin picks "Apply".
function StaffingDecision({ proposal, choice, onChoose, eventName = null }) {
  if (!proposal || !proposal.changes.length) return null;
  return (
    <div className="border border-purple-200 bg-purple-50 rounded-lg p-3 text-sm text-purple-900">
      <div className="font-semibold">Staffing{eventName ? ` for ${eventName}` : ''} would change:</div>
      <ul className="mt-1 space-y-0.5">
        {proposal.changes.map(c => (
          <li key={c.key}>{getPositionLabel(c.key)}: {c.from} → <strong>{c.to}</strong></li>
        ))}
      </ul>
      {proposal.warnings.map(w => (
        <div key={w.key} className="mt-1 text-amber-800">
          ⚠ {w.filled} people are already assigned as {getPositionLabel(w.key)} — lowering to {w.to} won't remove anyone; adjust them in Assign.
        </div>
      ))}
      <div className="mt-2 flex flex-wrap gap-4">
        <label className="flex items-center gap-2">
          <input type="radio" name="staffing-choice" checked={choice === 'apply'} onChange={() => onChoose('apply')} />
          Apply these changes
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="staffing-choice" checked={choice === 'skip'} onChange={() => onChoose('skip')} />
          Leave staffing as is
        </label>
      </div>
    </div>
  );
}

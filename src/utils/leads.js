// Leads (CRM Phase 1, steps 3 and 4; docs/CRM.md). public.leads holds
// inquiries that aren't booked yet: quote requests from the website form
// (api/_lib/quoteRequest.js) and ones added by hand.

export const LEAD_STAGES = [
  { id: 'new', label: 'New' },
  { id: 'quoted', label: 'Quoted' },
  { id: 'booked', label: 'Booked' },
  { id: 'lost', label: 'Lost' }
];

export const LOST_REASONS = [
  'Price',
  'Date not available',
  'Went with someone else',
  'No reply',
  'Event cancelled',
  'Other'
];

export const stageLabel = (id) => LEAD_STAGES.find(s => s.id === id)?.label || id;

export function countByStage(leads = []) {
  const counts = Object.fromEntries(LEAD_STAGES.map(s => [s.id, 0]));
  for (const l of leads) if (l && counts[l.stage] !== undefined) counts[l.stage]++;
  return counts;
}

// Newest first.
export const sortLeads = (leads = []) =>
  [...leads].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

// Changing stage: lost needs a reason; any other stage clears it.
export function stagePatch(stage, lostReason = null) {
  if (!LEAD_STAGES.some(s => s.id === stage)) throw new Error('Unknown stage');
  return {
    stage,
    lost_reason: stage === 'lost' ? (String(lostReason || '').trim() || 'Other') : null,
    updated_at: new Date().toISOString()
  };
}

// New client from a lead ("Add as client").
export function clientFromLead(lead) {
  return {
    name: String(lead?.name || '').trim(),
    company: lead?.company || null,
    email: lead?.email || null,
    phone: lead?.phone || null,
    source: lead?.source || 'website',
    is_active: true
  };
}

const clean = (v) => {
  const s = String(v ?? '').trim();
  return s || null;
};

export const emptyLeadForm = () => ({
  name: '', email: '', phone: '', company: '', event_date: '', event_location: '', guest_count: '', message: ''
});

// A lead typed in by an admin (phone call, walk-in).
export function leadFromForm(form) {
  const guests = String(form?.guest_count ?? '').replace(/\D/g, '');
  return {
    name: clean(form?.name),
    email: clean(form?.email)?.toLowerCase() ?? null,
    phone: clean(form?.phone),
    company: clean(form?.company),
    event_date: /^\d{4}-\d{2}-\d{2}$/.test(String(form?.event_date || '')) ? form.event_date : null,
    event_location: clean(form?.event_location),
    guest_count: guests ? Number(guests) : null,
    message: clean(form?.message),
    source: 'manual',
    stage: 'new'
  };
}

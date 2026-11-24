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
// Moving to Quoted starts the 7-day follow-up clock (docs/CRM.md).
export function stagePatch(stage, lostReason = null, now = new Date()) {
  if (!LEAD_STAGES.some(s => s.id === stage)) throw new Error('Unknown stage');
  const ts = now.toISOString();
  return {
    stage,
    lost_reason: stage === 'lost' ? (String(lostReason || '').trim() || 'Other') : null,
    updated_at: ts,
    ...(stage === 'quoted' ? { quoted_at: ts, followup_sent_at: null } : {})
  };
}

// "We talked": restarts the 7-day clock and allows one more follow-up.
export const contactPatch = (now = new Date()) => ({
  last_contact_at: now.toISOString(), followup_sent_at: null, updated_at: now.toISOString()
});

// Later of quoted_at and last_contact_at (same rule as api/_lib/leadFollowups.js).
export function lastContactTime(lead) {
  const times = [lead?.quoted_at, lead?.last_contact_at].filter(Boolean).map(d => new Date(d).getTime()).filter(n => !Number.isNaN(n));
  return times.length ? Math.max(...times) : null;
}

export const FOLLOWUP_AFTER_DAYS = 7; // same as api/_lib/leadFollowups.js

// One line about the automatic follow-up for a lead card, or null.
export function followupStatus(lead, enabled, now = new Date()) {
  if (!lead || lead.stage !== 'quoted') return null;
  const fmt = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (lead.followup_sent_at) return `Follow-up email sent ${fmt(lead.followup_sent_at)}`;
  if (lead.followup_paused) return 'Automatic follow-up off for this lead';
  if (!lead.email) return 'No email, so no automatic follow-up';
  const start = lastContactTime(lead);
  if (!enabled || start === null) return null;
  const due = new Date(start + FOLLOWUP_AFTER_DAYS * 86400000);
  return due <= now ? 'Follow-up email going out soon' : `Follow-up email ${fmt(due)} if they haven't booked`;
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

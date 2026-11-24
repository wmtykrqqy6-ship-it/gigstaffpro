import { describe, it, expect, vi } from 'vitest';
import {
  clientTypeLabel, clientFormFrom, clientPayloadFromForm, emptyClientForm,
  validateContact, contactPayloadFromForm, sortContacts,
  localToday, splitClientEvents, summarizeClientEvents, eventStaffCount,
  sortActivity, isMissingSchemaError, formatEventDate, saveClientRecord
} from './clientRecords';
import { describeAccessEntry } from './clientAccessLog';

describe('client form', () => {
  it('round-trips a client and cleans the payload', () => {
    const form = clientFormFrom({
      name: '  Acme   Corp ', email: ' Events@Acme.COM ', client_type: 'corporate',
      billing_address: ' 1 Main St\nMilwaukee, WI ', tags: ['Repeat'], is_active: true
    });
    const payload = clientPayloadFromForm(form);
    expect(payload).toMatchObject({
      name: 'Acme Corp',
      email: 'events@acme.com',
      phone: null,
      client_type: 'corporate',
      billing_address: '1 Main St\nMilwaukee, WI',
      tags: ['Repeat'],
      is_active: true
    });
  });

  it('drops unknown types and leaves out new columns when asked', () => {
    const form = { ...emptyClientForm(), name: 'X', client_type: 'wedding' };
    expect(clientPayloadFromForm(form).client_type).toBeNull();
    const old = clientPayloadFromForm(form, { withCrmFields: false });
    expect(old).not.toHaveProperty('client_type');
    expect(old).not.toHaveProperty('billing_address');
  });

  it('labels types', () => {
    expect(clientTypeLabel('fundraiser')).toBe('Fundraiser');
    expect(clientTypeLabel(null)).toBe('');
  });
});

describe('contacts', () => {
  it('requires a name and a sensible email', () => {
    expect(validateContact({ name: ' ' })).toMatch(/name/);
    expect(validateContact({ name: 'Ann', email: 'nope' })).toMatch(/email/);
    expect(validateContact({ name: 'Ann', email: 'ann@x.com' })).toBeNull();
    expect(validateContact({ name: 'Ann' })).toBeNull();
  });

  it('builds a payload for the client', () => {
    const p = contactPayloadFromForm({ name: ' Ann ', email: 'ANN@X.COM', preferred_contact: 'fax', is_primary: 1 }, 7);
    expect(p).toMatchObject({ client_id: 7, name: 'Ann', email: 'ann@x.com', preferred_contact: null, is_primary: true });
  });

  it('puts the primary contact first, then by name', () => {
    const sorted = sortContacts([{ name: 'Zed' }, { name: 'Bo' }, { name: 'Max', is_primary: true }]);
    expect(sorted.map(c => c.name)).toEqual(['Max', 'Bo', 'Zed']);
  });
});

describe('client events', () => {
  const events = [
    { id: 1, client_id: 'a', date: '2026-01-10' },
    { id: 2, client_id: 'a', date: '2026-12-01' },
    { id: 3, client_id: 'a', date: '2026-11-24' },
    { id: 4, client_id: 'a', date: '2025-06-01' },
    { id: 5, client_id: 'b', date: null },
    { id: 6, client_id: null, date: '2026-12-05' }
  ];

  it('splits upcoming (today counts) from past', () => {
    const { upcoming, past } = splitClientEvents(events.filter(e => e.client_id === 'a'), '2026-11-24');
    expect(upcoming.map(e => e.id)).toEqual([3, 2]);
    expect(past.map(e => e.id)).toEqual([1, 4]);
  });

  it('sends undated events to the end of past', () => {
    const { past } = splitClientEvents([{ id: 9, date: null }, { id: 1, date: '2026-01-10' }], '2026-11-24');
    expect(past.map(e => e.id)).toEqual([1, 9]);
  });

  it('summarizes counts and dates per client', () => {
    const s = summarizeClientEvents(events, '2026-11-24');
    expect(s.get('a')).toEqual({ total: 4, lastDate: '2026-01-10', nextDate: '2026-11-24' });
    expect(s.get('b')).toEqual({ total: 1, lastDate: null, nextDate: null });
    expect(s.has('null')).toBe(false);
  });

  it('counts staff and formats dates', () => {
    expect(eventStaffCount({ positions: [{ count: 3 }, { count: '2' }, {}] })).toBe(5);
    expect(eventStaffCount({})).toBe(0);
    expect(formatEventDate('2027-01-05')).toBe('Jan 5, 2027');
    expect(formatEventDate(null)).toBe('—');
  });

  it('gives today as a local date', () => {
    expect(localToday(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});

describe('activity', () => {
  it('sorts newest first', () => {
    const sorted = sortActivity([
      { id: 1, created_at: '2026-11-01T10:00:00Z' },
      { id: 2, created_at: '2026-11-20T10:00:00Z' }
    ]);
    expect(sorted.map(e => e.id)).toEqual([2, 1]);
  });

  it('names the new tables in the access log', () => {
    expect(describeAccessEntry({
      actor_name: 'Dylan', actor_role: 'admin', action: 'create',
      record_type: 'client_contacts', record_id: 'x', label: 'Ann'
    })).toBe('Dylan (admin) added client contact Ann');
  });
});

describe('isMissingSchemaError', () => {
  it('spots a migration that has not been run', () => {
    expect(isMissingSchemaError({ code: '42P01' })).toBe(true);
    expect(isMissingSchemaError({ code: 'PGRST204', message: "Could not find the 'client_type' column" })).toBe(true);
    expect(isMissingSchemaError({ message: 'relation "public.client_contacts" does not exist' })).toBe(true);
    expect(isMissingSchemaError({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isMissingSchemaError(null)).toBe(false);
  });
});

describe('saveClientRecord', () => {
  const fakeSupabase = (results) => {
    const calls = [];
    const chain = (payload) => {
      calls.push(payload);
      const res = results[calls.length - 1];
      const q = { eq: () => q, select: () => q, single: async () => res };
      return q;
    };
    return {
      calls,
      from: vi.fn(() => ({ insert: (rows) => chain(rows[0]), update: (row) => chain(row) }))
    };
  };

  it('saves the new columns when they exist', async () => {
    const sb = fakeSupabase([{ data: { id: 5 }, error: null }]);
    const r = await saveClientRecord(sb, { ...emptyClientForm(), name: 'A', client_type: 'private' });
    expect(r).toEqual({ id: 5, crmFieldsSaved: true });
    expect(sb.calls[0].client_type).toBe('private');
  });

  it('retries without them before the migration is run', async () => {
    const sb = fakeSupabase([
      { data: null, error: { code: 'PGRST204', message: "Could not find the 'billing_address' column" } },
      { data: { id: 9 }, error: null }
    ]);
    const r = await saveClientRecord(sb, { ...emptyClientForm(), name: 'A' }, 9);
    expect(r).toEqual({ id: 9, crmFieldsSaved: false });
    expect(sb.calls[1]).not.toHaveProperty('client_type');
  });

  it('throws other errors', async () => {
    const sb = fakeSupabase([{ data: null, error: { code: '42501', message: 'permission denied' } }]);
    await expect(saveClientRecord(sb, { ...emptyClientForm(), name: 'A' })).rejects.toMatchObject({ code: '42501' });
  });
});

import { describe, it, expect, vi } from 'vitest';
import { loadEventClientDetails, mergeClientDetails, dropUnchangedClientFields } from './eventClientDetails';

describe('mergeClientDetails', () => {
  const events = [
    { id: 'e1', name: 'Gala', client: null, client_contact: null },
    { id: 'e2', name: 'Old', client: 'Legacy Co', client_contact: '414-555-0100' },
    { id: 'e3', name: 'None', client: null, client_contact: null }
  ];

  it('puts admin-only details back on their events', () => {
    const out = mergeClientDetails(events, [{ event_id: 'e1', client: 'Smith', client_contact: 'smith@example.com' }]);
    expect(out[0]).toMatchObject({ id: 'e1', name: 'Gala', client: 'Smith', client_contact: 'smith@example.com' });
    expect(out[1]).toBe(events[1]);
    expect(out[2]).toBe(events[2]);
  });

  it('keeps the events values when there are no details (migration not run yet)', () => {
    expect(mergeClientDetails(events, [])).toBe(events);
    expect(mergeClientDetails(events, undefined)).toBe(events);
  });

  it('a details row with only one field keeps the other from the event', () => {
    const out = mergeClientDetails(events, [{ event_id: 'e2', client: null, client_contact: '262-555-0199' }]);
    expect(out[1]).toMatchObject({ client: 'Legacy Co', client_contact: '262-555-0199' });
  });

  it('a cleared client ("") stays cleared', () => {
    const out = mergeClientDetails(events, [{ event_id: 'e2', client: '', client_contact: '' }]);
    expect(out[1]).toMatchObject({ client: '', client_contact: '' });
  });

  it('handles bad input', () => {
    expect(mergeClientDetails(null, [])).toEqual([]);
    expect(mergeClientDetails([null], [{ event_id: 'x' }])).toEqual([null]);
  });
});

describe('dropUnchangedClientFields', () => {
  it('drops fields that match the original', () => {
    const out = dropUnchangedClientFields(
      { name: 'Gala', client: 'Smith', client_contact: '' },
      { client: 'Smith', client_contact: null }
    );
    expect(out).toEqual({ name: 'Gala' });
  });

  it('keeps changed fields, including clearing one', () => {
    const out = dropUnchangedClientFields(
      { name: 'Gala', client: 'Jones', client_contact: '' },
      { client: 'Smith', client_contact: '414-555-0100' }
    );
    expect(out).toEqual({ name: 'Gala', client: 'Jones', client_contact: '' });
  });

  it('blank form + failed load sends nothing for the client fields', () => {
    expect(dropUnchangedClientFields({ client: '', client_contact: '' }, {})).toEqual({});
  });
});

describe('loadEventClientDetails', () => {
  const fakeSupabase = (result) => ({
    from: vi.fn(() => ({ select: vi.fn(() => Promise.resolve(result)) })),
    rpc: vi.fn(async () => ({ error: null }))
  });

  it('returns the rows', async () => {
    const rows = [{ event_id: 'e1', client: 'Smith', client_contact: null }];
    const sb = fakeSupabase({ data: rows, error: null });
    expect(await loadEventClientDetails(sb)).toEqual(rows);
    expect(sb.from).toHaveBeenCalledWith('event_client_details');
  });

  it('records the view in the access log', async () => {
    const rows = [{ event_id: 'e1', client: 'Smith', client_contact: null }];
    const sb = fakeSupabase({ data: rows, error: null });
    await loadEventClientDetails(sb, 'test_screen');
    expect(sb.rpc).toHaveBeenCalledWith('log_client_access', {
      p_action: 'view',
      p_record_type: 'event_client_details',
      p_record_ids: ['e1'],
      p_details: { where: 'test_screen' }
    });
  });

  it('returns [] when the table is missing or access is refused', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await loadEventClientDetails(fakeSupabase({ data: null, error: { message: 'relation does not exist' } }))).toEqual([]);
    warn.mockRestore();
  });
});

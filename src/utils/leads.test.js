import { describe, it, expect } from 'vitest';
import { countByStage, sortLeads, stagePatch, clientFromLead, leadFromForm, stageLabel } from './leads';

describe('leads', () => {
  it('counts by stage', () => {
    expect(countByStage([{ stage: 'new' }, { stage: 'new' }, { stage: 'lost' }, { stage: 'odd' }]))
      .toEqual({ new: 2, quoted: 0, booked: 0, lost: 1 });
  });

  it('sorts newest first', () => {
    expect(sortLeads([{ id: 1, created_at: '2026-11-01' }, { id: 2, created_at: '2026-11-20' }]).map(l => l.id)).toEqual([2, 1]);
  });

  it('needs a reason for lost and clears it otherwise', () => {
    expect(stagePatch('lost', ' Price ')).toMatchObject({ stage: 'lost', lost_reason: 'Price' });
    expect(stagePatch('lost')).toMatchObject({ lost_reason: 'Other' });
    expect(stagePatch('quoted', 'Price')).toMatchObject({ stage: 'quoted', lost_reason: null });
    expect(() => stagePatch('won')).toThrow();
    expect(stageLabel('booked')).toBe('Booked');
  });

  it('turns a lead into a client', () => {
    expect(clientFromLead({ name: ' Pat ', email: 'p@x.com', phone: '1', company: null, source: 'website' }))
      .toEqual({ name: 'Pat', company: null, email: 'p@x.com', phone: '1', source: 'website', is_active: true });
  });

  it('builds a hand-entered lead', () => {
    expect(leadFromForm({ name: ' Jo ', email: 'JO@X.COM', event_date: '2027-01-02', guest_count: '80 people' }))
      .toMatchObject({ name: 'Jo', email: 'jo@x.com', event_date: '2027-01-02', guest_count: 80, source: 'manual', stage: 'new' });
    expect(leadFromForm({ name: 'Jo', event_date: '1/2/27' }).event_date).toBeNull();
  });
});

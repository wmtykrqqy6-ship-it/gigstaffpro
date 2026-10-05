import { describe, it, expect } from 'vitest';
import { normalizeClientName, findClientByName, newClientFromEvent, clientMatchesSearch, planMissingClients } from './clientMatch';
import { parseClientLine } from './logistics/pullSheetParser';

const CLIENTS = [
  { id: 'a', name: 'Kass', is_active: true },
  { id: 'b', name: 'Grand Geneva Resort', is_active: false }
];

describe('findClientByName', () => {
  it('matches ignoring case and extra spaces', () => {
    expect(findClientByName(CLIENTS, '  kass ')?.id).toBe('a');
    expect(findClientByName(CLIENTS, 'grand  geneva resort')?.id).toBe('b'); // inactive still matches
  });

  it('no match for a new or blank name', () => {
    expect(findClientByName(CLIENTS, 'Boettcher')).toBeNull();
    expect(findClientByName(CLIENTS, '   ')).toBeNull();
    expect(findClientByName(CLIENTS, null)).toBeNull();
  });

  it('does not partial-match', () => {
    expect(findClientByName(CLIENTS, 'Kassel')).toBeNull();
  });
});

describe('newClientFromEvent', () => {
  it('puts a phone contact in phone', () => {
    expect(newClientFromEvent({ client: ' Boettcher ', client_contact: '(414) 555-1212' }))
      .toEqual({ name: 'Boettcher', phone: '(414) 555-1212', email: null, is_active: true });
  });

  it('puts an email contact in email', () => {
    expect(newClientFromEvent({ client: 'Olson', client_contact: 'olson@example.com' }))
      .toEqual({ name: 'Olson', phone: null, email: 'olson@example.com', is_active: true });
  });

  it('no contact -> both empty', () => {
    expect(newClientFromEvent({ client: 'Isom' })).toEqual({ name: 'Isom', phone: null, email: null, is_active: true });
  });

  it('normalizeClientName', () => {
    expect(normalizeClientName('  A   B ')).toBe('a b');
  });
});

describe('clientMatchesSearch', () => {
  const c = { name: 'Carly Kass', company: 'Kass Events', email: 'carly@example.com', phone: '(414) 555-1212' };
  it('name, company and email (any case)', () => {
    expect(clientMatchesSearch(c, 'kass')).toBe(true);
    expect(clientMatchesSearch(c, 'EVENTS')).toBe(true);
    expect(clientMatchesSearch(c, 'carly@')).toBe(true);
  });
  it('phone in any format', () => {
    expect(clientMatchesSearch(c, '4145551212')).toBe(true);
    expect(clientMatchesSearch(c, '414-555')).toBe(true);
    expect(clientMatchesSearch(c, '(414) 555-1212')).toBe(true);
    expect(clientMatchesSearch(c, '1212')).toBe(true);
  });
  it('no match, blank query, missing fields', () => {
    expect(clientMatchesSearch(c, 'olson')).toBe(false);
    expect(clientMatchesSearch(c, '99')).toBe(false); // too short to search phones
    expect(clientMatchesSearch(c, '  ')).toBe(true);
    expect(clientMatchesSearch({ name: 'Isom' }, '262')).toBe(false);
  });
});

describe('planMissingClients', () => {
  const clients = [{ id: 'c1', name: 'Carly Kass' }];
  const events = [
    { id: 'e1', client: 'Carly Kass', client_id: null },
    { id: 'e2', client: 'Iyonna Isom  Sales Lead: Alyssa Newsom', client_id: null, client_contact: '262-555-0101' },
    { id: 'e3', client: 'Jessi H  x237', client_id: null },
    { id: 'e4', client: 'jessi h', client_id: null, client_contact: 'jessi@example.com' },
    { id: 'e5', client: 'Linked Already', client_id: 'c9' },
    { id: 'e6', client: '   ', client_id: null },
    { id: 'e7', client: null, client_id: null }
  ];
  const plan = planMissingClients(events, clients, parseClientLine);

  it('one entry per cleaned name; linked and blank events skipped', () => {
    expect(plan.map(p => p.name)).toEqual(['Carly Kass', 'Iyonna Isom', 'Jessi H']);
  });
  it('links to an existing client when the name matches', () => {
    expect(plan[0]).toMatchObject({ existing: { id: 'c1' }, eventIds: ['e1'] });
  });
  it('new clients group their events and keep the first contact', () => {
    expect(plan[1]).toMatchObject({ existing: null, eventIds: ['e2'], contact: '262-555-0101' });
    expect(plan[2]).toMatchObject({ existing: null, eventIds: ['e3', 'e4'], contact: 'jessi@example.com' });
  });
  it('nothing missing -> empty plan', () => {
    expect(planMissingClients([{ id: 'x', client: 'A', client_id: 'c' }], clients, parseClientLine)).toEqual([]);
  });
});

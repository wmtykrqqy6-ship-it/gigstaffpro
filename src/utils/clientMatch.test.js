import { describe, it, expect } from 'vitest';
import { normalizeClientName, findClientByName, newClientFromEvent } from './clientMatch';

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

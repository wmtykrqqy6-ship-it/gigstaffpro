import { describe, it, expect } from 'vitest';
import { groupConversations, unreadCount, replySubject, preview, matchesFilter, kindLabel, isMine, senderName } from './clientMessages';

const m = (over) => ({ id: Math.random().toString(36), direction: 'in', contact_email: 'pat@example.com', created_at: '2026-12-01T10:00:00Z', ...over });

describe('client messages', () => {
  it('groups by contact, newest conversation first, oldest message first', () => {
    const rows = [
      m({ created_at: '2026-12-01T10:00:00Z', subject: 'Quote' }),
      m({ contact_email: 'Lee@Example.com', created_at: '2026-12-02T10:00:00Z' }),
      m({ direction: 'out', created_at: '2026-12-01T11:00:00Z', read_at: 'x', contact_name: 'Pat Smith', lead_id: 'L1' })
    ];
    const c = groupConversations(rows);
    expect(c.map(x => x.email)).toEqual(['lee@example.com', 'pat@example.com']);
    expect(c[1].messages[0].subject).toBe('Quote');
    expect(c[1]).toMatchObject({ name: 'Pat Smith', unread: 1, leadId: 'L1', matched: true });
    expect(c[0].matched).toBe(false);
  });

  it('counts unread incoming only', () => {
    expect(unreadCount([m({}), m({ read_at: 'x' }), m({ direction: 'out' })])).toBe(1);
  });

  it('builds a reply subject', () => {
    expect(replySubject({ messages: [m({ subject: 'Quote' })] })).toBe('Re: Quote');
    expect(replySubject({ messages: [m({ subject: 'RE: Quote' })] })).toBe('RE: Quote');
    expect(replySubject({ messages: [] })).toMatch(/Vegas on Wheels/);
  });

  it('previews and filters', () => {
    expect(preview('a  b\n c')).toBe('a b c');
    expect(preview('x'.repeat(200), 10)).toHaveLength(10);
    const [c] = groupConversations([m({ subject: 'March fundraiser' })]);
    expect(matchesFilter(c, 'unread')).toBe(true);
    expect(matchesFilter(c, 'unmatched')).toBe(true);
    expect(matchesFilter(c, 'all', 'fundraiser')).toBe(true);
    expect(matchesFilter(c, 'all', 'zzz')).toBe(false);
    expect(kindLabel('upsell')).toMatch(/upsell/);
  });

  it('finds my conversations and names who sent each reply', () => {
    const [c] = groupConversations([m({}), m({ direction: 'out', kind: 'reply', sent_by: 'me', created_at: '2026-12-01T11:00:00Z' })]);
    expect(isMine(c, 'me')).toBe(true);
    expect(isMine(c, 'other')).toBe(false);
    expect(matchesFilter(c, 'mine', '', 'me')).toBe(true);
    expect(matchesFilter(c, 'mine', '', 'other')).toBe(false);
    const team = { me: 'Dylan', sam: 'Sam' };
    expect(senderName({ direction: 'out', kind: 'reply', sent_by: 'me' }, team, 'me')).toBe('Dylan (you)');
    expect(senderName({ direction: 'out', kind: 'reply', sent_by: 'sam' }, team, 'me')).toBe('Sam');
    expect(senderName({ direction: 'out', kind: 'reply', sent_by: 'gone' }, team, 'me')).toBe('Vegas on Wheels');
    expect(senderName({ direction: 'out', kind: 'followup' }, team, 'me')).toBe('Vegas on Wheels');
    expect(senderName({ direction: 'in', contact_email: 'pat@example.com' }, team, 'me')).toBe('pat@example.com');
  });
});

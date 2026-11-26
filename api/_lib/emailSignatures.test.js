import { describe, it, expect } from 'vitest';
import { cleanSignature, cleanDisplayName, withSignature, handleSignatureAction, MAX_SIGNATURE } from './emailSignatures.js';

function fakeSupabase({ rows = [], error = null, upsertError = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        select: async (cols) => { calls.push({ table, op: 'select', cols }); return { data: error ? null : rows, error }; },
        upsert: async (row, opts) => { calls.push({ table, op: 'upsert', row, opts }); return { error: upsertError }; }
      };
    }
  };
}

describe('signature helpers', () => {
  it('cleans and caps text', () => {
    expect(cleanSignature('  Sam  \r\nSales   \r\n')).toBe('Sam\nSales');
    expect(cleanSignature('x'.repeat(MAX_SIGNATURE + 50))).toHaveLength(MAX_SIGNATURE);
    expect(cleanDisplayName('  Sam   Lee ')).toBe('Sam Lee');
  });

  it('adds the signature after a blank line, or nothing', () => {
    expect(withSignature('Hi', 'Sam')).toBe('Hi\n\nSam');
    expect(withSignature('Hi', '   ')).toBe('Hi');
    expect(withSignature('Hi', null)).toBe('Hi');
  });
});

describe('handleSignatureAction', () => {
  it('returns my signature and the team names', async () => {
    const sb = fakeSupabase({ rows: [
      { admin_user_id: 'me', display_name: 'Dylan', signature: 'Dylan\nOwner' },
      { admin_user_id: 'other', display_name: 'Sam', signature: 'Sam' },
      { admin_user_id: 'blank', display_name: null, signature: null }
    ] });
    const r = await handleSignatureAction(sb, { action: 'signature-get' }, 'me');
    expect(r.body).toEqual({ ok: true, myId: 'me', mine: { display_name: 'Dylan', signature: 'Dylan\nOwner' }, team: { me: 'Dylan', other: 'Sam' } });
  });

  it('says when the SQL has not been run', async () => {
    const sb = fakeSupabase({ error: { code: '42P01', message: 'relation does not exist' } });
    const r = await handleSignatureAction(sb, { action: 'signature-get' }, 'me');
    expect(r.body.needsSql).toBe(true);
  });

  it('saves only the caller\'s own row', async () => {
    const sb = fakeSupabase();
    const r = await handleSignatureAction(sb, { action: 'signature-save', adminUserId: 'someone-else', displayName: ' Sam ', signature: 'Sam\r\nSales' }, 'me');
    expect(r.status).toBe(200);
    const up = sb.calls.find(c => c.op === 'upsert');
    expect(up.row).toMatchObject({ admin_user_id: 'me', display_name: 'Sam', signature: 'Sam\nSales' });
    expect(up.opts).toEqual({ onConflict: 'admin_user_id' });
  });

  it('refuses unknown actions', async () => {
    expect((await handleSignatureAction(fakeSupabase(), { action: 'nope' }, 'me')).status).toBe(400);
  });
});

import { describe, it, expect } from 'vitest';
import { cleanSignature, cleanDisplayName, withSignature, handleSignatureAction, MAX_SIGNATURE, cleanLogoUrl, logoHtml, DEFAULT_LOGO_URL, decodeLogo, MAX_LOGO_BYTES } from './emailSignatures.js';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function fakeSupabase({ rows = [], error = null, upsertError = null, uploadError = null } = {}) {
  const calls = [];
  return {
    calls,
    storage: {
      from(bucket) {
        return {
          upload: async (path, buf, opts) => { calls.push({ op: 'upload', bucket, path, size: buf.length, opts }); return { error: uploadError }; },
          getPublicUrl: (path) => ({ data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/${bucket}/${path}` } })
        };
      }
    },
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

describe('logo', () => {
  it('only takes https image links that are safe in an <img src>', () => {
    expect(cleanLogoUrl(DEFAULT_LOGO_URL)).toBe(DEFAULT_LOGO_URL);
    expect(cleanLogoUrl('http://example.com/a.png')).toBe('');
    expect(cleanLogoUrl('javascript:alert(1)')).toBe('');
    expect(cleanLogoUrl('https://x.com/a.png" onerror="x')).toBe('');
    expect(cleanLogoUrl('https://x.com/a b.png')).toBe('');
  });

  it('builds the image tag, or nothing', () => {
    expect(logoHtml('https://x.com/a.png?w=1&h=2')).toContain('src="https://x.com/a.png?w=1&amp;h=2"');
    expect(logoHtml('https://x.com/a.png')).toContain('alt="Vegas on Wheels"');
    expect(logoHtml('')).toBe('');
    expect(logoHtml('http://x.com/a.png')).toBe('');
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
    expect(r.body).toEqual({ ok: true, myId: 'me', mine: { display_name: 'Dylan', signature: 'Dylan\nOwner', logo_url: '' }, team: { me: 'Dylan', other: 'Sam' } });
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
    expect('logo_url' in up.row).toBe(false);
  });

  it('saves a cleaned logo link', async () => {
    const sb = fakeSupabase();
    await handleSignatureAction(sb, { action: 'signature-save', signature: 'Sam', logoUrl: ' https://x.com/logo.png ' }, 'me');
    expect(sb.calls.find(c => c.op === 'upsert').row.logo_url).toBe('https://x.com/logo.png');
    const sb2 = fakeSupabase();
    await handleSignatureAction(sb2, { action: 'signature-save', signature: 'Sam', logoUrl: 'http://x.com/logo.png' }, 'me');
    expect(sb2.calls.find(c => c.op === 'upsert').row.logo_url).toBe(null);
  });

  it('uploads a real image to email-assets and saves its link', async () => {
    const sb = fakeSupabase();
    const r = await handleSignatureAction(sb, { action: 'signature-logo', dataBase64: PNG, contentType: 'image/png', adminUserId: 'someone-else' }, 'me');
    expect(r.status).toBe(200);
    const up = sb.calls.find(c => c.op === 'upload');
    expect(up.bucket).toBe('email-assets');
    expect(up.path).toMatch(/^signature-logos\/me-\d+\.png$/);
    expect(up.opts.contentType).toBe('image/png');
    expect(r.body.logo_url).toBe(`https://proj.supabase.co/storage/v1/object/public/email-assets/${up.path}`);
    expect(sb.calls.find(c => c.op === 'upsert').row).toMatchObject({ admin_user_id: 'me', logo_url: r.body.logo_url });
  });

  it('removes the logo', async () => {
    const sb = fakeSupabase();
    const r = await handleSignatureAction(sb, { action: 'signature-logo', remove: true }, 'me');
    expect(r.body).toEqual({ ok: true, logo_url: '' });
    expect(sb.calls.some(c => c.op === 'upload')).toBe(false);
    expect(sb.calls.find(c => c.op === 'upsert').row.logo_url).toBe(null);
  });

  it('refuses files that are not small real images', async () => {
    expect(decodeLogo(PNG, 'image/svg+xml').error).toBeTruthy();
    expect(decodeLogo(Buffer.from('<html>hi</html>').toString('base64'), 'image/png').error).toBeTruthy();
    expect(decodeLogo(Buffer.alloc(MAX_LOGO_BYTES + 10, 0x89).toString('base64'), 'image/png').error).toBeTruthy();
    expect(decodeLogo(`data:image/png;base64,${PNG}`, 'image/png').ext).toBe('png');
    const sb = fakeSupabase();
    const r = await handleSignatureAction(sb, { action: 'signature-logo', dataBase64: 'aGVsbG8=', contentType: 'image/gif' }, 'me');
    expect(r.status).toBe(400);
    expect(sb.calls.length).toBe(0);
  });

  it('says when the bucket is missing', async () => {
    const sb = fakeSupabase({ uploadError: { message: 'Bucket not found' } });
    const r = await handleSignatureAction(sb, { action: 'signature-logo', dataBase64: PNG, contentType: 'image/png' }, 'me');
    expect(r.status).toBe(400);
    expect(r.body.error).toContain('SQL');
  });

  it('refuses unknown actions', async () => {
    expect((await handleSignatureAction(fakeSupabase(), { action: 'nope' }, 'me')).status).toBe(400);
  });
});

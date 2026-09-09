import { describe, it, expect } from 'vitest';
import { htmlToPlainText } from './emailShell';

// Every outbound email was HTML-only (no plain-text part sent to Resend)
// until this was added -- a real, common spam-filter signal, since
// legitimate mail almost always carries both and spam tooling often
// skips the plain-text part.
describe('htmlToPlainText', () => {
  it('strips tags and preserves readable line breaks', () => {
    const html = '<p>Hi Dylan,</p><p>You are confirmed for <strong>Blackjack Dealer</strong>.</p>';
    const text = htmlToPlainText(html);
    expect(text).not.toContain('<');
    expect(text).toContain('Hi Dylan,');
    expect(text).toContain('You are confirmed for Blackjack Dealer.');
  });

  it('turns a link into "label (url)" instead of dropping the URL', () => {
    const html = '<a href="https://gigstaffpro.vercel.app/api/invite-respond?token=abc&action=accepted">Accept</a>';
    const text = htmlToPlainText(html);
    expect(text).toBe('Accept (https://gigstaffpro.vercel.app/api/invite-respond?token=abc&action=accepted)');
  });

  it('decodes common HTML entities', () => {
    expect(htmlToPlainText('Tips &amp; tricks &mdash; &quot;great&quot;'.replace('&mdash;', '-'))).toBe('Tips & tricks - "great"');
  });

  it('collapses excessive blank lines from block-level tags', () => {
    const html = '<div>A</div><div></div><div></div><div>B</div>';
    const text = htmlToPlainText(html);
    expect(text).not.toMatch(/\n{3,}/);
  });

  it('handles empty/null input without throwing', () => {
    expect(htmlToPlainText(null)).toBe('');
    expect(htmlToPlainText('')).toBe('');
  });
});

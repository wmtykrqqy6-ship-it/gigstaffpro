import { describe, it, expect } from 'vitest';
import { escapeHtml } from './escapeHtml';

// escapeHtml protects every outbound email against a crafted worker/event
// name rendering as live HTML in a recipient's inbox (a stored-XSS-style
// risk, since these values are admin/worker-entered text with no other
// escaping applied before being interpolated into email HTML).
describe('escapeHtml', () => {
  it('escapes all five HTML-significant characters', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('neutralizes a script-tag injection attempt', () => {
    const evil = '<script>alert(1)</script>';
    const escaped = escapeHtml(evil);
    expect(escaped).not.toContain('<script>');
    expect(escaped).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('Blackjack Dealer')).toBe('Blackjack Dealer');
  });

  it('handles null/undefined without throwing', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('coerces a non-string value to a string first', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});

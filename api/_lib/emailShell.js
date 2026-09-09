// api/_lib/emailShell.js
// Shared wrapper for every branded "Vegas on Wheels" transactional email.
// Was previously six independent copies (some using a <style> block +
// classes, one -- BulkInviteModal.jsx, in src/ -- with a different color
// and no emoji) split across api/ and src/. Standardized on inline styles
// throughout: several email clients (Outlook desktop in particular) strip
// or ignore <style> blocks entirely, which would have left those emails
// completely unstyled on receipt. This is the api/ copy; src/utils/
// emailShell.js is the same function for the two src/ modals that send
// email via api/send-email.js, kept as an independent copy since api/
// isn't bundled through Vite.
export function renderEmailShell({ subtitle, bodyHtml, headerEmoji = '🎰' }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif">
<div style="max-width:520px;margin:24px auto">
  <div style="background:#7c0a02;padding:24px 20px;border-radius:8px 8px 0 0;text-align:center">
    <div style="font-size:22px;font-weight:bold;color:#fff">${headerEmoji} Vegas on Wheels</div>
    <div style="font-size:13px;color:#fca5a5;margin-top:4px">${subtitle}</div>
  </div>
  <div style="background:#fff;padding:24px 20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    ${bodyHtml}
  </div>
</div>
</body></html>`;
}

// Derives a plain-text alternative from the final HTML. Every email this
// codebase sends went out HTML-only (no `text` part passed to Resend) --
// a real, common spam-filter signal, since legitimate mail almost always
// carries both parts and spam tooling often skips the plain-text one.
// Not a full HTML parser: good enough for this codebase's own simple,
// hand-written templates (inline styles, no nested tables), not meant to
// handle arbitrary third-party HTML.
export function htmlToPlainText(html) {
  return String(html || '')
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gis, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

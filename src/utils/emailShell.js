// src/utils/emailShell.js
// Shared wrapper for every branded "Vegas on Wheels" transactional email
// sent from the browser via api/send-email.js. Mirrors api/_lib/
// emailShell.js exactly -- kept as an independent copy since api/ isn't
// bundled through Vite, so the two sides of that boundary can't share a
// single import. See that file's header comment for the full context on
// why this replaced six independent hand-rolled copies (some using a
// <style> block, which several email clients strip on receipt).
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

// Derives a plain-text alternative from the final HTML -- see api/_lib/
// emailShell.js's copy of this function for why this exists.
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

// src/utils/escapeHtml.js
// Minimal HTML-escaping for admin-entered text (event/client/venue names,
// dress code, parking notes, worker names, etc.) interpolated into outbound
// email bodies sent from the browser via api/send-email.js. Mirrors
// api/_lib/escapeHtml.js -- kept as an independent copy since api/ isn't
// bundled through Vite. None of these values pass through a template
// engine that escapes by default, so a crafted event or worker name
// containing markup would otherwise render as live HTML in a worker's
// email client.
export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

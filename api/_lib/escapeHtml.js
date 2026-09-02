// api/_lib/escapeHtml.js
// Minimal HTML-escaping for admin-entered text (event/client/venue names,
// dress code, parking notes, etc.) interpolated into generated HTML --
// both live response pages (invite-respond.js) and outbound email bodies
// (invite-respond.js, promote-standby.js). None of these values pass
// through a template engine that escapes by default, so a crafted event
// name containing markup would otherwise render as live HTML/script in a
// worker's browser (the invite-response page) or email client.
export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

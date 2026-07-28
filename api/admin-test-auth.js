// api/admin-test-auth.js
// Phase A test-only endpoint: proves Bearer-token verification works before
// any privileged (service-role) action is built on top of it. Not called by
// the app UI.

import { verifyAdminRequest } from './_lib/verifyAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const check = await verifyAdminRequest(req);
  if (!check.ok) {
    return res.status(check.status).json({ error: check.error });
  }

  return res.status(200).json({ verified: true, adminUsername: check.adminUsername });
}

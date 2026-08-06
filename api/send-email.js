// api/send-email.js
// Vercel serverless function to send emails using Resend
// Admin-only: every call must carry a valid Supabase Auth admin bearer token.

import { verifyAdminRequest } from './_lib/verifyAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminCheck = await verifyAdminRequest(req);
  if (!adminCheck.ok) {
    return res.status(adminCheck.status).json({ error: adminCheck.error });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Email service not configured' });
  }

  const { to, subject, html } = req.body;

  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Vegas on Wheels <noreply@gigstaffpro.com>',
        to: [to],
        subject,
        html
      })
    });

    const data = await response.json();

    if (response.ok) {
      return res.status(200).json({ success: true, id: data.id });
    } else {
      return res.status(400).json({ success: false, error: data.message || 'Failed to send email' });
    }
  } catch (error) {
    console.error('Email sending error:', error);
    return res.status(500).json({ success: false, error: 'Server error sending email' });
  }
}

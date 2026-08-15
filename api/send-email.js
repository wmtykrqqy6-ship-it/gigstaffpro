// api/send-email.js
// Vercel serverless function to send emails using Resend
// Admin-only: every call must carry a valid Supabase Auth admin bearer token.

import { createClient } from '@supabase/supabase-js';
import { verifyAdminRequest } from './_lib/verifyAdmin.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '256kb',
    },
  },
};

// Mirrors src/constants.js's UI.EMAIL_REGEX — kept as an independent copy
// here since api/ functions are separate Vercel functions, not bundled
// through Vite, matching the existing api/_lib/workerAuth.js convention.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_RECIPIENT_LENGTH = 254;
const MAX_SUBJECT_LENGTH = 300;
const MAX_HTML_LENGTH = 200000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminCheck = await verifyAdminRequest(req);
  if (!adminCheck.ok) {
    return res.status(adminCheck.status).json({ error: adminCheck.error });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ success: false, error: 'Unable to process email request.' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  // Persistent, cross-instance rate limit — replaces the reverted in-memory
  // version. .single() both simplifies the response shape (one object
  // instead of a one-element array) and, per PostgREST's own semantics,
  // turns a 0-or-multiple-row result into an error rather than silently
  // picking a row — that error path is treated as fail-closed below along
  // with every other unexpected-error case, since check_email_rate_limit
  // always returns exactly one row per call by design.
  const { data: rateLimitResult, error: rateLimitError } = await supabaseAdmin
    .rpc('check_email_rate_limit', {
      p_admin_user_id: adminCheck.adminUserId,
      p_environment: process.env.VERCEL_ENV || 'unknown',
    })
    .single();

  if (rateLimitError || !rateLimitResult) {
    // Security middleware: an unexpected failure here must never be treated
    // as "allowed". Fail closed and never reach the Resend call below.
    console.error('Rate limit check failed:', rateLimitError);
    return res.status(500).json({ success: false, error: 'Unable to process email request.' });
  }

  if (rateLimitResult.allowed === false) {
    const retryAfterSeconds = Math.max(1, Number(rateLimitResult.retry_after_seconds) || 1);
    res.setHeader('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      success: false,
      error: 'Too many requests. Please wait a moment and try again.',
    });
  }

  const body = req.body;

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid email request',
    });
  }

  const { to, subject, html } = body;

  const trimmedTo = typeof to === 'string' ? to.trim() : '';
  const recipientInvalid =
    typeof to !== 'string' ||
    trimmedTo.length === 0 ||
    trimmedTo.length > MAX_RECIPIENT_LENGTH ||
    /[\r\n]/.test(trimmedTo) ||
    trimmedTo.includes(',') ||
    trimmedTo.includes(';') ||
    !EMAIL_REGEX.test(trimmedTo);

  if (recipientInvalid) {
    return res.status(400).json({
      success: false,
      error: 'Invalid recipient email address',
    });
  }

  const trimmedSubject = typeof subject === 'string' ? subject.trim() : '';
  const subjectInvalid =
    typeof subject !== 'string' ||
    trimmedSubject.length === 0 ||
    trimmedSubject.length > MAX_SUBJECT_LENGTH ||
    /[\r\n]/.test(trimmedSubject);

  if (subjectInvalid) {
    return res.status(400).json({
      success: false,
      error: 'Invalid email subject',
    });
  }

  const htmlInvalid =
    typeof html !== 'string' ||
    html.trim().length === 0 ||
    html.length > MAX_HTML_LENGTH ||
    /<script\b/i.test(html);

  if (htmlInvalid) {
    return res.status(400).json({
      success: false,
      error: 'Invalid email content',
    });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Email service not configured' });
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
        to: [trimmedTo],
        subject: trimmedSubject,
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

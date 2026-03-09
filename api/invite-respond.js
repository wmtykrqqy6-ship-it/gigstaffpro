// api/invite-respond.js
// Handles one-click accept/decline from email links
// URL: /api/invite-respond?token=<uuid>&action=accepted  OR  &action=declined

const SUPABASE_URL = 'https://ycsauzvkrbcynifkawuw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2F1enZrcmJjeW5pZmthd3V3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3MDQ4NTcsImV4cCI6MjA4NDI4MDg1N30.07H2LXdn2XKfpcrSmrp7_G0KXIJMH27fmJpCok10lrc';
const PORTAL_URL = 'https://gigstaffpro.vercel.app';

export default async function handler(req, res) {
  const { token, action } = req.query;

  if (!token || !['accepted', 'declined'].includes(action)) {
    return res.status(400).send(errorPage('Invalid link. Please log in to the staff portal.'));
  }

  // Look up the invitation by token
  const getRes = await fetch(
    `${SUPABASE_URL}/rest/v1/invitations?token=eq.${token}&select=*`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const invites = await getRes.json();

  if (!invites || invites.length === 0) {
    return res.status(404).send(errorPage('Invitation not found. It may have already been responded to.'));
  }

  const invite = invites[0];

  if (invite.status !== 'pending') {
    const msg = invite.status === 'accepted'
      ? 'You already accepted this invitation!'
      : invite.status === 'declined'
      ? 'You already declined this invitation.'
      : invite.status === 'expired'
      ? 'This invitation has expired.'
      : `This invitation is no longer pending (status: ${invite.status}).`;
    return res.status(200).send(alreadyRespondedPage(msg));
  }

  // Check expiry
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    await fetch(`${SUPABASE_URL}/rest/v1/invitations?id=eq.${invite.id}`, {
      method: 'PATCH',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'expired' })
    });
    return res.status(200).send(errorPage('Sorry, this invitation has expired. Contact your manager.'));
  }

  // Update the invitation status
  await fetch(`${SUPABASE_URL}/rest/v1/invitations?id=eq.${invite.id}`, {
    method: 'PATCH',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ status: action, responded_at: new Date().toISOString() })
  });

  if (action === 'accepted') {
    return res.status(200).send(successPage(
      '✅ Invitation Accepted!',
      "You're confirmed. Log in to the staff portal to view your upcoming events.",
      'accepted'
    ));
  } else {
    return res.status(200).send(successPage(
      'Invitation Declined',
      "We've noted your response. Log in to the staff portal to view other available events.",
      'declined'
    ));
  }
}

function basePage(content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GigStaffPro</title>
  <style>
    body { font-family: Arial, sans-serif; background: #111; min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; padding: 16px; }
    .card { background: white; border-radius: 12px; max-width: 460px; width: 100%; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.4); }
    .header { background: #7c0a02; padding: 28px 24px; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 22px; }
    .header p { color: #fca5a5; margin: 6px 0 0; font-size: 14px; }
    .body { padding: 28px 24px; text-align: center; }
    .icon { font-size: 52px; margin-bottom: 12px; }
    h2 { color: #111; margin: 0 0 10px; font-size: 20px; }
    p { color: #6b7280; margin: 0 0 24px; line-height: 1.5; }
    .btn { display: inline-block; background: #7c0a02; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px; }
  </style>
</head>
<body><div class="card">${content}</div></body>
</html>`;
}

function successPage(title, message, type) {
  const icon = type === 'accepted' ? '🎉' : '👋';
  return basePage(`
    <div class="header"><h1>🎰 Vegas on Wheels</h1><p>Staff Portal</p></div>
    <div class="body">
      <div class="icon">${icon}</div>
      <h2>${title}</h2>
      <p>${message}</p>
      <a class="btn" href="https://gigstaffpro.vercel.app">Go to Staff Portal →</a>
    </div>`);
}

function alreadyRespondedPage(message) {
  return basePage(`
    <div class="header"><h1>🎰 Vegas on Wheels</h1><p>Staff Portal</p></div>
    <div class="body">
      <div class="icon">ℹ️</div>
      <h2>Already Responded</h2>
      <p>${message}</p>
      <a class="btn" href="https://gigstaffpro.vercel.app">Go to Staff Portal →</a>
    </div>`);
}

function errorPage(message) {
  return basePage(`
    <div class="header"><h1>🎰 Vegas on Wheels</h1><p>Staff Portal</p></div>
    <div class="body">
      <div class="icon">⚠️</div>
      <h2>Something went wrong</h2>
      <p>${message}</p>
      <a class="btn" href="https://gigstaffpro.vercel.app">Go to Staff Portal →</a>
    </div>`);
}
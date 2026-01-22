// api/send-email.js
// Vercel serverless function to send emails using Resend

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, subject, html, resendApiKey } = req.body;

  if (!to || !subject || !html || !resendApiKey) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'GigStaffPro <onboarding@resend.dev>',
        to: [to],
        subject: subject,
        html: html
      })
    });

    const data = await response.json();

    if (response.ok) {
      return res.status(200).json({ 
        success: true,
        id: data.id
      });
    } else {
      return res.status(400).json({ 
        success: false,
        error: data.message || 'Failed to send email'
      });
    }
  } catch (error) {
    console.error('Email sending error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Server error sending email'
    });
  }
}
# CRM (replacing Goodshuffle)

GigStaffPro is growing into the CRM that replaces Goodshuffle Pro. The plan
and Dylan's answers are in the CRM plan doc
(https://claude.ai/artifact/Y8fSuhLP1LV6qAtUkgQe7n). Phase 0 (security) is
in `docs/CLIENT_SECURITY.md`. Every CRM table is admin-only: admins and sales
managers, who see everything (decided 2026-11-21). Clients never log in;
anything they open later is a secure link.

## Phase 1: clients and leads

Built in small pieces, each usable on its own:

1. **Clients tab** (done, 2026-11-24): see below.
2. **Goodshuffle history import** (built 2026-11-24): see below.
3. **Website quote form → leads** (built 2026-11-24): see below.
4. Leads pipeline (New, Quoted, Booked, Lost) with an automatic
   "still interested?" email after 7 days without a reply.
5. Messages inbox: client emails in and out, kept on the client's history.

## Clients tab

Top-level admin tab (`src/components/views/ClientsView.jsx`). It replaced
Settings → Clients, including "Add missing clients" (links events whose
client name isn't on the list yet).

- **List:** search (name, company, email, phone digits), filter by type,
  hide inactive clients, event count with the next or last event date.
- **Client page** (`src/components/clients/ClientDetail.jsx`):
  - Details: name, company, type, phone, email, billing address, tags,
    "about" notes, active switch. Inactive clients drop out of the event
    form's client list but keep their history.
  - Contacts: the people at the client (role, phone, email, best way to
    reach them), one marked primary.
  - Events: upcoming and past events linked by `events.client_id`.
  - History: dated notes, calls, emails, texts and meetings. The database
    fills in who wrote each entry and when, from the login.
- Client types: private party, corporate, fundraiser, event planner
  (`CLIENT_TYPES` in `src/utils/clientRecords.js`), so follow-ups and
  reports can differ by type later.

Data (migration `20261124120000_add_client_contacts_and_activity.sql`):

| Table | What |
| --- | --- |
| `clients` | + `client_type`, `billing_address` |
| `client_contacts` | people at a client; deleted with the client |
| `client_activity` | the client's history (`kind`: note, call, email, text, meeting); deleted with the client. The Messages inbox will add emails here |

Opening a client page writes a `view` entry to the access log; adds,
changes and deletes on all three tables are logged by database triggers.

Before the migration is run, the tab still works with the old columns:
saving skips type and billing address, and the contacts and history cards
say the SQL needs to be run.

## Goodshuffle history import

Clients tab → **Import from Goodshuffle** (`src/components/clients/GoodshuffleImport.jsx`,
logic in `src/utils/goodshuffleImport.js`).

- **Input:** `goodshuffle-import.json`, built from Goodshuffle's bulk
  downloads (the zips Dylan emailed himself, 2026-11-20 to 23): each zip's
  `project-list-*.xlsx` (project number, status, name, date, client, venue,
  sales lead, amount due) plus the contact (name, phone, email) and total
  read from its quote PDFs. 1,469 projects. The file has client contact
  details, so it lives only in the project's private files
  (`/mnt/project-files/crm-import/`), never in this public repo.
- **Preview first:** projects are grouped into clients (same email, name or
  phone), then matched to existing clients by email (client or contact),
  then by name. Nothing is written until the admin presses Import. A
  checkbox leaves out clients who only got a quote; included ones get a
  "Quote only" tag. Empty "New Project" shells are skipped.
- **Writes** (as the signed-in admin, so RLS and the access log apply):
  new clients (`source = 'goodshuffle'`); a missing email or phone on
  matched clients (nothing else changes); every project into
  `goodshuffle_projects` (upsert by project number, so running it again is
  safe); and events from pull sheets whose `goodshuffle_invoice` matches a
  project and that have no client yet get linked.
- On the client page, signed Goodshuffle projects (Contract Signed,
  Unsigned Changes) are listed under **Events** with a "booked in
  Goodshuffle" label, unless a GigStaffPro event already has that project
  number. Quotes that were never signed get their own **Quotes from
  Goodshuffle** card.
- Migration `20261124130000_add_goodshuffle_projects.sql`: the
  `goodshuffle_projects` table (admin-only) and `clients.source`.
- Client lists are read in pages (`fetchAllRows`), since Supabase returns at
  most 1,000 rows per request and there are ~1,100+ clients after the import.

## Settings > Email (2026-11-26)

One place for email settings (`src/components/settings/EmailSettingsTab.jsx`,
Dylan asked for it): the admin's own signature and logo, the automatic client
emails with the Google review and tip links, and where new quote requests go
(`lead_email`, plain text; empty means sales@vegasonwheels.com; also the
reply-to on automatic emails and Messages replies). Leads and Messages have
shortcut buttons to it.

### Editing the wording and adding emails (Dylan, 2026-11-26)

- Every automatic email has **Edit wording**: a subject and a plain-text
  message with blanks ({first_name}, {name}, {event_date}, {start_time},
  {location}, {days_away}, {phone}, {review_link}, {tip_link}), blank lines
  between paragraphs, "- " bullets and **bold**. The editor starts from the
  original wording (`DEFAULT_WORDING` in `clientEmailSettings.js`); wording
  left the same isn't saved, so that email keeps its built-in HTML. A line
  with {review_link} / {tip_link} is dropped when that link isn't set.
  Preview uses a made-up client.
- **Your own emails** (up to 10, `settings.custom`): name, subject, message,
  on/off, and when: N days before the event, after the event, after booking
  (booked clients), or after the quote / last "We talked" (quoted leads).
  Sent by the same hourly loop as the booked emails (`dueCustomEmails` in
  `api/_lib/bookedLeadEmails.js`), once per lead (`lead_emails_sent.kind =
  'custom:<id>'`), within 3 days of the due date, skipped for "Don't send
  auto emails". Saved in Messages as kind `custom`. Needs migration
  `20261126150000_allow_custom_client_emails.sql` (widens the two kind checks).
- The wording lives in the public-read `settings` row like the timing: fine
  for email text, but never put client details in it.

## Website quote form and Leads tab

Dylan wants the form on vegasonwheels.com (WordPress), not a page on
gigstaffpro.com, so visitors never leave the Vegas on Wheels site
(decided 2026-11-24).

- **Form:** `docs/wordpress-quote-form.html`, pasted into a Custom HTML block
  on vegasonwheels.com/contact-us/ in place of the old form. Same fields as
  the old one (name, email, phone required; company, location, date, start
  time, guests, games, extra services, message). It posts with `fetch` to
  `https://www.gigstaffpro.com/api/quote-request`.
- **Server:** `api/_lib/quoteRequest.js`, reached through a `vercel.json`
  rewrite to `api/send-email.js` (the Vercel plan is at its 12-function
  limit). It is the only path in that file without the admin check. It
  accepts only the vegasonwheels.com origins (CORS; more through
  `QUOTE_FORM_ORIGINS`), drops bots (hidden honeypot field, sent in under 3
  seconds), limits 5 per IP per hour, ignores the same email again within 10
  minutes, saves the lead with the service key, links it to a client with
  the same email, and emails sales@vegasonwheels.com (the `lead_email`
  setting, set in Settings > Email, overrides it; reply-to is the visitor).
- **Leads tab** (`src/components/views/LeadsView.jsx`): New, Quoted, Booked,
  Lost, with counts. Change a lead's stage; Lost asks why (price, date not
  available, went with someone else, no reply, event cancelled, other).
  "Add as client" creates a client from the lead and links it. "Add lead"
  for phone inquiries.
- Migration `20261124140000_add_leads.sql`: admin-only `public.leads`.

## Automatic lead follow-up (step 4)

- Off until an admin turns it on in **Settings > Email** (Automatic emails;
  the Leads tab links there), which also sets the number of days (default 7). Stored with the
  other automatic emails in settings `client_emails`
  (`api/_lib/clientEmailSettings.js`, copied to `src/utils/`).
- The days count from the **last contact**: the later of moving the lead
  to Quoted (`leads.quoted_at`) and the last "We talked" press
  (`leads.last_contact_at`). Dylan doesn't want it to go out while they are
  still working with the client (2026-11-24). Then the lead gets one "Still
  planning your casino party?" email (`api/_lib/leadFollowups.js`). Replies
  go to sales@vegasonwheels.com. "We talked" also allows one more follow-up
  later. "Don't send auto emails" (`followup_paused`) or Booked/Lost stops it.
  When the Messages inbox lands, emails with the client should update
  `last_contact_at` too.
- Runs on the hourly shift-reminder cron, between 9 AM and 6 PM business
  time. Only leads whose clock ran out in the last week, so turning it on
  never emails old quotes. Skips leads with no email or whose event date has passed.
- A lead is claimed (`followup_sent_at`) before sending, so it is never
  emailed twice; a refused send is undone and retried next hour.
- Migration `20261124150000_add_lead_followups.sql`.

## Automatic emails to booked clients

Wording approved by Dylan 2026-11-24 (Claude Doc "Post-booking client
emails"); code in `api/_lib/bookedLeadEmails.js`, same cron and hours.

| Email | Default timing | Settable |
| --- | --- | --- |
| Booking thank-you | the day a lead is marked Booked (`leads.booked_at`) | on/off |
| Upsell ideas | 21 days before the event | on/off, days before |
| Get-ready checklist | 7 days before the event | on/off, days before |
| Review and tip | the Monday after the event | on/off, days after (empty = Monday after) |

- All off until turned on in Settings > Email. One email of each kind per lead,
  tracked in `lead_emails_sent` (claimed before sending, removed if the send
  fails). A missed day still sends within 3 days.
- Only leads in Booked with an email and event date; "Don't send auto
  emails" or Lost stops them. The upsell is skipped when the client booked
  after its date.
- The review email includes the Google review and tip links only when they
  are filled in on the panel (no online tip page exists yet).
- Migration `20261124160000_add_booked_lead_emails.sql`.
- Sender: client emails (follow-up and booked emails) come from
  `Vegas on Wheels <sales@vegasonwheels.com>` (`CLIENT_FROM` in
  `api/_lib/leadFollowups.js`) so customers never see GigStaffPro. The domain
  is verified in Resend for sending only (DNS in GoDaddy: TXT
  `resend._domainkey`, CNAMEs `send` and `rsend`). Receiving is off, because
  Resend's receiving MX would replace the GoDaddy/Microsoft 365 mailbox.
  Staff emails still come from `noreply@gigstaffpro.com`.
- Hosting note: vegasonwheels.com runs on GoDaddy WordPress, whose firewall
  refuses page saves containing `<script>` or `<iframe>`. The form markup is
  a Custom HTML block on the page; the script is a WPCode Lite JavaScript
  snippet (site-wide footer, does nothing on pages without the form).

## Messages inbox (step 5)

Works like Goodshuffle's: client emails that come in, and replies sent from
GigStaffPro, show up; emails typed directly in Outlook don't (Dylan,
2026-11-24: "this is exactly how goodshuffle works").

- **Incoming:** sales@vegasonwheels.com (GoDaddy email on Microsoft 365) has
  an Outlook rule that *redirects* (not forwards, so the client stays the
  sender) outside email to an address on `in.vegasonwheels.com`. That
  subdomain is a Resend receiving domain (DNS in GoDaddy: MX `in` ->
  `receive.forge.rmta.net` priority 10, TXT `resend._domainkey.in`); the main
  domain's mail is untouched. Resend calls `/api/inbound-email` (a
  `vercel.json` rewrite to `api/send-email.js?route=inbound-email`) with an
  `email.received` event.
- **Trust:** the webhook body is not trusted. The server takes only the email
  id and fetches the email from `GET https://api.resend.com/emails/receiving/{id}`
  with our `RESEND_API_KEY` (so no webhook secret is needed). It must be
  addressed to `@in.vegasonwheels.com`, and mail from our own addresses is
  ignored. Code: `api/_lib/clientMessages.js`.
- **Matching:** by the sender's email: an open lead first (newest), else a
  client's email, else a client contact's email. Unknown senders are saved as
  "Not linked". A matched lead gets `last_contact_at` = now and
  `followup_sent_at` cleared, so the follow-up clock starts over.
- **Outgoing:** replies from the Messages screen (admin-only
  `action: 'client-reply'` on `api/send-email.js`, same email rate limit) go
  from sales@vegasonwheels.com with reply-to sales@, are saved, and count as
  contact. The automatic emails are saved too (`recordClientMessage`).
- **Storage:** `public.client_messages` (migration
  `20261125120000_add_client_messages.sql`): text only, no HTML or
  attachments. Admin-only read; admins can only mark read or re-link
  (column-level grant); only the server inserts. Viewing the Messages tab is
  logged in the client access log (`where: messages_tab`).
- **Screens:** Messages tab (conversations by contact, All / Unread / Not
  linked, search, reply), and an "Emails" section on each lead card and
  client page.
- **Set up (live 2026-11-26):** the Outlook rule "GigStaffPro copy" on
  sales@ redirects all mail to `inbox@in.vegasonwheels.com` (any address on
  the subdomain works). Microsoft 365 blocks outside auto-forwarding by
  default (bounce `550 5.7.520`), so a custom outbound anti-spam policy
  "Allow sales@ forwarding" (security.microsoft.com/antispam) turns automatic
  forwarding on for sales@ only. The Resend webhook (`email.received` ->
  `https://www.gigstaffpro.com/api/inbound-email`) is in the account that
  holds gigstaffpro.com. If Resend ever shows the domain "Failed" (its check
  ran before DNS was live), press Restart on the domain page. Microsoft's
  message trace (admin.exchange.microsoft.com > Mail flow > Message trace)
  shows whether a copy was sent.
- **Rep signatures (Dylan, 2026-11-26: shared sales@ + a signature per rep):**
  every reply still comes from sales@, so clients always reach the team.
  Each admin / sales manager sets "My signature" in Settings > Email (also
  reachable from the Messages screen's "My signature" button) (a
  display name and up to 1,000 characters); the server adds it below the
  message when sending (`handleClientReply`), and the saved copy includes it.
  Replies show the rep's name, and a **Mine** filter lists conversations
  you've replied in (`client_messages.sent_by`). Stored in
  `public.admin_email_signatures` (migration
  `20261126120000_add_admin_email_signatures.sql`): no browser access at all;
  read and saved only through `api/send-email.js` actions `signature-get` /
  `signature-save`, which save only the caller's own row
  (`api/_lib/emailSignatures.js`).
- **Signature logo (2026-11-26):** each rep clicks **Upload logo** on My
  signature (PNG, JPG or GIF under 500 KB). The server (`signature-logo`
  action) checks it's a real image by its first bytes, stores it in the
  public Storage bucket `email-assets` (migration
  `20261126140000_add_email_assets_bucket.sql`; no upload policies, server
  only) and saves the link in `admin_email_signatures.logo_url` (migration
  `20261126130000_add_signature_logo.sql`, https links only). It's shown 160px
  wide under the signature in the HTML email (not in the plain-text copy or
  the saved copy). Some email apps hide images until the client clicks "show
  images". Replaced logos stay in the bucket (small; clean up by hand if
  ever needed).

Not built yet (from the plan): a planner linked to several clients
("booked through"), and merging duplicate clients (worth doing with the
Goodshuffle import).

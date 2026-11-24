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
  the same email, and emails sales@vegasonwheels.com (a `lead_email`
  settings row overrides it; reply-to is the visitor).
- **Leads tab** (`src/components/views/LeadsView.jsx`): New, Quoted, Booked,
  Lost, with counts. Change a lead's stage; Lost asks why (price, date not
  available, went with someone else, no reply, event cancelled, other).
  "Add as client" creates a client from the lead and links it. "Add lead"
  for phone inquiries.
- Migration `20261124140000_add_leads.sql`: admin-only `public.leads`.

## Automatic lead follow-up (step 4)

- Off until an admin turns it on at the top of the Leads tab
  (`settings.lead_followup_enabled`). The tab shows the exact email.
- Moving a lead to **Quoted** starts a 7-day clock (`leads.quoted_at`). If
  the lead is still Quoted 7 days later, it gets one "Still planning your
  casino party?" email (`api/_lib/leadFollowups.js`). Replies go to
  sales@vegasonwheels.com. Moving it to Booked or Lost stops it.
- Runs on the hourly shift-reminder cron, between 9 AM and 6 PM business
  time. Only leads quoted in the last 14 days, so turning it on never emails
  old quotes. Skips leads with no email or whose event date has passed.
- A lead is claimed (`followup_sent_at`) before sending, so it is never
  emailed twice; a refused send is undone and retried next hour.
- Until the Messages inbox exists, "no reply" means "still Quoted": move a
  lead out of Quoted when they answer.
- Migration `20261124150000_add_lead_followups.sql`.
- Hosting note: vegasonwheels.com runs on GoDaddy WordPress, whose firewall
  refuses page saves containing `<script>` or `<iframe>`. The form markup is
  a Custom HTML block on the page; the script is a WPCode Lite JavaScript
  snippet (site-wide footer, does nothing on pages without the form).

Not built yet (from the plan): a planner linked to several clients
("booked through"), and merging duplicate clients (worth doing with the
Goodshuffle import).

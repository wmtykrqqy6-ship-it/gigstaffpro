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
3. Website quote request form that creates a lead.
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
- The client page shows a **Goodshuffle history** card.
- Migration `20261124130000_add_goodshuffle_projects.sql`: the
  `goodshuffle_projects` table (admin-only) and `clients.source`.
- Client lists are read in pages (`fetchAllRows`), since Supabase returns at
  most 1,000 rows per request and there are ~1,100+ clients after the import.

Not built yet (from the plan): a planner linked to several clients
("booked through"), and merging duplicate clients (worth doing with the
Goodshuffle import).

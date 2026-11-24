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
2. Goodshuffle history import (~1,469 projects, ~1,120 clients).
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

Not built yet (from the plan): a planner linked to several clients
("booked through"), and merging duplicate clients (worth doing with the
Goodshuffle import).

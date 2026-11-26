# Client data security (CRM Phase 0)

Rules for who can see client records, how admins sign in, and the access
log. Background: the CRM plan's Phase 0 ("security fixes before any customer
data goes in"), decided with Dylan 2026-11-21.

## Who can see client data

- **Admins and sales managers only.** Sales managers have full admin access
  (decided 2026-11-21: "sales managers see everything"). Each person gets
  their own login so the access log names them.
- Workers never see client details. Client name and contact live in
  `event_client_details` (admin-only), not on the public `events` row
  (migration `20261121120000_make_client_details_admin_only.sql`).
- Admin-only tables (RLS `is_admin()`): `clients`, `client_contacts`,
  `client_activity`, `goodshuffle_projects`, `leads`, `lead_emails_sent`, `client_messages`, `event_client_details`, `venues`,
  `client_access_log`.
- Server-only (no browser access): `admin_email_signatures` (reps' names and
  signatures for Messages replies).
- The role is stored on `admin_users.role`: `admin` or `sales_manager`.
  `public.my_staff_role()` returns the signed-in person's role. Today the
  two roles have the same access; the role is a label in the log.

## 2-step sign-in

Every admin and sales manager signs in with their password and then a
6-digit code from an authenticator app (Supabase Auth MFA, TOTP).

- First sign-in after this shipped: the app shows a QR code to scan, then
  asks for a code. After that it asks for a code each sign-in.
- Code: `src/components/AdminTwoStep.jsx`, `src/utils/adminTwoStep.js`.
  Shown after the password (`LoginScreen.jsx`) and when a saved session that
  hasn't passed 2-step is restored (`App.jsx` checkSession).
- Enforced in three places, so skipping the app's screen doesn't help:
  1. The app opens the dashboard only on an `aal2` session.
  2. Admin API routes (`api/_lib/verifyAdmin.js`) refuse a token without
     `aal = 'aal2'`. Emergency switch: `ADMIN_2STEP_OFF=true` in Vercel.
  3. The database: `is_admin()` requires `aal2`
     (`20261122130000_require_two_step_for_admins.sql`). Run that migration
     only after every admin and sales manager has set up their app.
- Supabase setting: Authentication → Sign In / Providers → Multi-Factor
  (TOTP) must be enabled. It is on by default.

### Lost phone

Save the setup key (shown under "Can't scan?") in a password manager when
setting up, so the app can be re-added to a new phone. If that wasn't done,
clear the person's authenticator in the Supabase SQL editor, and they'll be
asked to set it up again at the next sign-in:

```sql
DELETE FROM auth.mfa_factors
WHERE user_id = (SELECT id FROM auth.users WHERE email = '<their email>');
```

## Adding a sales manager

1. Supabase → Authentication → Users → Add user → Create new user, with
   their email and a password, and "Auto confirm" on.
2. In the SQL editor (fill in the name and email):

```sql
WITH new_admin AS (
  INSERT INTO public.admin_users (username, role)
  VALUES ('<their name>', 'sales_manager')
  RETURNING id
)
INSERT INTO public.admin_auth_links (admin_user_id, auth_user_id)
SELECT new_admin.id, u.id
FROM new_admin, auth.users u
WHERE u.email = '<their email>';
```

3. They sign in at the admin login and set up their authenticator app.

To remove someone: delete their row in `admin_auth_links` (access ends at
once) and their user in Authentication → Users.

## Access log

`public.client_access_log`: who viewed, exported, added, changed or deleted
a client record, and when. Shown in Settings → Access log (latest 200).

- **Adds, changes, deletes** of `clients`, `client_contacts`,
  `client_activity` and `event_client_details` are logged by database
  triggers, however the change was made. Updates list the
  changed field names, not the values, so the log isn't a second copy of
  contact details. The client's name is kept as the entry's label.
- **Views and exports** are logged by the app through
  `log_client_access()` (`src/utils/clientAccessLog.js`). The database takes
  the person from their login. A list view from the same screen is logged at
  most once every 10 minutes. Any future export of client data must call
  `logClientAccess(supabase, { action: 'export', ... })`.
- Limitation: a view is only recorded when it goes through the app. Someone
  reading the tables directly with a valid admin login and 2-step session
  wouldn't produce a view entry (changes are always recorded).
- Nobody can edit or delete entries through the app or the API (no insert,
  update or delete grants). Only the database owner (SQL editor) could.

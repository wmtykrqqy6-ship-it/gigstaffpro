# Database Backups

The Supabase **Free** plan has no backups you can restore yourself, so a GitHub Actions workflow
(`.github/workflows/backup-database.yml`) makes one every night at about 3 AM Central:

1. `pg_dump` (version 17, matching the server) dumps the whole database — schema, data, RLS policies,
   grants.
2. The dump is checked (not tiny, ends with "dump complete"), gzipped, and **encrypted with AES-256**
   using a passphrase only Dylan knows.
3. The encrypted file is kept as a workflow artifact for **90 days**.

The repo is **public**: anyone signed in to GitHub can download artifacts, so the backup is only ever
stored encrypted. Without the passphrase the file is unreadable — to everyone, including us.

## One-time setup

In GitHub: **repo → Settings → Secrets and variables → Actions → New repository secret**, add:

| Secret | Value |
|---|---|
| `SUPABASE_DB_URL` | Supabase dashboard → **Connect** → **Session pooler** → the URI (`postgresql://postgres.<project>:<password>@aws-…pooler.supabase.com:5432/postgres`), with the database password filled in. Use the *session pooler* — Free-plan direct connections are IPv6-only and GitHub can't reach them. |
| `BACKUP_PASSPHRASE` | A long passphrase (16+ characters). **Save it in a password manager** — lose it and every backup is useless. |

Then **Actions → Backup Database → Run workflow** to take the first backup and confirm it works
(green check, an artifact named `gigstaffpro-db-<date>` on the run page).

Note: GitHub pauses scheduled workflows in a repo with no activity for 60 days. Any push keeps it
running; if it ever pauses, GitHub emails the repo owner and it can be re-enabled on the Actions tab.

## Restoring

1. **Download**: Actions → Backup Database → pick a run → download the artifact (a `.zip`
   containing `gigstaffpro-db-<date>.sql.gz.gpg`).
2. **Decrypt** (Git Bash on Windows has `gpg`):
   ```
   gpg -d gigstaffpro-db-<date>.sql.gz.gpg | gunzip > restore.sql
   ```
   It asks for `BACKUP_PASSPHRASE`.
3. **Use it**: `restore.sql` is a plain SQL dump. Restoring into a **new** Supabase project is the safe
   path (never restore over the live database without a plan): create the project, then run the dump
   with `psql "<new project's connection string>" -f restore.sql` (e.g. via
   `docker run --rm -i postgres:17 psql ...`). Supabase-managed schemas (`auth`, `storage`) may report
   "already exists" errors that can be ignored; check the `public` tables afterwards. For recovering a
   few rows, open `restore.sql` and copy the relevant `COPY public.<table>` block instead.

Ask Claude to walk through a restore before you need one for real.

-- Messages inbox: delete conversations and block senders. See docs/CRM.md.
--
-- Run AFTER 20261126150000_allow_custom_client_emails.sql.
--
-- ---------------------------------------------------------------------------
-- What this does
-- ---------------------------------------------------------------------------
-- * client_messages.deleted_at: when an admin deleted the message from the
--   Messages screen. Deleted messages move to the "Deleted" folder and can be
--   restored; nothing is erased. Admins may set it (added to the
--   column-level UPDATE grant, same as read_at).
-- * public.client_message_blocks: sender addresses an admin blocked. The
--   server (service key) skips new email from a blocked address, so it never
--   reaches Messages. Admins and sales managers can list, add and remove
--   blocks (RLS: is_admin()). Nobody else can see the table.
--
-- Nothing existing changes: no rows are touched and no policy is loosened.
--
-- ---------------------------------------------------------------------------
-- Undo (only if needed)
-- ---------------------------------------------------------------------------
--   DROP TABLE IF EXISTS public.client_message_blocks;
--   REVOKE UPDATE (deleted_at) ON public.client_messages FROM authenticated;
--   ALTER TABLE public.client_messages DROP COLUMN IF EXISTS deleted_at;

BEGIN;

ALTER TABLE public.client_messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
GRANT UPDATE (deleted_at) ON TABLE public.client_messages TO authenticated;

CREATE TABLE IF NOT EXISTS public.client_message_blocks (
  email      text PRIMARY KEY CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  blocked_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_message_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_message_blocks_admin_read" ON public.client_message_blocks;
CREATE POLICY "client_message_blocks_admin_read" ON public.client_message_blocks
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "client_message_blocks_admin_insert" ON public.client_message_blocks;
CREATE POLICY "client_message_blocks_admin_insert" ON public.client_message_blocks
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "client_message_blocks_admin_delete" ON public.client_message_blocks;
CREATE POLICY "client_message_blocks_admin_delete" ON public.client_message_blocks
  FOR DELETE USING (public.is_admin());

REVOKE ALL ON TABLE public.client_message_blocks FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.client_message_blocks TO authenticated;
GRANT ALL ON TABLE public.client_message_blocks TO service_role;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- 20261124090000_identity_accounts_core.sql
-- REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
--
-- Multi-role identity, Task 1, milestone M1 — file 1 of 8: the identity tables.
--
-- What this file creates (nothing existing is altered):
--   1. account_role_codes        — lookup of the three self-service roles.
--   2. accounts                  — one row per person per tenant.
--   3. account_roles             — the memberships: (account, role), with status.
--   4. account_link_conflicts    — farmers that could not be linked to an account
--                                  (NULL tenant, NULL mobile, number already held).
--                                  Reported, never guessed at.
--   5. v_identity_integrity_gaps — the standing check: one row per broken link.
--                                  Expected result after the backfill: 0 rows.
--
-- Rules these tables carry:
--   * An account's id equals farmers.id for every farmer. There is NO foreign key
--     from farmers to accounts (the tenant portal inserts farmers with its own id
--     before any account exists); the link is the equal id, proven by the view.
--   * Credential, single copy: a person with a farmers row keeps farmers.pin_hash.
--     accounts.pin_hash is filled only for a person without a farmers row.
--   * A membership carries its tenant, and the composite foreign key makes it
--     impossible for a membership to name a tenant other than its account's.
--   * No client role can read or write these tables: RLS is on with no policy,
--     and every privilege is revoked from anon and authenticated (the project's
--     default privileges would otherwise grant them everything, TRUNCATE included).
--
-- One open account per (tenant, mobile): the uniqueness is a partial unique index
-- that leaves CLOSED accounts out. Reason, from the tenant portal's code: it can
-- delete a farmer and create the same person again with a new id. The old account
-- is kept (CLOSED, role REVOKED) and the new farmers row gets its own account.
-- A plain UNIQUE (tenant_id, mobile_number) would lock that farmer out.
--
-- Safe to run twice. Plain statements, no session state.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1 ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.account_role_codes (
  code        text PRIMARY KEY,
  label_en    text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_role_codes_code_check CHECK (code ~ '^[A-Z][A-Z_]{2,39}$')
);

INSERT INTO public.account_role_codes (code, label_en, sort_order) VALUES
  ('FARMER',           'Farmer',           10),
  ('SERVICE_PROVIDER', 'Service Provider', 20),
  ('CUSTOMER',         'Customer',         30)
ON CONFLICT (code) DO NOTHING;

-- 2 ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.accounts (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  mobile_number             text NOT NULL,
  status                    text NOT NULL DEFAULT 'ACTIVE',
  display_name              text,
  avatar_url                text,
  language_code             text,
  notification_preferences  jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_login_at             timestamptz,
  mobile_verified_at        timestamptz,          -- set only by a later OTP flow
  -- Credential. Filled ONLY for a person without a farmers row (single copy).
  pin_hash                  text,
  pin_hash_version          smallint NOT NULL DEFAULT 1,
  pin_updated_at            timestamptz,
  failed_login_attempts     integer NOT NULL DEFAULT 0,
  last_failed_login         timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounts_mobile_number_check CHECK (mobile_number ~ '^[0-9]{10}$'),
  CONSTRAINT accounts_status_check        CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  CONSTRAINT accounts_language_code_check CHECK (language_code IS NULL OR language_code ~ '^[a-z]{2,3}$'),
  CONSTRAINT accounts_display_name_check  CHECK (display_name IS NULL OR char_length(btrim(display_name)) BETWEEN 1 AND 80),
  CONSTRAINT accounts_failed_attempts_check CHECK (failed_login_attempts >= 0),
  -- Target of the composite foreign keys that pin a membership to its account's tenant.
  CONSTRAINT accounts_id_tenant_key UNIQUE (id, tenant_id)
);

-- One open account per person per tenant (CLOSED accounts are history, see header).
CREATE UNIQUE INDEX IF NOT EXISTS accounts_tenant_mobile_open_uidx
  ON public.accounts (tenant_id, mobile_number) WHERE status <> 'CLOSED';

CREATE OR REPLACE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 3 ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.account_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL,
  tenant_id   uuid NOT NULL,
  role        text NOT NULL REFERENCES public.account_role_codes(code),
  status      text NOT NULL DEFAULT 'ACTIVE',
  granted_at  timestamptz NOT NULL DEFAULT now(),
  granted_by  uuid,                                -- account or staff user that granted it; NULL for system grants
  source      text NOT NULL,                       -- BACKFILL, FARMER_TRIGGER, and the codes later tasks add
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_roles_status_check CHECK (status IN ('ACTIVE', 'PENDING', 'SUSPENDED', 'REVOKED')),
  CONSTRAINT account_roles_source_check CHECK (source ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  CONSTRAINT account_roles_account_role_key UNIQUE (account_id, role),
  -- Target of account_reach_settings' foreign key (membership and tenant in one key).
  CONSTRAINT account_roles_account_role_tenant_key UNIQUE (account_id, role, tenant_id),
  -- A membership cannot name a tenant other than its account's tenant.
  CONSTRAINT account_roles_account_tenant_fkey FOREIGN KEY (account_id, tenant_id)
    REFERENCES public.accounts (id, tenant_id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE OR REPLACE TRIGGER update_account_roles_updated_at
  BEFORE UPDATE ON public.account_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 4 ─────────────────────────────────────────────────────────────────────────
-- No foreign keys on purpose: a note must survive whatever happens to the rows it names.
CREATE TABLE IF NOT EXISTS public.account_link_conflicts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id      uuid NOT NULL,
  tenant_id      uuid,
  mobile_number  text,
  account_id     uuid,                             -- the other account involved, when there is one
  reason         text NOT NULL,
  detected_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at    timestamptz,
  resolution     text,
  CONSTRAINT account_link_conflicts_reason_check CHECK (reason IN (
    'NULL_TENANT',            -- farmers row has no tenant: no account can be made
    'NULL_MOBILE',            -- farmers row has no mobile number: no account can be made
    'MOBILE_ACCOUNT_EXISTS',  -- another open account in the tenant already holds the number
    'TENANT_MISMATCH',        -- an account with this id exists in a different tenant
    'MOBILE_CLEARED'          -- the farmer's mobile number was set to NULL after linking
  ))
);

-- One open note per farmer and reason.
CREATE UNIQUE INDEX IF NOT EXISTS account_link_conflicts_open_uidx
  ON public.account_link_conflicts (farmer_id, reason) WHERE resolved_at IS NULL;

-- 5 ─────────────────────────────────────────────────────────────────────────
-- The standing check. Every arm is a broken promise; the healthy answer is 0 rows.
CREATE OR REPLACE VIEW public.v_identity_integrity_gaps AS
  SELECT 'FARMER_WITHOUT_ACCOUNT'::text AS gap, f.id AS farmer_id, NULL::uuid AS account_id, f.tenant_id
    FROM public.farmers f
   WHERE NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = f.id)
  UNION ALL
  SELECT 'FARMER_ROLE_MISSING', f.id, a.id, f.tenant_id
    FROM public.farmers f
    JOIN public.accounts a ON a.id = f.id
   WHERE NOT EXISTS (SELECT 1 FROM public.account_roles r
                      WHERE r.account_id = a.id AND r.role = 'FARMER' AND r.status <> 'REVOKED')
  UNION ALL
  SELECT 'FARMER_ACCOUNT_CLOSED', f.id, a.id, f.tenant_id
    FROM public.farmers f
    JOIN public.accounts a ON a.id = f.id
   WHERE a.status = 'CLOSED'
  UNION ALL
  SELECT 'MOBILE_DRIFT', f.id, a.id, f.tenant_id
    FROM public.farmers f
    JOIN public.accounts a ON a.id = f.id
   WHERE f.mobile_number::text IS DISTINCT FROM a.mobile_number
  UNION ALL
  SELECT 'TENANT_DRIFT', f.id, a.id, f.tenant_id
    FROM public.farmers f
    JOIN public.accounts a ON a.id = f.id
   WHERE f.tenant_id IS DISTINCT FROM a.tenant_id
  UNION ALL
  SELECT 'CREDENTIAL_HELD_TWICE', f.id, a.id, f.tenant_id
    FROM public.farmers f
    JOIN public.accounts a ON a.id = f.id
   WHERE f.pin_hash IS NOT NULL AND a.pin_hash IS NOT NULL
  UNION ALL
  SELECT 'CREDENTIAL_MISSING', NULL::uuid, a.id, a.tenant_id
    FROM public.accounts a
   WHERE a.status <> 'CLOSED' AND a.pin_hash IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.farmers f WHERE f.id = a.id)
     AND EXISTS (SELECT 1 FROM public.account_roles r WHERE r.account_id = a.id AND r.status <> 'REVOKED')
  UNION ALL
  SELECT 'LIVE_FARMER_ROLE_WITHOUT_FARMER_ROW', NULL::uuid, r.account_id, r.tenant_id
    FROM public.account_roles r
   WHERE r.role = 'FARMER' AND r.status <> 'REVOKED'
     AND NOT EXISTS (SELECT 1 FROM public.farmers f WHERE f.id = r.account_id)
  UNION ALL
  SELECT 'SESSION_WITHOUT_ACCOUNT', NULL::uuid, s.user_id, NULL::uuid
    FROM public.user_sessions s
   WHERE NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = s.user_id);

-- Lock-down ─────────────────────────────────────────────────────────────────
ALTER TABLE public.account_role_codes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_roles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_link_conflicts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.account_role_codes, public.accounts, public.account_roles,
              public.account_link_conflicts, public.v_identity_integrity_gaps
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.account_role_codes, public.accounts, public.account_roles,
             public.account_link_conflicts TO service_role;
GRANT SELECT ON public.v_identity_integrity_gaps TO service_role;

COMMENT ON TABLE public.accounts IS
  'One person in one tenant. id equals farmers.id for every farmer. Credential columns are filled only for a person without a farmers row.';
COMMENT ON TABLE public.account_roles IS
  'Memberships: FARMER, SERVICE_PROVIDER, CUSTOMER. The only source of truth for which role a person holds.';
COMMENT ON TABLE public.account_link_conflicts IS
  'Farmers the account link could not cover. Service-role only. Resolve by review, never automatically.';
COMMENT ON VIEW public.v_identity_integrity_gaps IS
  'Standing identity check. Healthy result: 0 rows.';

-- Verification (read-only) ──────────────────────────────────────────────────
SELECT 'client privileges left on identity tables' AS check_name, count(*)::text AS actual, '0' AS expected
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name IN ('account_role_codes', 'accounts', 'account_roles', 'account_link_conflicts', 'v_identity_integrity_gaps')
   AND grantee IN ('anon', 'authenticated', 'PUBLIC');

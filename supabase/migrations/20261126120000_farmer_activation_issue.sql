-- ============================================================================
-- Farmer activation: handing a code to a farmer
-- (fourth database part; needs 20261124160000_farmer_activation_core.sql)
-- ============================================================================
-- Why
--   A tenant could only download a whole batch as a PDF or CSV sheet. To give
--   ONE code to ONE farmer (show its QR at the counter, send it on WhatsApp)
--   the tenant had to open the sheet and copy from it, and nothing recorded
--   which code went to whom. So the tenant could not tell stock from codes
--   already handed out, and could not follow up on farmers who never activated.
--
-- What this adds
--   1. Five columns on activation_codes: who the code was handed to and by whom.
--   2. public.activation_issue_code(): returns ONE unused code of the caller's
--      own tenant (text + QR text), optionally records the recipient, and
--      writes the audit trail (who, when, which code, to whom).
--
-- Security
--   * Same right as downloading a sheet: a tenant admin of the code's tenant,
--     or a super admin. A foreign or unknown code answers "not_authorized".
--   * Only an unused, unexpired code can be shown. A used, revoked or expired
--     code has no recoverable copy (the core migration wipes it).
--   * Every call is written to activation_logs before the code is returned.
--   * The record of who received a code freezes with the code: the existing
--     guard refuses any change to a used, revoked or expired code.
--   * Handing a code out does NOT reserve it for that person. Whoever enters it
--     first uses it; that rule of activation_redeem() is not changed here.
--
-- Not changed: activation_redeem, the guards, the policies, every other
-- function. Nothing is deleted. Self-contained: no TEMP tables, no session
-- state. Re-runnable. Rollback: tests/activation/rollback_issue.sql
-- ============================================================================

-- ── 0. pre-flight ───────────────────────────────────────────────────────────
DO $preflight$
BEGIN
  IF to_regprocedure('public.activation_reveal_codes(uuid)') IS NULL
     OR to_regprocedure('activation.format_code(text)') IS NULL
     OR to_regprocedure('activation.secret(text)') IS NULL THEN
    RAISE EXCEPTION 'activation core is missing: apply 20261124160000_farmer_activation_core.sql first';
  END IF;
END
$preflight$;

-- ── 1. who a code was handed to ─────────────────────────────────────────────
ALTER TABLE public.activation_codes
  ADD COLUMN IF NOT EXISTS issued_at        timestamptz,
  ADD COLUMN IF NOT EXISTS issued_by        uuid,
  ADD COLUMN IF NOT EXISTS issued_to_name   text,
  ADD COLUMN IF NOT EXISTS issued_to_mobile text,
  ADD COLUMN IF NOT EXISTS issue_note       text;

COMMENT ON COLUMN public.activation_codes.issued_at        IS 'When the tenant handed this code to a farmer (activation_issue_code). NULL = still in stock.';
COMMENT ON COLUMN public.activation_codes.issued_by        IS 'Portal user who handed it out.';
COMMENT ON COLUMN public.activation_codes.issued_to_name   IS 'Recipient as typed by the tenant. A note for follow-up, not a reservation.';
COMMENT ON COLUMN public.activation_codes.issued_to_mobile IS 'Recipient mobile (10 digits) as typed by the tenant. A note for follow-up, not a reservation.';

DO $shape$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
                  WHERE conname = 'activation_codes_issue_shape'
                    AND conrelid = 'public.activation_codes'::regclass) THEN
    ALTER TABLE public.activation_codes ADD CONSTRAINT activation_codes_issue_shape CHECK (
      (issued_at IS NULL AND issued_by IS NULL AND issued_to_name IS NULL
         AND issued_to_mobile IS NULL AND issue_note IS NULL)
      OR
      (issued_at IS NOT NULL AND issued_by IS NOT NULL
         AND (issued_to_name IS NOT NULL OR issued_to_mobile IS NOT NULL)
         AND (issued_to_name   IS NULL OR char_length(issued_to_name) BETWEEN 1 AND 80)
         AND (issued_to_mobile IS NULL OR issued_to_mobile ~ '^[0-9]{10}$')
         AND (issue_note       IS NULL OR char_length(issue_note) BETWEEN 1 AND 200)));
  END IF;
END
$shape$;

-- Follow-up list: codes handed out and not used yet, per tenant.
CREATE INDEX IF NOT EXISTS activation_codes_issued_idx
  ON public.activation_codes (tenant_id, issued_at DESC)
  WHERE issued_at IS NOT NULL;

-- The portal reads these through the existing row policy (own tenant only).
GRANT SELECT (issued_at, issued_by, issued_to_name, issued_to_mobile, issue_note)
  ON public.activation_codes TO authenticated;

-- ── 2. show one code, and record who gets it ────────────────────────────────
CREATE OR REPLACE FUNCTION public.activation_issue_code(
  p_code_id          uuid,
  p_recipient_name   text DEFAULT NULL,
  p_recipient_mobile text DEFAULT NULL,
  p_note             text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_actor   uuid := auth.uid();
  v_super   boolean;
  v_code    public.activation_codes%ROWTYPE;
  v_name    text := NULLIF(btrim(regexp_replace(COALESCE(p_recipient_name, ''), '[[:cntrl:]]+', ' ', 'g')), '');
  v_mobile  text := NULLIF(regexp_replace(COALESCE(p_recipient_mobile, ''), '[^0-9]', '', 'g'), '');
  v_note    text := NULLIF(btrim(regexp_replace(COALESCE(p_note, ''), '[[:cntrl:]]+', ' ', 'g')), '');
  v_handing boolean;
  v_again   boolean;
  v_plain   text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_code FROM public.activation_codes c WHERE c.id = p_code_id FOR UPDATE;
  v_super := public.is_super_admin();
  -- An unknown code and a foreign code answer the same.
  IF NOT FOUND OR NOT (v_super OR public.is_tenant_admin(v_code.tenant_id)) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- A number typed with the country code keeps its last ten digits.
  IF v_mobile IS NOT NULL AND char_length(v_mobile) = 12 AND left(v_mobile, 2) = '91' THEN
    v_mobile := right(v_mobile, 10);
  END IF;
  IF (v_mobile IS NOT NULL AND v_mobile !~ '^[0-9]{10}$')
     OR char_length(COALESCE(v_name, '')) > 80
     OR char_length(COALESCE(v_note, '')) > 200 THEN
    RAISE EXCEPTION 'invalid_recipient' USING ERRCODE = '22023';
  END IF;
  v_handing := v_name IS NOT NULL OR v_mobile IS NOT NULL;
  IF v_note IS NOT NULL AND NOT v_handing THEN
    RAISE EXCEPTION 'invalid_recipient' USING ERRCODE = '22023',
      DETAIL = 'a note needs the name or the mobile number of the person who gets the code';
  END IF;

  IF v_code.state <> 'AVAILABLE' OR v_code.code_ciphertext IS NULL OR v_code.expires_at <= now() THEN
    RAISE EXCEPTION 'code_not_available' USING ERRCODE = 'P0001';
  END IF;

  v_again := v_code.issued_at IS NOT NULL;
  IF v_handing THEN
    UPDATE public.activation_codes
       SET issued_at = now(), issued_by = v_actor,
           issued_to_name = v_name, issued_to_mobile = v_mobile, issue_note = v_note
     WHERE id = v_code.id;
  END IF;

  -- The audit line is written before the code leaves the database.
  PERFORM activation.log(
    CASE WHEN v_handing THEN 'CODE_ISSUED' ELSE 'CODE_SHOWN' END, true,
    CASE WHEN v_handing THEN 'issued' ELSE 'shown' END,
    v_code.id, v_code.tenant_id, NULL, v_actor, v_code.batch_id, NULL, NULL,
    jsonb_strip_nulls(jsonb_build_object(
      'as', CASE WHEN v_super THEN 'super_admin' ELSE 'tenant_admin' END,
      'recipient_name', v_name,
      'recipient_mobile_last4', right(v_mobile, 4),
      'replaces_earlier_recipient', CASE WHEN v_handing AND v_again THEN true END)));

  v_plain := activation.format_code(
    extensions.pgp_sym_decrypt(v_code.code_ciphertext, activation.secret('activation_code_enc_key')));

  RETURN jsonb_build_object(
    'ok', true,
    'code_id', v_code.id,
    'code', v_plain,
    'qr_payload', 'KSA1:' || v_plain,
    'expires_at', v_code.expires_at,
    'issued', v_handing OR v_again,
    'issued_to_name', CASE WHEN v_handing THEN v_name ELSE v_code.issued_to_name END,
    'issued_to_mobile', CASE WHEN v_handing THEN v_mobile ELSE v_code.issued_to_mobile END);
END
$fn$;

REVOKE ALL ON FUNCTION public.activation_issue_code(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activation_issue_code(uuid, text, text, text) TO authenticated;

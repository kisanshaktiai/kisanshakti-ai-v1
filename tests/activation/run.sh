#!/usr/bin/env bash
# Security, isolation and concurrency tests for the farmer activation database part
# (supabase/migrations/20261124160000_farmer_activation_core.sql,
#  supabase/migrations/20261125100000_farmer_activation_licence_lock.sql,
#  supabase/migrations/20261125230000_farmer_activation_app_gate.sql and
#  supabase/migrations/20261126120000_farmer_activation_issue.sql).
#
# Needs a local PostgreSQL 15+ with pgcrypto that you can connect to as a
# superuser. It creates and drops its OWN database (acttest) and the three API
# roles; it never connects to the Supabase project.
#   PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres bash tests/activation/run.sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
MIGRATION="${MIGRATION:-$ROOT/supabase/migrations/20261124160000_farmer_activation_core.sql}"
MIGRATION2="${MIGRATION2:-$ROOT/supabase/migrations/20261125100000_farmer_activation_licence_lock.sql}"
MIGRATION3="${MIGRATION3:-$ROOT/supabase/migrations/20261125230000_farmer_activation_app_gate.sql}"
MIGRATION4="${MIGRATION4:-$ROOT/supabase/migrations/20261126120000_farmer_activation_issue.sql}"
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}"
DB=acttest; ADMIN="psql -d postgres -v ON_ERROR_STOP=1 -q -X"
$ADMIN -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" 2>/dev/null || { echo "cannot create database $DB"; exit 2; }
$ADMIN -c "DROP ROLE IF EXISTS anon" -c "DROP ROLE IF EXISTS authenticated" -c "DROP ROLE IF EXISTS service_role" 2>/dev/null
psql -d $DB -v ON_ERROR_STOP=1 -q -X -f "$HERE/replica.sql" >/dev/null 2>&1 || { echo "replica.sql failed"; exit 2; }
psql -d $DB -v ON_ERROR_STOP=1 -q -X -f "$MIGRATION" >/dev/null 2>&1 || { echo "migration failed to apply"; exit 2; }
PSQL="psql -d $DB -At -q -X"
q()   { $PSQL -c "$1" 2>&1; }                                             # owner (postgres)
# Before the licence lock: reproduce the hole it closes (rolled back).
HOLE=$($PSQL -c "BEGIN" -c "SET LOCAL ROLE authenticated" -c "SET LOCAL request.jwt.claim.sub = 'bb000000-0000-0000-0000-000000000001'" \
  -c "WITH u AS (UPDATE public.tenants SET max_farmers = 999999 WHERE id = 'b0000000-0000-0000-0000-000000000000' RETURNING max_farmers), i AS (INSERT INTO public.tenant_subscriptions(tenant_id, billing_interval, status, current_period_end) VALUES ('b0000000-0000-0000-0000-000000000000','annually','active', now() + interval '10 years') RETURNING status) SELECT (SELECT max_farmers FROM u) || ' ' || (SELECT status FROM i)" -c "ROLLBACK" 2>&1)
psql -d $DB -v ON_ERROR_STOP=1 -q -X -f "$MIGRATION2" >/dev/null 2>&1 || { echo "licence-lock migration failed to apply"; exit 2; }
psql -d $DB -v ON_ERROR_STOP=1 -q -X -f "$MIGRATION2" >/dev/null 2>&1 || { echo "licence-lock migration is not re-runnable"; exit 2; }
# Before the app gate: reproduce what it closes (rolled back). With the flag ON,
# a registered farmer who has not redeemed a code resolves as a normal farmer.
OPEN=$($PSQL -c "BEGIN" -c "UPDATE feature_flags SET is_enabled = true WHERE flag_name='farmer_activation_required'" \
  -c "WITH f AS (INSERT INTO public.farmers(tenant_id, mobile_number, activation_pending) VALUES ('d0000000-0000-0000-0000-000000000000','9700000001', true) RETURNING id) INSERT INTO public.user_sessions(user_id, access_token_hash, expires_at, active_role) SELECT id, public.hash_session_token('probe'), now() + interval '1 day', 'FARMER' FROM f" \
  -c "SET LOCAL ROLE anon" -c "SET LOCAL request.headers = '{\"x-session-token\":\"probe\"}'" \
  -c "SELECT count(*) FROM public.verified_session_context()" -c "ROLLBACK" 2>&1)
GUARD_BEFORE=$(q "SELECT md5(prosrc) FROM pg_proc WHERE oid IN ('public.verified_session_context()'::regprocedure, 'public.verified_account_context()'::regprocedure, 'activation.farmers_guard()'::regprocedure) ORDER BY proname" | tr '\n' ' ')
psql -d $DB -v ON_ERROR_STOP=1 -q -X -f "$MIGRATION3" >/dev/null 2>&1 || { echo "app-gate migration failed to apply"; exit 2; }
psql -d $DB -v ON_ERROR_STOP=1 -q -X -f "$MIGRATION3" >/dev/null 2>&1 || { echo "app-gate migration is not re-runnable"; exit 2; }
psql -d $DB -v ON_ERROR_STOP=1 -q -X -f "$MIGRATION4" >/dev/null 2>&1 || { echo "issue migration failed to apply"; exit 2; }
psql -d $DB -v ON_ERROR_STOP=1 -q -X -f "$MIGRATION4" >/dev/null 2>&1 || { echo "issue migration is not re-runnable"; exit 2; }
SUPER=50000000-0000-0000-0000-000000000001; PLAIN=50000000-0000-0000-0000-000000000002
ADM_A=aa000000-0000-0000-0000-000000000001; OWN_B=bb000000-0000-0000-0000-000000000001; VIEW_A=aa000000-0000-0000-0000-000000000009
TD=d0000000-0000-0000-0000-000000000000; TA=a0000000-0000-0000-0000-000000000000; TB=b0000000-0000-0000-0000-000000000000; TC=c0000000-0000-0000-0000-000000000000
ADM_C=cc000000-0000-0000-0000-000000000001
PLAN=f1000000-0000-0000-0000-000000000000; TPLAN=f2000000-0000-0000-0000-000000000000
PASS=0; FAIL=0

usr() { $PSQL -c "SET ROLE authenticated" -c "SET request.jwt.claim.sub = '$1'" -c "$2" 2>&1; }
svc() { $PSQL -c "SET ROLE service_role" -c "$1" 2>&1; }
anon(){ $PSQL -c "SET ROLE anon" -c "$1" 2>&1; }
ok()  { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'FAIL  %s\n      got: %s\n' "$1" "$(echo "$2" | head -3)"; }
eq()  { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (want: $3)" "$2"; fi; }       # name actual expected
has() { if echo "$2" | grep -q -- "$3"; then ok "$1"; else bad "$1 (want match: $3)" "$2"; fi; }
redeem() { svc "SELECT public.activation_redeem('$1', \$in\$$2\$in\$, '${3:-10.0.0.1}', 'test')->>'code'"; }
newfarmer() { svc "INSERT INTO public.farmers(tenant_id, mobile_number, activation_pending) VALUES ('$TD', '$1', true) RETURNING id"; }
gen() { usr $SUPER "SELECT public.activation_admin_generate_batch('$1', $2, now() + interval '${3:-30 days}', '${4:-biannual}', '$PLAN', 'test')->>'batch_id'"; }
codes() { usr "${2:-$SUPER}" "SELECT code FROM public.activation_reveal_codes('$1')"; }

echo "== A. flag OFF: nothing changes =="
eq "A1 flag exists and is disabled" "$(q "SELECT is_enabled FROM feature_flags WHERE flag_name='farmer_activation_required'")" "f"
eq "A2 existing farmers are not pending" "$(q "SELECT count(*) FILTER (WHERE activation_pending), count(*) FROM farmers")" "0|3"
LEG=$(svc "INSERT INTO public.farmers(tenant_id, mobile_number) VALUES ('$TA','9100000001') RETURNING id")
has "A3 app registration into a tenant still works (legacy path)" "$LEG" "^[0-9a-f-]\{36\}$"
eq "A4 redeem answers not enabled" "$(redeem $LEG ABCD-EFGH-JKMN)" "activation_not_enabled"
has "A5 anon cannot call redeem" "$(anon "SELECT public.activation_redeem('$LEG','x')")" "permission denied"
has "A6 a signed-in portal user cannot call redeem" "$(usr $ADM_A "SELECT public.activation_redeem('$LEG','x')")" "permission denied"
has "A7 one mobile number, one farmer across tenants" "$(svc "INSERT INTO public.farmers(tenant_id, mobile_number) VALUES ('$TB','9100000001')")" "farmers_mobile_global_unique"
has "A8 internal schema is closed to API roles" "$(svc "SELECT activation.secret('activation_code_pepper')")" "permission denied"
eq "A9 secrets were generated, 64 hex chars each" "$(q "SELECT count(*) FROM vault.secrets WHERE name LIKE 'activation_code_%' AND secret ~ '^[0-9a-f]{64}$'")" "2"

echo "== E. licence lock: who may change what a tenant bought =="
eq "E0 before the lock, a tenant owner could set own seat limit and add an active subscription (hole reproduced)" "$HOLE" "999999 active"
has "E1 tenant owner cannot raise own seat limit" "$(usr $OWN_B "UPDATE public.tenants SET max_farmers = 999999 WHERE id='$TB'")" "licence_locked"
has "E2 tenant owner cannot change own tenant status" "$(usr $OWN_B "UPDATE public.tenants SET status = 'trial' WHERE id='$TB'")" "licence_locked"
has "E3 tenant owner cannot mark own tenant as the default tenant" "$(usr $OWN_B "UPDATE public.tenants SET is_default = true WHERE id='$TB'")" "licence_locked"
eq "E4 tenant owner can still edit other tenant fields, also when the form sends the unchanged seat limit" "$(usr $OWN_B "UPDATE public.tenants SET name = 'Tenant B renamed', max_farmers = 1000 WHERE id='$TB' RETURNING name")" "Tenant B renamed"
has "E5 tenant owner cannot add a subscription row" "$(usr $OWN_B "INSERT INTO public.tenant_subscriptions(tenant_id, billing_interval, status, current_period_end) VALUES ('$TB','annually','active', now() + interval '10 years')")" "licence_locked"
has "E6 tenant owner cannot extend own subscription" "$(usr $OWN_B "UPDATE public.tenant_subscriptions SET current_period_end = now() + interval '10 years' WHERE tenant_id='$TB'")" "licence_locked"
has "E7 tenant owner cannot delete own subscription row" "$(usr $OWN_B "DELETE FROM public.tenant_subscriptions WHERE tenant_id='$TB'")" "licence_locked"
q "UPDATE tenant_subscriptions SET status='past_due' WHERE tenant_id='$TB'" >/dev/null
has "E8 tenant owner cannot switch a past-due subscription back to active" "$(usr $OWN_B "UPDATE public.tenant_subscriptions SET status = 'active' WHERE tenant_id='$TB'")" "licence_locked"
has "E9 tenant owner cannot back-date a row to make it the deciding one" "$(usr $OWN_B "UPDATE public.tenant_subscriptions SET created_at = now() + interval '1 day' WHERE tenant_id='$TB'")" "licence_locked"
eq "E10 tenant owner can still cancel, and edit renewal fields" "$(usr $OWN_B "UPDATE public.tenant_subscriptions SET status = 'canceled', auto_renew = false, cancellation_reason = 'x' WHERE tenant_id='$TB' RETURNING status")" "canceled"
eq "E11 the platform admin can still edit a subscription row directly (admin portal billing screen)" "$(usr $SUPER "UPDATE public.tenant_subscriptions SET status = 'active' WHERE tenant_id='$TB' RETURNING status")" "active"
eq "E12 the service role can still change a tenant's seat limit (edge functions)" "$(svc "UPDATE public.tenants SET max_farmers = 1000 WHERE id='$TB' RETURNING max_farmers")" "1000"
has "E13 a tenant admin cannot record an entitlement" "$(usr $ADM_C "SELECT public.activation_admin_set_entitlement('$TC', 5000, now() + interval '1 year', 'self service')")" "not_authorized"
has "E14 an admin_users 'admin' (not super admin) cannot either" "$(usr $PLAIN "SELECT public.activation_admin_set_entitlement('$TC', 5000, now() + interval '1 year', 'x')")" "not_authorized"
has "E15 anon cannot call it" "$(anon "SELECT public.activation_admin_set_entitlement('$TC', 5000, now() + interval '1 year', 'x')")" "permission denied"
has "E16 a tenant with no subscription row cannot be issued codes" "$(usr $SUPER "SELECT public.activation_admin_generate_batch('$TC', 5, now() + interval '30 days', 'biannual', '$PLAN')")" "subscription_inactive"
has "E17 an entitlement needs a reason" "$(usr $SUPER "SELECT public.activation_admin_set_entitlement('$TC', 10, now() + interval '1 year', '  ')")" "reason_required"
has "E18 a validity date in the past is refused" "$(usr $SUPER "SELECT public.activation_admin_set_entitlement('$TC', 10, now() - interval '1 day', 'x')")" "invalid_valid_until"
eq "E19 super admin records 10 licences for one year: seat limit and an active subscription row are written" "$(usr $SUPER "SELECT public.activation_admin_set_entitlement('$TC', 10, now() + interval '1 year', 'order 10 licences')->>'licences'") $(q "SELECT t.max_farmers, s.status, s.current_period_end::date = (now() + interval '1 year')::date, s.auto_renew FROM tenants t JOIN tenant_subscriptions s ON s.tenant_id=t.id WHERE t.id='$TC'")" "10 10|active|t|f"
eq "E20 the audit trail holds who, why, before and after" "$(q "SELECT actor_id='$SUPER', metadata->>'reason', metadata->>'licences_before', metadata->>'licences_after' FROM activation_logs WHERE event='ENTITLEMENT_SET' AND tenant_id='$TC'")" "t|order 10 licences|1000|10"
has "E21 11 codes for 10 licences are refused" "$(usr $SUPER "SELECT public.activation_admin_generate_batch('$TC', 11, now() + interval '30 days', 'biannual', '$PLAN')")" "exceeds_licences"
BC=$(gen $TC 10)
has "E22 10 codes for 10 licences are issued" "$BC" "^[0-9a-f-]\{36\}$"
has "E23 one more code is refused while the 10 are unused" "$(usr $SUPER "SELECT public.activation_admin_generate_batch('$TC', 1, now() + interval '30 days', 'biannual', '$PLAN')")" "exceeds_licences"
eq "E24 usage: super admin sees 0 left to issue; the tenant admin is not shown that figure" "$(usr $SUPER "SELECT u->>'can_still_issue' FROM public.activation_usage('$TC') u") $(usr $ADM_C "SELECT u ? 'can_still_issue', u->>'seat_limit', u->>'seats_remaining' FROM public.activation_usage('$TC') u")" "0 f|10|10"
usr $SUPER "SELECT public.activation_admin_revoke('$BC', NULL, 'test: free the licences')" >/dev/null
eq "E25 revoked codes give their licences back for issuing" "$(usr $SUPER "SELECT u->>'can_still_issue' FROM public.activation_usage('$TC') u")" "10"
ATG=$(q "SELECT (clock_timestamp() + interval '2 seconds')::text"); : > /tmp/e26.out
for i in 1 2 3 4 5 6; do ( $PSQL -c "SET ROLE authenticated" -c "SET request.jwt.claim.sub = '$SUPER'" -c "SELECT pg_sleep(GREATEST(0, extract(epoch FROM ('$ATG'::timestamptz - clock_timestamp()))))" -c "SELECT public.activation_admin_generate_batch('$TC', 3, now() + interval '30 days', 'biannual', '$PLAN')->>'code_count'" 2>&1 | grep -o '^3$\|exceeds_licences' >> /tmp/e26.out ) & done; wait
eq "E26 6 batches of 3 at the same instant for 10 licences: exactly 3 go through (9 codes)" "$(sort /tmp/e26.out | uniq -c | awk '{printf "%s=%s ", $2, $1}') $(q "SELECT count(*) FROM activation_codes WHERE tenant_id='$TC' AND state='GENERATED'")" "3=3 exceeds_licences=3  9"
has "E27 licences cannot be set below the farmers already active" "$(usr $SUPER "SELECT public.activation_admin_set_entitlement('$TA', 0, now() + interval '1 year', 'x')")" "licences_below_used"

echo "== G. generating, releasing, revealing (SaaS admin vs tenant) =="
has "G1 tenant admin cannot generate" "$(usr $ADM_A "SELECT public.activation_admin_generate_batch('$TA', 5, now()+interval '5 days','biannual','$PLAN')")" "not_authorized"
has "G2 admin_users role 'admin' (not super) cannot generate" "$(usr $PLAIN "SELECT public.activation_admin_generate_batch('$TA', 5, now()+interval '5 days','biannual','$PLAN')")" "not_authorized"
has "G3 anon cannot generate" "$(anon "SELECT public.activation_admin_generate_batch('$TA', 5, now()+interval '5 days','biannual','$PLAN')")" "permission denied"
has "G4 a tenant plan is refused as farmer plan" "$(usr $SUPER "SELECT public.activation_admin_generate_batch('$TA', 5, now()+interval '5 days','biannual','$TPLAN')")" "invalid_farmer_plan"
has "G5 interval outside biannual/annually refused" "$(usr $SUPER "SELECT public.activation_admin_generate_batch('$TA', 5, now()+interval '5 days','monthly','$PLAN')")" "invalid_interval"
eq "G6 count 0 and 2001 refused" "$( { usr $SUPER "SELECT public.activation_admin_generate_batch('$TA', 0, now()+interval '5 days','biannual','$PLAN')"; usr $SUPER "SELECT public.activation_admin_generate_batch('$TA', 2001, now()+interval '5 days','biannual','$PLAN')"; } | grep -c 'ERROR:  invalid_count')" "2"
BA=$(gen $TA 60)
has "G7 super admin generates a batch of 60" "$BA" "^[0-9a-f-]\{36\}$"
eq "G8 stored: no plain code, 32-byte hash, encrypted copy, state GENERATED" "$(q "SELECT count(*), count(code), count(*) FILTER (WHERE octet_length(code_hash)=32), count(code_ciphertext), count(*) FILTER (WHERE state='GENERATED' AND status='active' AND NOT is_active) FROM activation_codes WHERE batch_id='$BA'")" "60|0|60|60|60"
eq "G9 tenant admin sees no unreleased code or batch" "$(usr $ADM_A "SELECT (SELECT count(*) FROM public.activation_codes), (SELECT count(*) FROM public.activation_code_batches)")" "0|0"
eq "G10 tenant admin reveal before release returns nothing" "$(codes $BA $ADM_A | wc -l | tr -d ' ')" "0"
eq "G11 release makes all 60 AVAILABLE" "$(usr $SUPER "SELECT public.activation_admin_release_batch('$BA')->>'released'")" "60"
has "G12 tenant admin cannot release" "$(usr $ADM_A "SELECT public.activation_admin_release_batch('$BA')")" "not_authorized"
eq "G13 tenant A admin sees own 60; tenant B owner and tenant A viewer see 0" "$(usr $ADM_A "SELECT count(*) FROM public.activation_codes") $(usr $OWN_B "SELECT count(*) FROM public.activation_codes") $(usr $VIEW_A "SELECT count(*) FROM public.activation_codes")" "60 0 0"
has "G14 portal user cannot read the hash column" "$(usr $ADM_A "SELECT code_hash FROM public.activation_codes LIMIT 1")" "permission denied"
has "G15 portal user cannot read the encrypted copy" "$(usr $SUPER "SELECT code_ciphertext FROM public.activation_codes LIMIT 1")" "permission denied"
has "G16 portal user cannot write codes directly" "$(usr $SUPER "UPDATE public.activation_codes SET state='REVOKED'")" "permission denied"
mapfile -t CA < <(codes $BA $ADM_A)
eq "G17 tenant A admin reveals 60 codes, all well-formed, all different" "${#CA[@]} $(printf '%s\n' "${CA[@]}" | grep -c '^[0-9A-HJKMNP-TV-Z]\{4\}-[0-9A-HJKMNP-TV-Z]\{4\}-[0-9A-HJKMNP-TV-Z]\{4\}$') $(printf '%s\n' "${CA[@]}" | sort -u | wc -l | tr -d ' ')" "60 60 60"
has "G18 tenant B owner cannot reveal tenant A's batch" "$(codes $BA $OWN_B)" "not_authorized"
has "G19 unknown batch answers like a foreign batch" "$(codes 00000000-0000-0000-0000-000000000000 $ADM_A)" "not_authorized"
has "G20 tenant B owner cannot read tenant A usage" "$(usr $OWN_B "SELECT public.activation_usage('$TA')")" "not_authorized"
eq "G21 tenant A usage: 60 available, seats 1 used of 1000" "$(usr $ADM_A "SELECT u->'codes'->>'available', u->>'seats_used', u->>'seat_limit', u->'codes' ? 'generated' FROM public.activation_usage('$TA') u")" "60|1|1000|f"
N0=$(echo "${CA[0]}" | tr -d '-')
eq "G22 the plain code is in no column of codes or logs" "$(q "SELECT (SELECT count(*) FROM activation_codes c WHERE to_jsonb(c)::text ILIKE '%$N0%') + (SELECT count(*) FROM activation_logs l WHERE to_jsonb(l)::text ILIKE '%$N0%')")" "0"
eq "G23 each reveal is in the audit trail with its actor" "$(q "SELECT count(*) FROM activation_logs WHERE event='CODES_REVEALED' AND actor_id='$ADM_A' AND batch_id='$BA'")" "2"

echo "== B. flag ON =="
q "UPDATE feature_flags SET is_enabled = true WHERE flag_name='farmer_activation_required'" >/dev/null
has "B1 app registration straight into a tenant is refused" "$(svc "INSERT INTO public.farmers(tenant_id, mobile_number) VALUES ('$TA','9100000002')")" "activation_required"
has "B2 a pending farmer cannot be created outside the default tenant" "$(svc "INSERT INTO public.farmers(tenant_id, mobile_number, activation_pending) VALUES ('$TA','9100000003', true)")" "activation_required"
has "B3 a farmer cannot be inserted already 'activated'" "$(svc "INSERT INTO public.farmers(tenant_id, mobile_number, activation_pending, activated_at) VALUES ('$TD','9100000004', true, now())")" "farmer_activation_locked"
declare -a P; for i in $(seq 1 12); do P[$i]=$(newfarmer "80000000$(printf '%02d' $i)"); done
has "B4 registration lands pending in the default tenant" "${P[1]}" "^[0-9a-f-]\{36\}$"
eq "B5 pending farmers take no seat in the default tenant" "$(q "SELECT count(*) FROM farmers WHERE tenant_id='$TD' AND NOT activation_pending")" "3"
svc "INSERT INTO public.user_profiles(id, farmer_id, tenant_id, mobile_number) VALUES ('${P[1]}','${P[1]}','$TD','8000000001'); INSERT INTO public.lands(farmer_id, tenant_id, name) VALUES ('${P[1]}','$TD','plot'); INSERT INTO public.account_reach_history(account_id, tenant_id, note) VALUES ('${P[1]}','$TD','h'); INSERT INTO public.farmer_subscriptions(farmer_id, tenant_id, plan_id, billing_interval, status) VALUES ('${P[1]}','$TD','$TPLAN','monthly','trial')" >/dev/null
eq "B6 valid code activates the farmer" "$(redeem ${P[1]} "${CA[0]}")" "activated"
eq "B7 farmer, account, role, profile, land and plan all moved to the code's tenant" "$(q "SELECT (SELECT tenant_id='$TA' AND NOT activation_pending AND activated_at IS NOT NULL AND activation_code_id IS NOT NULL FROM farmers WHERE id='${P[1]}'), (SELECT tenant_id='$TA' FROM accounts WHERE id='${P[1]}'), (SELECT tenant_id='$TA' FROM account_roles WHERE account_id='${P[1]}'), (SELECT tenant_id='$TA' FROM user_profiles WHERE farmer_id='${P[1]}'), (SELECT tenant_id='$TA' FROM lands WHERE farmer_id='${P[1]}'), (SELECT tenant_id='$TA' AND plan_id='$PLAN' AND status='active' AND billing_interval='biannual' AND paid_by_tenant AND end_date::date = (now() + interval '6 months')::date FROM farmer_subscriptions WHERE farmer_id='${P[1]}')")" "t|t|t|t|t|t"
eq "B7b an append-only table does not break activation; it is skipped and named in the audit entry" "$(q "SELECT metadata->'not_moved' FROM activation_logs WHERE farmer_id='${P[1]}' AND event='REDEEM_SUCCESS'") $(q "SELECT tenant_id='$TD' FROM account_reach_history WHERE account_id='${P[1]}'")" '["account_reach_history"] t'
eq "B8 code is ACTIVATED, bound to the farmer, encrypted copy wiped" "$(q "SELECT state, status, redeemed_by='${P[1]}', code_ciphertext IS NULL FROM activation_codes WHERE id=(SELECT activation_code_id FROM farmers WHERE id='${P[1]}')")" "ACTIVATED|used|t|t"
eq "B9 the same code for another farmer: already used" "$(redeem ${P[2]} "${CA[0]}")" "activation_used"
eq "B10 an activated farmer cannot redeem a second code" "$(redeem ${P[1]} "${CA[1]}")" "already_activated"
eq "B11 that second code was not consumed" "$(q "SELECT count(*) FROM activation_codes WHERE batch_id='$BA' AND state='ACTIVATED'")" "1"
LOW="ksa1: $(echo "${CA[1]}" | tr 'A-Z' 'a-z' | tr '-' ' ')"
eq "B12 QR payload / lower case / spaces are accepted; a new plan row is created" "$(redeem ${P[2]} "$LOW") $(q "SELECT count(*) FROM farmer_subscriptions WHERE farmer_id='${P[2]}' AND tenant_id='$TA' AND status='active'")" "activated 1"
eq "B13 unknown but well-formed code" "$(redeem ${P[3]} ZZZZ-ZZZZ-ZZZZ)" "activation_invalid"
eq "B14 malformed input" "$(redeem ${P[3]} "'; DROP TABLE farmers;--")" "activation_invalid"
has "B15 revoke needs a reason" "$(usr $SUPER "SELECT public.activation_admin_revoke(NULL, ARRAY[(SELECT id FROM public.activation_codes WHERE state='AVAILABLE' LIMIT 1)], '')")" "reason_required"
has "B16 tenant admin cannot revoke" "$(usr $ADM_A "SELECT public.activation_admin_revoke('$BA', NULL, 'x')")" "not_authorized"
RID=$(q "SELECT id FROM activation_codes WHERE batch_id='$BA' AND state='AVAILABLE' ORDER BY created_at, id OFFSET 0 LIMIT 1")
RIDX=$(usr $SUPER "SELECT code FROM public.activation_reveal_codes('$BA') WHERE code_id='$RID'")
UID1=$(q "SELECT id FROM activation_codes WHERE state='ACTIVATED' LIMIT 1")
eq "B17 revoking one unused + one used code revokes only the unused one" "$(usr $SUPER "SELECT public.activation_admin_revoke(NULL, ARRAY['$RID','$UID1']::uuid[], 'lost sheet')->>'revoked'")" "1"
eq "B18 revoked code is refused" "$(redeem ${P[3]} "$RIDX")" "activation_revoked"
BG=$(gen $TA 3); mapfile -t CG < <(codes $BG)
eq "B19 a generated-but-not-released code is refused as invalid" "$(redeem ${P[3]} "${CG[0]}")" "activation_invalid"
BE=$(gen $TA 3 "2 seconds"); usr $SUPER "SELECT public.activation_admin_release_batch('$BE')" >/dev/null; mapfile -t CE < <(codes $BE); sleep 3
eq "B20 expired code is refused and marked EXPIRED with no copy left" "$(redeem ${P[3]} "${CE[0]}") $(q "SELECT count(*) FROM activation_codes WHERE batch_id='$BE' AND state='EXPIRED' AND code_ciphertext IS NULL")" "activation_expired 1"
eq "B21 expiry job marks the other 2 overdue codes" "$(svc "SELECT public.activation_expire_due()") $(q "SELECT count(*) FROM activation_codes WHERE batch_id='$BE' AND state='EXPIRED'")" "2 3"
# P3 now has 5 counted failures (B13, B14, B18, B19, B20)
mapfile -t CA < <(codes $BA $ADM_A)
eq "B22 after 5 wrong codes even a valid code is rate limited" "$(redeem ${P[3]} "${CA[0]}")" "rate_limited"
has "B23 the answer carries a wait time" "$(svc "SELECT public.activation_redeem('${P[3]}', '${CA[0]}', '10.0.0.1', 't')->>'retry_after_seconds'")" "^[0-9]\+$"
eq "B24 the valid code was not consumed by the blocked attempt, another farmer can use it" "$(redeem ${P[4]} "${CA[0]}")" "activated"
mapfile -t CA < <(codes $BA $ADM_A)
BB=$(gen $TB 40); usr $SUPER "SELECT public.activation_admin_release_batch('$BB')" >/dev/null; mapfile -t CB < <(codes $BB $OWN_B)
q "UPDATE tenant_subscriptions SET status='past_due' WHERE tenant_id='$TB'" >/dev/null
eq "B25 tenant subscription past_due blocks activation" "$(redeem ${P[5]} "${CB[0]}")" "activation_subscription_inactive"
q "UPDATE tenant_subscriptions SET status='active', current_period_end = now() - interval '1 day' WHERE tenant_id='$TB'" >/dev/null
eq "B26 subscription period over blocks activation" "$(redeem ${P[5]} "${CB[0]}")" "activation_subscription_inactive"
q "UPDATE tenant_subscriptions SET tenant_id = NULL WHERE tenant_id='$TB'" >/dev/null
eq "B27 no subscription row at all blocks activation (fail closed)" "$(redeem ${P[5]} "${CB[0]}")" "activation_subscription_inactive"
q "UPDATE tenant_subscriptions SET tenant_id='$TB', current_period_end = now() + interval '90 days' WHERE tenant_id IS NULL; UPDATE tenants SET status='suspended' WHERE id='$TB'" >/dev/null
eq "B28 suspended tenant blocks activation" "$(redeem ${P[5]} "${CB[0]}")" "activation_tenant_inactive"
q "UPDATE tenants SET status='active', max_farmers = 0 WHERE id='$TB'" >/dev/null
eq "B29 seats exhausted blocks activation although 40 unused codes exist" "$(redeem ${P[5]} "${CB[0]}") $(q "SELECT count(*) FROM activation_codes WHERE batch_id='$BB' AND state='AVAILABLE'")" "activation_capacity_full 40"
eq "B30 none of those blocks counted against the farmer's rate limit" "$(q "SELECT count(*) FROM activation_logs WHERE farmer_id='${P[5]}' AND event='REDEEM_FAILED'")" "0"
q "UPDATE tenants SET max_farmers = 1000 WHERE id='$TB'" >/dev/null

echo "== L. locks: tenant, activation fields, audit, state machine =="
has "L1 service role cannot move an activated farmer to another tenant" "$(svc "UPDATE public.farmers SET tenant_id='$TB' WHERE id='${P[1]}'")" "farmer_tenant_locked"
has "L2 database owner cannot either" "$(q "UPDATE farmers SET tenant_id='$TB' WHERE id='${P[1]}'")" "farmer_tenant_locked"
has "L3 a pending farmer cannot be moved without a code" "$(svc "UPDATE public.farmers SET tenant_id='$TA' WHERE id='${P[6]}'")" "farmer_tenant_locked"
has "L4 a pending farmer cannot be flipped to active" "$(svc "UPDATE public.farmers SET activation_pending=false WHERE id='${P[6]}'")" "farmer_activation_locked"
has "L5 ... not even pointing at somebody else's used code" "$(svc "UPDATE public.farmers SET activation_pending=false, activated_at=now(), tenant_id='$TA', activation_code_id='$UID1' WHERE id='${P[6]}'")" "farmer_activation_locked"
has "L6 an active farmer cannot be set back to pending" "$(svc "UPDATE public.farmers SET activation_pending=true WHERE id='${P[1]}'")" "farmer_activation_locked"
has "L7 tenant admin cannot move own farmer to another tenant" "$(usr $ADM_A "UPDATE public.farmers SET tenant_id='$TB' WHERE id='${P[1]}'")" "farmer_tenant_locked\|row-level security"
eq "L8 ordinary farmer updates still work" "$(svc "UPDATE public.farmers SET metadata='{\"k\":1}' WHERE id='${P[1]}' RETURNING metadata->>'k'")" "1"
has "L9 audit rows cannot be updated (service role)" "$(svc "UPDATE public.activation_logs SET success = true")" "not allowed"
has "L10 audit rows cannot be deleted (service role)" "$(svc "DELETE FROM public.activation_logs")" "not allowed"
has "L11 audit table cannot be truncated (owner)" "$(q "TRUNCATE activation_logs")" "not allowed"
has "L12 portal users cannot insert audit rows" "$(usr $SUPER "INSERT INTO public.activation_logs(event) VALUES ('X')")" "permission denied"
has "L13 codes cannot be deleted" "$(svc "DELETE FROM public.activation_codes")" "not allowed"
has "L14 a used code cannot be made available again" "$(svc "UPDATE public.activation_codes SET state='AVAILABLE' WHERE id='$UID1'")" "cannot change"
has "L15 a revoked code cannot be revived" "$(q "UPDATE activation_codes SET state='AVAILABLE' WHERE id='$RID'")" "cannot change"
has "L16 an available code cannot be re-pointed to another tenant" "$(svc "UPDATE public.activation_codes SET tenant_id='$TB' WHERE state='AVAILABLE' AND tenant_id='$TA'")" "identity columns"
has "L17 an available code cannot be marked used without a farmer" "$(svc "UPDATE public.activation_codes SET state='ACTIVATED' WHERE id=(SELECT id FROM public.activation_codes WHERE state='AVAILABLE' LIMIT 1)")" "needs its farmer"
has "L18 a code row cannot be inserted by hand" "$(svc "INSERT INTO public.activation_codes(tenant_id, code, state) VALUES ('$TA','HANDMADE0001','AVAILABLE')")" "created only by"
has "L19 batch terms cannot be edited" "$(svc "UPDATE public.activation_code_batches SET expires_at = now() + interval '10 years'")" "cannot change"
has "L20 tenant with activation history cannot be hard-deleted" "$(q "DELETE FROM tenants WHERE id='$TA'")" "not allowed\|violates foreign key"

echo "== T. tenant portal 'create farmer' counts against seats =="
has "T1 tenant admin creates a farmer in own tenant while a seat is free" "$(usr $ADM_A "INSERT INTO public.farmers(tenant_id, mobile_number) VALUES ('$TA','9200000001') RETURNING tenant_id")" "$TA"
has "T2 tenant admin cannot create a farmer in another tenant" "$(usr $ADM_A "INSERT INTO public.farmers(tenant_id, mobile_number) VALUES ('$TB','9200000002')")" "row-level security"
q "UPDATE tenants SET max_farmers = (SELECT count(*) FROM farmers WHERE tenant_id='$TA' AND NOT activation_pending) WHERE id='$TA'" >/dev/null
has "T3 at the seat limit the portal insert is refused" "$(usr $ADM_A "INSERT INTO public.farmers(tenant_id, mobile_number) VALUES ('$TA','9200000003')")" "activation_capacity_full"
eq "T4 at the seat limit a valid code is refused too" "$(redeem ${P[6]} "${CA[0]}")" "activation_capacity_full"
q "UPDATE tenants SET max_farmers = 1000 WHERE id='$TA'; UPDATE tenant_subscriptions SET status='canceled' WHERE tenant_id='$TA'" >/dev/null
has "T5 without an active subscription the portal insert is refused" "$(usr $ADM_A "INSERT INTO public.farmers(tenant_id, mobile_number) VALUES ('$TA','9200000004')")" "activation_subscription_inactive"
q "UPDATE tenant_subscriptions SET status='active' WHERE tenant_id='$TA'" >/dev/null
eq "T6 deleting a farmer keeps the used code final (FK clears the link, audit keeps the id)" "$(q "DELETE FROM account_roles WHERE account_id='${P[2]}'; DELETE FROM farmers WHERE id='${P[2]}'" >/dev/null; q "SELECT count(*) FROM activation_codes WHERE state='ACTIVATED' AND redeemed_by IS NULL"; q "SELECT count(*) FROM activation_logs WHERE farmer_id='${P[2]}' AND event='REDEEM_SUCCESS'")" "1
1"

echo "== S. app gate: an unactivated farmer is nobody to the database =="
# session <farmer id> <token> [role]  → a live session row, as the auth edge function writes it
session() { q "INSERT INTO public.user_sessions(user_id, access_token_hash, expires_at, active_role) VALUES ('$1', public.hash_session_token('$2'), now() + interval '7 days', '${3:-FARMER}')" >/dev/null; }
# app <token> <sql>  → the farmer app: public anon key + x-session-token header
app() { $PSQL -c "SET ROLE anon" -c "SET request.headers = '{\"x-session-token\":\"$1\"}'" -c "$2" 2>&1; }
eq "S0 before the gate, an unactivated farmer resolved as a normal farmer (reproduced)" "$OPEN" "1"
eq "S1 the three audited function bodies were the live ones (md5) before the gate" "$GUARD_BEFORE" "feb83c68681f8444c3a6791982cb1503 f3c467c88a67b5e93c956c40266c7385 b552df0538c73e0e9ee20a24d93d7927 "
SR=$(svc "INSERT INTO public.farmers(tenant_id, mobile_number) VALUES ('$TD','9600000001') RETURNING id")
eq "S2 app self-registration into the default tenant is born unactivated without asking for it" "$(q "SELECT activation_pending, tenant_id FROM farmers WHERE id='$SR'")" "t|$TD"
eq "S3 it takes no seat" "$(q "SELECT count(*) FROM farmers WHERE tenant_id='$TD' AND NOT activation_pending")" "3"
has "S4 app self-registration into any other tenant is still refused" "$(svc "INSERT INTO public.farmers(tenant_id, mobile_number) VALUES ('$TA','9600000002')")" "activation_required"
eq "S5 a farmer created by a tenant admin in the portal is still born active" "$(q "SELECT activation_pending FROM farmers WHERE mobile_number='9200000001'")" "f"
session $SR tok-pending
eq "S6 unactivated farmer with a live session: farmer context is empty" "$(app tok-pending "SELECT count(*) FROM public.verified_session_context()")" "0"
eq "S7 ... current farmer and tenant are NULL" "$(app tok-pending "SELECT public.get_current_farmer_id() IS NULL, public.get_current_tenant_id() IS NULL")" "t|t"
eq "S8 ... account context in the FARMER role is empty" "$(app tok-pending "SELECT count(*) FROM public.verified_account_context()")" "0"
svc "INSERT INTO public.lands(farmer_id, tenant_id, name) VALUES ('$SR','$TD','registered plot')" >/dev/null
eq "S9 ... reads none of its own rows through RLS" "$(app tok-pending "SELECT count(*) FROM public.lands")" "0"
has "S10 ... cannot write a row through RLS" "$(app tok-pending "INSERT INTO public.lands(farmer_id, tenant_id, name) VALUES ('$SR','$TD','x')")" "row-level security"
has "S11 ... cannot clear its own pending mark" "$(app tok-pending "UPDATE public.farmers SET activation_pending = false WHERE id='$SR'")" "farmer_activation_locked\|permission denied\|row-level security"
has "S12 ... the app role cannot call redeem itself" "$(app tok-pending "SELECT public.activation_redeem('$SR','ABCD-EFGH-JKMN')")" "permission denied"
LEGACY=$(q "SELECT id FROM farmers WHERE mobile_number='9000000001'"); session $LEGACY tok-legacy
eq "S13 a farmer from before the feature is untouched: context resolves" "$(app tok-legacy "SELECT farmer_id, tenant_id FROM public.verified_session_context()")" "$LEGACY|$TD"
# the same person also holds the Service Provider role, with a session in that role
q "INSERT INTO public.account_roles(account_id, tenant_id, role, source) VALUES ('$SR','$TD','SERVICE_PROVIDER','SELF_ADDED')" >/dev/null
session $SR tok-provider SERVICE_PROVIDER
eq "S14 activation is for farmers only: the same unactivated person in the Service Provider role resolves" "$(app tok-provider "SELECT account_id, active_role FROM public.verified_account_context()")" "$SR|SERVICE_PROVIDER"
eq "S15 ... and that provider session is still no farmer session" "$(app tok-provider "SELECT count(*) FROM public.verified_session_context()")" "0"
BS=$(gen $TA 2); usr $SUPER "SELECT public.activation_admin_release_batch('$BS')" >/dev/null; mapfile -t CS < <(codes $BS $ADM_A)
eq "S16 a wrong code changes nothing: still nobody" "$(redeem $SR ZZZZ-ZZZZ-ZZZZ) $(app tok-pending "SELECT count(*) FROM public.verified_session_context()")" "activation_invalid 0"
eq "S17 the code is redeemed" "$(redeem $SR "${CS[0]}")" "activated"
eq "S18 the SAME session now resolves, in the tenant of the code" "$(app tok-pending "SELECT farmer_id, tenant_id FROM public.verified_session_context()")" "$SR|$TA"
eq "S19 ... account context in the FARMER role resolves too" "$(app tok-pending "SELECT account_id, tenant_id, active_role FROM public.verified_account_context()")" "$SR|$TA|FARMER"
eq "S20 ... reads its own row, which moved with it" "$(app tok-pending "SELECT name, tenant_id FROM public.lands")" "registered plot|$TA"
has "S21 ... writes in its new tenant" "$(app tok-pending "INSERT INTO public.lands(farmer_id, tenant_id, name) VALUES ('$SR','$TA','new plot') RETURNING name")" "new plot"
has "S22 ... cannot write into the tenant it left" "$(app tok-pending "INSERT INTO public.lands(farmer_id, tenant_id, name) VALUES ('$SR','$TD','old tenant')")" "row-level security"
eq "S23 a forged or missing token is nobody" "$(app no-such-token "SELECT count(*) FROM public.verified_session_context()") $($PSQL -c "SET ROLE anon" -c "SELECT count(*) FROM public.verified_session_context()" 2>&1)" "0 0"
SW=$(svc "INSERT INTO public.farmers(tenant_id, mobile_number) VALUES ('$TD','9600000003') RETURNING id"); session $SW tok-wait

echo "== C. concurrency =="
par() { # par <label-file> ; reads "farmer code" lines from stdin, fires all at the same instant
  local at; at=$(q "SELECT (clock_timestamp() + interval '2 seconds')::text"); local out=$1; : > "$out"
  while read -r f c; do
    ( $PSQL -c "SET ROLE service_role" -c "SELECT pg_sleep(GREATEST(0, extract(epoch FROM ('$at'::timestamptz - clock_timestamp()))))" \
            -c "SELECT public.activation_redeem('$f', '$c', '10.0.0.9', 'race')->>'code'" 2>&1 | grep -v '^$' >> "$out" ) &
  done; wait
}
declare -a R; for i in $(seq 1 60); do R[$i]=$(newfarmer "70000000$(printf '%02d' $i)"); done
mapfile -t CA < <(codes $BA $ADM_A)
for i in $(seq 1 25); do echo "${R[$i]} ${CA[0]}"; done | par /tmp/c1.out
eq "C1 25 farmers, 1 code, same instant: exactly 1 wins, 24 get 'used'" "$(sort /tmp/c1.out | uniq -c | awk '{printf "%s=%s ", $2, $1}')" "activated=1 activation_used=24 "
eq "C1b exactly one farmer carries that code" "$(q "SELECT count(*) FROM farmers WHERE activation_code_id = (SELECT id FROM activation_codes WHERE code_hint='$(echo "${CA[0]}" | tr -d '-' | tail -c 5)' AND batch_id='$BA' AND state='ACTIVATED')")" "1"

USED_B=$(q "SELECT count(*) FROM farmers WHERE tenant_id='$TB' AND NOT activation_pending")
q "UPDATE tenants SET max_farmers = $USED_B + 3 WHERE id='$TB'" >/dev/null
for i in $(seq 26 45); do echo "${R[$i]} ${CB[$((i-26))]}"; done | par /tmp/c2.out
eq "C2 20 farmers, 20 different valid codes, 3 seats left: exactly 3 win" "$(sort /tmp/c2.out | uniq -c | awk '{printf "%s=%s ", $2, $1}')" "activated=3 activation_capacity_full=17 "
eq "C2b tenant B holds exactly its limit; 17 codes stay unused" "$(q "SELECT (SELECT count(*) FROM farmers WHERE tenant_id='$TB' AND NOT activation_pending) = (SELECT max_farmers FROM tenants WHERE id='$TB'), (SELECT count(*) FROM activation_codes WHERE batch_id='$BB' AND state='AVAILABLE')")" "t|37"

mapfile -t CA < <(codes $BA $ADM_A); mapfile -t CB < <(codes $BB $OWN_B)
q "UPDATE tenants SET max_farmers = 1000 WHERE id='$TB'" >/dev/null
{ echo "${R[50]} ${CA[0]}"; echo "${R[50]} ${CB[0]}"; echo "${R[50]} ${CA[1]}"; echo "${R[50]} ${CB[1]}"; } | par /tmp/c3.out
eq "C3 one farmer, 4 valid codes of 2 tenants, same instant: 1 tenant, 1 code" "$(sort /tmp/c3.out | uniq -c | awk '{printf "%s=%s ", $2, $1}') $(q "SELECT count(*) FROM activation_codes WHERE redeemed_by='${R[50]}'")" "activated=1 already_activated=3  1"

USED_A=$(q "SELECT count(*) FROM farmers WHERE tenant_id='$TA' AND NOT activation_pending")
q "UPDATE tenants SET max_farmers = $USED_A + 2 WHERE id='$TA'" >/dev/null
mapfile -t CA < <(codes $BA $ADM_A); AT=$(q "SELECT (clock_timestamp() + interval '2 seconds')::text"); : > /tmp/c4.out
for i in $(seq 1 8); do
  ( $PSQL -c "SET ROLE service_role" -c "SELECT pg_sleep(GREATEST(0, extract(epoch FROM ('$AT'::timestamptz - clock_timestamp()))))" -c "SELECT public.activation_redeem('${R[$((50+i))]}', '${CA[$i]}')->>'code'" 2>&1 | grep -v '^$' >> /tmp/c4.out ) &
  ( $PSQL -c "SET ROLE authenticated" -c "SET request.jwt.claim.sub = '$ADM_A'" -c "SELECT pg_sleep(GREATEST(0, extract(epoch FROM ('$AT'::timestamptz - clock_timestamp()))))" -c "INSERT INTO public.farmers(tenant_id, mobile_number) VALUES ('$TA','93000000$(printf '%02d' $i)') RETURNING 'portal_created'" 2>&1 | grep -o 'portal_created\|activation_capacity_full' >> /tmp/c4.out ) &
done; wait
eq "C4 8 redemptions + 8 portal inserts racing for 2 seats: exactly 2 succeed in total" "$(grep -c 'activated\|portal_created' /tmp/c4.out) $(q "SELECT (SELECT count(*) FROM farmers WHERE tenant_id='$TA' AND NOT activation_pending) = (SELECT max_farmers FROM tenants WHERE id='$TA')")" "2 t"
q "UPDATE tenants SET max_farmers = 1000 WHERE id='$TA'" >/dev/null

echo "== H. handing a code to a farmer =="
issue() { usr "$1" "SELECT public.activation_issue_code('$2'${3:+, $3})"; }       # actor, code id, [name, mobile, note as SQL]
BH=$(gen $TA 4); usr $SUPER "SELECT public.activation_admin_release_batch('$BH')" >/dev/null
mapfile -t HID < <(q "SELECT id FROM activation_codes WHERE batch_id='$BH' ORDER BY created_at, id")
mapfile -t HCODE < <(codes $BH $ADM_A)
LOGS0=$(q "SELECT count(*) FROM activation_logs WHERE batch_id='$BH' AND event IN ('CODE_ISSUED','CODE_SHOWN')")
SHOWN=$(issue $ADM_A "${HID[0]}")
eq "H1 a tenant admin is shown one code of the own tenant, with its QR text" "$(echo "$SHOWN" | jq -r '[.ok, .code, .qr_payload, .issued] | @tsv')" "$(printf 'true\t%s\tKSA1:%s\tfalse' "${HCODE[0]}" "${HCODE[0]}")"
eq "H2 only showing it leaves the code in stock, and is audited with the actor" "$(q "SELECT (SELECT issued_at IS NULL FROM activation_codes WHERE id='${HID[0]}'), (SELECT event||'/'||actor_id FROM activation_logs WHERE activation_code_id='${HID[0]}' ORDER BY created_at DESC LIMIT 1)")" "t|CODE_SHOWN/$ADM_A"
GIVEN=$(issue $ADM_A "${HID[1]}" "'  Sample   Farmer ', '+91 98765-43210', 'Kharif camp'")
eq "H3 handing it out returns the code and records the recipient, cleaned" "$(echo "$GIVEN" | jq -r '[.code, .issued, .issued_to_name, .issued_to_mobile] | @tsv')" "$(printf '%s\ttrue\tSample   Farmer\t9876543210' "${HCODE[1]}")"
eq "H4 the code row carries who, by whom and the note; it is still unused" "$(q "SELECT state, issued_by, issued_to_mobile, issue_note, issued_at IS NOT NULL FROM activation_codes WHERE id='${HID[1]}'")" "AVAILABLE|$ADM_A|9876543210|Kharif camp|t"
eq "H5 the audit line names the recipient but keeps only the last 4 digits of the number" "$(q "SELECT event, metadata->>'recipient_name', metadata->>'recipient_mobile_last4', metadata ? 'recipient_mobile' FROM activation_logs WHERE activation_code_id='${HID[1]}' ORDER BY created_at DESC LIMIT 1")" "CODE_ISSUED|Sample   Farmer|3210|f"
issue $ADM_A "${HID[1]}" "'Second Farmer', NULL, NULL" >/dev/null
eq "H6 handing the same code to someone else replaces the recipient and says so in the audit" "$(q "SELECT (SELECT issued_to_name||'/'||COALESCE(issued_to_mobile,'-')||'/'||COALESCE(issue_note,'-') FROM activation_codes WHERE id='${HID[1]}'), (SELECT metadata->>'replaces_earlier_recipient' FROM activation_logs WHERE activation_code_id='${HID[1]}' ORDER BY created_at DESC LIMIT 1)")" "Second Farmer/-/-|true"
has "H7 an admin of another tenant is refused" "$(issue $OWN_B "${HID[2]}" "'X', NULL, NULL")" "not_authorized"
has "H8 a viewer of the same tenant is refused" "$(issue $VIEW_A "${HID[2]}")" "not_authorized"
has "H9 an unknown code answers the same as a foreign one" "$(issue $ADM_A "00000000-0000-0000-0000-000000000000")" "not_authorized"
has "H10 the app (anon) cannot call it" "$($PSQL -c "SET ROLE anon" -c "SELECT public.activation_issue_code('${HID[2]}')" 2>&1)" "permission denied"
has "H11 the service role is not a portal user: refused" "$(svc "SELECT public.activation_issue_code('${HID[2]}')")" "not_authorized\|permission denied"
has "H12 a wrong mobile number is refused" "$(issue $ADM_A "${HID[2]}" "'A', '12345', NULL")" "invalid_recipient"
has "H13 a note without a recipient is refused" "$(issue $ADM_A "${HID[2]}" "NULL, NULL, 'note only'")" "invalid_recipient"
has "H14 a name longer than 80 characters is refused" "$(issue $ADM_A "${HID[2]}" "repeat('x', 81), NULL, NULL")" "invalid_recipient"
eq "H15 the refused calls changed nothing and wrote no audit line" "$(q "SELECT (SELECT issued_at IS NULL FROM activation_codes WHERE id='${HID[2]}'), (SELECT count(*) FROM activation_logs WHERE activation_code_id='${HID[2]}')")" "t|0"
has "H16 a tenant admin cannot write the recipient directly" "$(usr $ADM_A "UPDATE public.activation_codes SET issued_to_name='forged', issued_at=now(), issued_by='$ADM_A' WHERE id='${HID[2]}'")" "permission denied"
eq "H17 the tenant reads its own hand-out record; another tenant sees none of it" "$(usr $ADM_A "SELECT count(*) FROM public.activation_codes WHERE batch_id='$BH' AND issued_at IS NOT NULL") $(usr $OWN_B "SELECT count(*) FROM public.activation_codes WHERE batch_id='$BH'")" "1 0"
has "H18 the encrypted copy and the hash stay unreadable to the portal" "$(usr $ADM_A "SELECT code_ciphertext FROM public.activation_codes WHERE id='${HID[1]}'")" "permission denied"
FH=$(newfarmer 9500000001)
eq "H19 handing out reserves nothing: whoever enters the code first uses it" "$(redeem $FH "${HCODE[1]}")" "activated"
eq "H20 the used code keeps the record of who it was handed to" "$(q "SELECT state, issued_to_name, code_ciphertext IS NULL FROM activation_codes WHERE id='${HID[1]}'")" "ACTIVATED|Second Farmer|t"
has "H21 a used code can no longer be shown" "$(issue $ADM_A "${HID[1]}")" "code_not_available"
has "H22 the hand-out record of a used code cannot be rewritten, even by the owner of the database" "$(q "UPDATE public.activation_codes SET issued_to_name='rewritten' WHERE id='${HID[1]}'")" "cannot change"
usr $SUPER "SELECT public.activation_admin_revoke(NULL, ARRAY['${HID[3]}']::uuid[], 'lost sheet')" >/dev/null
has "H23 a revoked code cannot be shown" "$(issue $ADM_A "${HID[3]}")" "code_not_available"
has "H24 half a record is refused by the table itself" "$(q "UPDATE public.activation_codes SET issued_at=now() WHERE id='${HID[2]}'")" "activation_codes_issue_shape"
eq "H25 audit lines written in this section: 1 shown + 2 issued" "$(( $(q "SELECT count(*) FROM activation_logs WHERE batch_id='$BH' AND event IN ('CODE_ISSUED','CODE_SHOWN')") - LOGS0 ))" "3"

echo "== I. integrity after everything =="
eq "I1 no farmer holds two codes, no code two farmers" "$(q "SELECT (SELECT count(*) FROM (SELECT redeemed_by FROM activation_codes WHERE redeemed_by IS NOT NULL GROUP BY 1 HAVING count(*)>1) x), (SELECT count(*) FROM (SELECT activation_code_id FROM farmers WHERE activation_code_id IS NOT NULL GROUP BY 1 HAVING count(*)>1) y)")" "0|0"
eq "I2 every activated farmer sits in the tenant of the code, with account and role in the same tenant" "$(q "SELECT count(*) FROM farmers f JOIN activation_codes c ON c.id=f.activation_code_id LEFT JOIN accounts a ON a.id=f.id LEFT JOIN account_roles r ON r.account_id=f.id WHERE f.tenant_id<>c.tenant_id OR a.tenant_id<>c.tenant_id OR r.tenant_id<>c.tenant_id OR f.activation_pending")" "0"
eq "I3 no ACTIVATED/EXPIRED/REVOKED code keeps an encrypted copy" "$(q "SELECT count(*) FROM activation_codes WHERE state IN ('ACTIVATED','EXPIRED','REVOKED') AND code_ciphertext IS NOT NULL")" "0"
eq "I4 successes in the audit trail = activated codes" "$(q "SELECT (SELECT count(*) FROM activation_logs WHERE event='REDEEM_SUCCESS') = (SELECT count(*) FROM activation_codes WHERE state='ACTIVATED')")" "t"
eq "I5 no unexpected server error was logged" "$(q "SELECT count(*) FROM activation_logs WHERE event='REDEEM_ERROR'")" "0"
q "UPDATE tenants SET max_farmers = 5000 WHERE id='$TB'" >/dev/null
T0=$(date +%s.%N); BIG=$(gen $TB 2000); T1=$(date +%s.%N)
eq "I6 a full batch of 2000 codes generates, all hashes different" "$(q "SELECT count(DISTINCT code_hash) FROM activation_codes WHERE batch_id='$BIG'")" "2000"
printf 'INFO  2000 codes generated in %.2f s\n' "$(echo "$T1 - $T0" | bc)"
q "UPDATE feature_flags SET is_enabled = false WHERE flag_name='farmer_activation_required'" >/dev/null
has "I7 flag back OFF: legacy registration into a tenant works again" "$(svc "INSERT INTO public.farmers(tenant_id, mobile_number) VALUES ('$TB','9400000001') RETURNING tenant_id")" "$TB"
eq "I8 flag back OFF: a farmer who never redeemed a code resolves again, exactly as before the feature" "$(app tok-wait "SELECT farmer_id, tenant_id FROM public.verified_session_context()")" "$SW|$TD"
eq "I9 flag back OFF: app registration is not made pending" "$(q "SELECT activation_pending FROM farmers WHERE mobile_number='9400000001'")" "f"
q "UPDATE feature_flags SET is_enabled = true WHERE flag_name='farmer_activation_required'" >/dev/null
eq "I10 flag ON again: the same farmer is nobody again" "$(app tok-wait "SELECT count(*) FROM public.verified_session_context()")" "0"
echo; echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]

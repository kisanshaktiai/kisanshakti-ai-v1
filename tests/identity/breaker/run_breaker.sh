#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# tests/identity/breaker/run_breaker.sh
# REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
#
# Independent attack run, database layer. Builds ONE throw-away database with the
# replica bootstrap, the identity migrations 090000 … 090700, the cutover and the
# M2 account functions (100000), runs breaker_sql.sql and the concurrency attacks,
# prints every PASS / BROKEN / INFO line, and drops the database.
#
#   su postgres -c "bash tests/identity/breaker/run_breaker.sh"
#
# NEVER point this at a Supabase project: it creates roles and databases.
# Exit code: 0 when no line is BROKEN, 1 otherwise.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")"
MIG="../../../supabase/migrations"
FILES=(
  20261124090000_identity_accounts_core.sql
  20261124090100_identity_farmer_triggers.sql
  20261124090200_identity_backfill.sql
  20261124090300_identity_session_reset_links.sql
  20261124090400_identity_session_fk_validate.sql
  20261124090500_identity_account_session_functions.sql
  20261124090600_identity_reach_settings.sql
  20261124090700_identity_config_seeds.sql
  20261124091000_identity_cutover_verified_session_context.sql
  20261124100000_identity_account_auth_functions.sql
  20261124110000_identity_breaker_fixes.sql
)
DB="identity_breaker_$$"
OUT="$(mktemp -d)"
cleanup() { psql -q -d postgres -c "drop database if exists ${DB} with (force)" >/dev/null 2>&1 || true; rm -rf "$OUT"; }
trap cleanup EXIT

psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database ${DB}"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f ../replica_bootstrap.sql >/dev/null 2>"$OUT/bootstrap.log"
for f in "${FILES[@]}"; do
  psql -v ON_ERROR_STOP=1 -q -At -d "$DB" -f "$MIG/$f" >>"$OUT/apply.log" 2>&1 || { echo "could not apply $f"; tail -5 "$OUT/apply.log"; exit 2; }
done

psql -v ON_ERROR_STOP=1 -q -d "$DB" -f breaker_sql.sql >"$OUT/sql.out" 2>"$OUT/sql.err" || { echo "script error"; tail -8 "$OUT/sql.err"; cat "$OUT/sql.out"; exit 2; }
grep -E '^(PASS|BROKEN|INFO|===)' "$OUT/sql.out"

echo "=== H. Reach throttle under concurrency ==="
# P5 (provider only): INITIAL, then 24 parallel changes, limit 3.
hdr() { echo "SET ROLE anon; SELECT set_config('request.headers', '{\"x-session-token\":\"$1\"}', false);"; }
psql -q -At -d "$DB" -c "$(hdr tok-p5)" -c "SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', 5)->>'is_set'" >/dev/null 2>&1
for i in $(seq 1 24); do
  psql -q -At -d "$DB" -c "$(hdr tok-p5)" \
    -c "SELECT 'accepted' FROM set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-00000000000$((1 + i % 5))', $((5 + 5 * (i % 19))))" >"$OUT/c1.$i" 2>&1 &
done
wait
ACC=$(cat "$OUT"/c1.* | grep -c '^accepted' || true)
REF=$(cat "$OUT"/c1.* | grep -c 'REACH_CHANGE_LIMIT_REACHED' || true)
ROWS=$(psql -q -At -d "$DB" -c "SELECT count(*) FROM account_reach_history WHERE account_id = '9a000000-0000-0000-0000-000000000005' AND change_kind = 'CHANGE'")
if [ "$ROWS" -le 3 ] && [ "$ACC" -le 3 ]; then V=PASS; else V=BROKEN; fi
echo "$V | H11 | 24 parallel Reach changes by one provider, limit 3 | accepted=$ACC refused=$REF CHANGE rows stored=$ROWS"

# Customer C1 and provider+customer twin sessions of ONE account are already at the limit (H08);
# a fresh account: farmer B1 is given both roles, sets both INITIAL, then 24 parallel changes split over the two roles.
psql -q -d "$DB" -c "INSERT INTO account_roles (account_id, tenant_id, role, status, source) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','SERVICE_PROVIDER','ACTIVE','TEST_FIXTURE'),
  ('bbbbbbbb-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','CUSTOMER','ACTIVE','TEST_FIXTURE');
  INSERT INTO user_sessions (user_id, session_id, access_token_hash, expires_at, is_active, active_role) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001','bk-b1p',hash_session_token('tok-b1p'),now()+interval '7 days',true,'SERVICE_PROVIDER'),
  ('bbbbbbbb-0000-0000-0000-000000000001','bk-b1c',hash_session_token('tok-b1c'),now()+interval '7 days',true,'CUSTOMER');"
psql -q -At -d "$DB" -c "$(hdr tok-b1p)" -c "SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', 5)->>'is_set'" >/dev/null 2>&1
psql -q -At -d "$DB" -c "$(hdr tok-b1c)" -c "SELECT set_account_reach('CUSTOMER', '71000000-0000-0000-0000-000000000001', 5)->>'is_set'" >/dev/null 2>&1
for i in $(seq 1 24); do
  if [ $((i % 2)) -eq 0 ]; then T=tok-b1p; R=SERVICE_PROVIDER; else T=tok-b1c; R=CUSTOMER; fi
  psql -q -At -d "$DB" -c "$(hdr $T)" \
    -c "SELECT 'accepted' FROM set_account_reach('$R', '71000000-0000-0000-0000-00000000000$((1 + i % 5))', $((10 + 5 * (i % 18))))" >"$OUT/c2.$i" 2>&1 &
done
wait
ACC=$(cat "$OUT"/c2.* | grep -c '^accepted' || true)
REF=$(cat "$OUT"/c2.* | grep -c 'REACH_CHANGE_LIMIT_REACHED' || true)
ROWS=$(psql -q -At -d "$DB" -c "SELECT count(*) FROM account_reach_history WHERE account_id = 'bbbbbbbb-0000-0000-0000-000000000001' AND change_kind = 'CHANGE'")
if [ "$ROWS" -le 3 ] && [ "$ACC" -le 3 ]; then V=PASS; else V=BROKEN; fi
echo "$V | H12 | 24 parallel Reach changes split over the Provider and Customer sessions of ONE account, limit 3 per account | accepted=$ACC refused=$REF CHANGE rows stored=$ROWS"

# First set-up raced: 12 parallel first calls for one role must leave one row and one INITIAL.
psql -q -d "$DB" -c "INSERT INTO accounts (id, tenant_id, mobile_number, pin_hash) VALUES ('9a000000-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','0000009006',repeat('97',32));
  INSERT INTO account_roles (account_id, tenant_id, role, status, source) VALUES ('9a000000-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','SERVICE_PROVIDER','ACTIVE','TEST_FIXTURE');
  INSERT INTO user_sessions (user_id, session_id, access_token_hash, expires_at, is_active, active_role) VALUES ('9a000000-0000-0000-0000-000000000006','bk-p6',hash_session_token('tok-p6'),now()+interval '7 days',true,'SERVICE_PROVIDER');"
for i in $(seq 1 12); do
  psql -q -At -d "$DB" -c "$(hdr tok-p6)" \
    -c "SELECT 'accepted' FROM set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-00000000000$((1 + i % 5))', $((5 + 5 * i)))" >"$OUT/c3.$i" 2>&1 &
done
wait
INIT=$(psql -q -At -d "$DB" -c "SELECT count(*) FILTER (WHERE change_kind='INITIAL') || ' INITIAL, ' || count(*) FILTER (WHERE change_kind='CHANGE') || ' CHANGE' FROM account_reach_history WHERE account_id = '9a000000-0000-0000-0000-000000000006'")
if [ "$INIT" = "1 INITIAL, 3 CHANGE" ]; then V=PASS; else V=BROKEN; fi
echo "$V | H13 | 12 parallel FIRST set-ups (each hoping to count as the free INITIAL) | history: $INIT"

BROKEN=$(grep -c '^BROKEN' "$OUT/sql.out" || true)
echo "───────────────────────────────────────────────────────────────────────────"
echo "database layer: $(grep -c '^PASS' "$OUT/sql.out" || true) PASS, $BROKEN BROKEN (plus the concurrency lines above)"
[ "$BROKEN" -eq 0 ]

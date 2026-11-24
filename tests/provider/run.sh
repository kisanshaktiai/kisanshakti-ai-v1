#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# tests/provider/run.sh
# REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
#
# Tests the Provider Workspace migrations (supabase/migrations/20261124140000 …
# 140400) on a throw-away local database and drops it afterwards. Builds on the
# identity replica (tests/identity/replica_bootstrap.sql) with the identity
# migrations and the cutover applied. Uses the standard libpq variables.
# NEVER point this at a Supabase project: it creates roles and databases.
#
#   1. the five files apply, and apply a second time without error
#   2. every verification SELECT inside the files returns actual = expected
#   3. provider_tests.sql: every line PASS
#   4. concurrency: 12 overlapping blackouts → 1 accepted; 12 services against a limit of 3 → 3 stored
#
# Exit code 0 only if every step passes. Set KEEP_OUT=<dir> to keep the raw outputs.
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")"
MIG="../../supabase/migrations"
IDENTITY_FILES=(
  20261124090000_identity_accounts_core.sql
  20261124090100_identity_farmer_triggers.sql
  20261124090200_identity_backfill.sql
  20261124090300_identity_session_reset_links.sql
  20261124090400_identity_session_fk_validate.sql
  20261124090500_identity_account_session_functions.sql
  20261124090600_identity_reach_settings.sql
  20261124090700_identity_config_seeds.sql
  20261124110000_identity_breaker_fixes.sql
  20261124091000_identity_cutover_verified_session_context.sql
)
PROVIDER_FILES=(
  20261124140000_provider_catalogue_lookups.sql
  20261124140100_provider_workspace_tables.sql
  20261124140200_provider_workspace_functions.sql
  20261124140300_provider_service_map_and_flag.sql
  20261124140400_provider_workspace_flag_check.sql
)
DB="provider_it_$$"
OUT="${KEEP_OUT:-$(mktemp -d)}"; mkdir -p "$OUT"
FAILED=0
cleanup() { psql -q -d postgres -c "drop database if exists ${DB} with (force)" >/dev/null 2>&1 || true; [ -z "${KEEP_OUT:-}" ] && rm -rf "$OUT" || true; }
trap cleanup EXIT

psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database ${DB}"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f ../identity/replica_bootstrap.sql >/dev/null 2>"$OUT/bootstrap.log"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f replica_provider_addon.sql >/dev/null 2>>"$OUT/bootstrap.log"
for f in "${IDENTITY_FILES[@]}"; do
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$MIG/$f" >/dev/null 2>>"$OUT/identity.log" || { echo "FAIL  applying $f"; tail -5 "$OUT/identity.log"; exit 1; }
done

echo "── 1. the five provider files, applied twice ──────────────────────────────"
for round in 1 2; do
  for f in "${PROVIDER_FILES[@]}"; do
    psql -v ON_ERROR_STOP=1 -q -At -F ' | ' -d "$DB" -f "$MIG/$f" >"$OUT/apply.$round.$f.out" 2>"$OUT/apply.$round.$f.err" \
      || { echo "FAIL  applying $f (round $round)"; tail -8 "$OUT/apply.$round.$f.err"; exit 1; }
  done
done
echo "PASS  all 5 files applied, then applied again without error"

echo "── 2. the verification SELECTs inside the files ───────────────────────────"
BAD=$(cat "$OUT"/apply.2.*.out | awk -F' \\| ' 'NF==3 && $2 != $3' || true)
N=$(cat "$OUT"/apply.2.*.out | awk -F' \\| ' 'NF==3' | wc -l)
if [ -z "$BAD" ] && [ "$N" -gt 0 ]; then echo "PASS  $N of $N in-file checks return actual = expected"
else echo "FAIL  in-file checks:"; echo "$BAD"; FAILED=1; fi

echo "── 3. behaviour tests ─────────────────────────────────────────────────────"
if psql -v ON_ERROR_STOP=1 -q -d "$DB" -f provider_tests.sql >"$OUT/tests.out" 2>"$OUT/tests.err"; then
  PASS=$(grep -c '^PASS' "$OUT/tests.out" || true); FAIL=$(grep -c '^FAIL' "$OUT/tests.out" || true)
  if [ "$FAIL" -eq 0 ] && [ "$PASS" -gt 0 ]; then echo "PASS  $PASS of $PASS behaviour tests"
  else echo "FAIL  $FAIL failed, $PASS passed"; grep '^FAIL' "$OUT/tests.out" || true; FAILED=1; fi
else echo "FAIL  provider_tests.sql: script error"; tail -6 "$OUT/tests.err"; FAILED=1; fi

echo "── 4. concurrency ─────────────────────────────────────────────────────────"
# provider three was suspended by the tests; give it back its role and a clean slate for this step
psql -v ON_ERROR_STOP=1 -q -d "$DB" -c "UPDATE account_roles SET status='ACTIVE' WHERE account_id='9a000000-0000-0000-0000-000000000003'" \
  -c "UPDATE system_config SET config_value = config_value || '{\"max_services\": 3}' WHERE config_key='provider_workspace_policy'" \
  -c "UPDATE provider_services SET status='REMOVED' WHERE account_id='9a000000-0000-0000-0000-000000000003'"
HDR="SET ROLE anon; SELECT set_config('request.headers', '{\"x-session-token\":\"tok-p3\"}', false);"
for i in $(seq 1 12); do
  psql -q -At -d "$DB" -c "$HDR" -c "SELECT 'accepted' FROM provider_add_blackout(now() + interval '20 days' + interval '$i hours', now() + interval '25 days')" >"$OUT/conc.b.$i" 2>&1 &
  psql -q -At -d "$DB" -c "$HDR" -c "SELECT 'accepted' FROM provider_save_service('{\"category_code\":\"SEEDLING_SUPPLY\",\"title\":\"Parallel $i\",\"pricing_unit\":\"PER_PIECE\",\"base_rate\":2}')" >"$OUT/conc.s.$i" 2>&1 &
done
wait
B_OK=$(cat "$OUT"/conc.b.* | grep -c '^accepted' || true); B_NO=$(cat "$OUT"/conc.b.* | grep -c 'PROVIDER_BLACKOUT_OVERLAP' || true)
B_ROWS=$(psql -q -At -d "$DB" -c "SELECT count(*) FROM provider_blackouts WHERE account_id='9a000000-0000-0000-0000-000000000003' AND cancelled_at IS NULL")
S_OK=$(cat "$OUT"/conc.s.* | grep -c '^accepted' || true); S_NO=$(cat "$OUT"/conc.s.* | grep -c 'PROVIDER_LIMIT_REACHED' || true)
S_ROWS=$(psql -q -At -d "$DB" -c "SELECT count(*) FROM provider_services WHERE account_id='9a000000-0000-0000-0000-000000000003' AND status<>'REMOVED'")
if [ "$B_OK" = "1" ] && [ "$B_NO" = "11" ] && [ "$B_ROWS" = "1" ]; then echo "PASS  12 overlapping blackouts at once: 1 accepted, 11 refused, 1 stored"
else echo "FAIL  blackouts: accepted=$B_OK refused=$B_NO stored=$B_ROWS (expected 1 / 11 / 1)"; FAILED=1; fi
if [ "$S_OK" = "3" ] && [ "$S_NO" = "9" ] && [ "$S_ROWS" = "3" ]; then echo "PASS  12 services at once against a limit of 3: 3 accepted, 9 refused, 3 stored"
else echo "FAIL  services: accepted=$S_OK refused=$S_NO stored=$S_ROWS (expected 3 / 9 / 3)"; FAILED=1; fi

echo "───────────────────────────────────────────────────────────────────────────"
if [ "$FAILED" -eq 0 ]; then echo "ALL PASSED"; else echo "SOME CHECKS FAILED"; fi
[ -n "${KEEP_OUT:-}" ] && echo "raw outputs kept in $OUT"
exit "$FAILED"

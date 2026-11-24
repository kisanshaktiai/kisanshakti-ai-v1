#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# tests/identity/run.sh
# REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
#
# Tests the identity migrations (supabase/migrations/20261124090000 … 090700, the
# STAGED cutover and the ROLLBACK file) on throw-away local databases and drops
# them afterwards. Uses the standard libpq variables (PGHOST, PGPORT, PGUSER,
# PGPASSWORD). NEVER point this at a Supabase project: it creates roles and databases.
#
# What it proves, in order:
#   1. PRECHECK file runs (read-only) on a database without the migrations.
#   2. G, M1 state:      the portal replay prints byte-identical output on a database
#                        without the migrations and on one with them (applied twice,
#                        to prove they are safe to re-run).
#   3. C:                after that replay every write left a correct account and role.
#   4. G, after cutover: the same two checks with the STAGED cutover applied as well.
#   5. A, B, C, D, E, F, H: behaviour tests on a fresh migrated database.
#   6. H under concurrency: 12 parallel Reach changes for one account, limit 3.
#   7. ROLLBACK file: after it, the replay output equals the no-migration output again.
#
# Exit code 0 only if every step passes. Set KEEP_OUT=<dir> to keep the raw outputs.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")"
MIG="../../supabase/migrations"
M1_FILES=(
  20261124090000_identity_accounts_core.sql
  20261124090100_identity_farmer_triggers.sql
  20261124090200_identity_backfill.sql
  20261124090300_identity_session_reset_links.sql
  20261124090400_identity_session_fk_validate.sql
  20261124090500_identity_account_session_functions.sql
  20261124090600_identity_reach_settings.sql
  20261124090700_identity_config_seeds.sql
  20261124110000_identity_breaker_fixes.sql
)
CUTOVER="20261124091000_identity_cutover_verified_session_context.sql"
ROLLBACK="ROLLBACK_20261124090000_identity_accounts.sql"
PRECHECK="PRECHECK_20261124090000_identity_accounts.sql"

PFX="identity_it_$$"
OUT="${KEEP_OUT:-$(mktemp -d)}"
mkdir -p "$OUT"
DBS=()
FAILED=0

cleanup() {
  for d in "${DBS[@]}"; do psql -q -d postgres -c "drop database if exists ${d} with (force)" >/dev/null 2>&1 || true; done
  if [ -z "${KEEP_OUT:-}" ]; then rm -rf "$OUT"; fi
}
trap cleanup EXIT

newdb() {            # newdb <name>: create it and load the replica
  local db="${PFX}_$1"
  psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database ${db}"
  DBS+=("$db")
  psql -v ON_ERROR_STOP=1 -q -d "$db" -f replica_bootstrap.sql >/dev/null 2>"$OUT/$1.bootstrap.log"
}
apply() {            # apply <name> <file>...: apply migration files, stop on the first error
  local name="$1"; shift
  for f in "$@"; do
    psql -v ON_ERROR_STOP=1 -q -At -F ' | ' -d "${PFX}_${name}" -f "$MIG/$f" >>"$OUT/$name.apply.log" 2>&1 \
      || { echo "FAIL  applying $f on $name (see $OUT/$name.apply.log)"; tail -5 "$OUT/$name.apply.log"; exit 1; }
  done
}
replay() {           # replay <name>: run the portal replay, keep stdout only (stderr has clock/ids)
  psql -v ON_ERROR_STOP=1 -q -d "${PFX}_$1" -f portal_replay.sql >"$OUT/$1.replay.out" 2>"$OUT/$1.replay.err"
}
same_as_base() {     # same_as_base <name> <label>
  if diff -u "$OUT/base.replay.out" "$OUT/$1.replay.out" >"$OUT/$1.replay.diff"; then
    echo "PASS  $2: replay output identical to the database without the migrations ($(wc -l <"$OUT/$1.replay.out") lines)"
  else
    echo "FAIL  $2: replay output differs"; head -40 "$OUT/$1.replay.diff"; FAILED=1
  fi
}
checks() {           # checks <name> <sql file> <label>: every line must start with PASS
  psql -v ON_ERROR_STOP=1 -q -d "${PFX}_$1" -f "$2" >"$OUT/$1.$(basename "$2" .sql).out" 2>"$OUT/$1.$(basename "$2" .sql).err" \
    || { echo "FAIL  $3: script error"; tail -5 "$OUT/$1.$(basename "$2" .sql).err"; FAILED=1; return; }
  local f="$OUT/$1.$(basename "$2" .sql).out"
  local pass fail
  pass=$(grep -c '^PASS' "$f" || true); fail=$(grep -c '^FAIL' "$f" || true)
  if [ "$fail" -eq 0 ] && [ "$pass" -gt 0 ]; then echo "PASS  $3: $pass of $pass checks"
  else echo "FAIL  $3: $fail failed, $pass passed"; grep '^FAIL' "$f" || true; FAILED=1; fi
}

echo "── 1. database without the migrations ─────────────────────────────────────"
newdb base
psql -v ON_ERROR_STOP=1 -q -At -F ' | ' -d "${PFX}_base" -f "$MIG/$PRECHECK" >"$OUT/base.precheck.out" 2>"$OUT/base.precheck.err" \
  && echo "PASS  PRECHECK file runs read-only ($(grep -c . "$OUT/base.precheck.out") result lines)" \
  || { echo "FAIL  PRECHECK file"; tail -5 "$OUT/base.precheck.err"; FAILED=1; }
replay base
echo "      replay done: $(grep -c '^R[0-9]' "$OUT/base.replay.out") replayed statements"

echo "── 2. M1 state: migrations 090000 … 090700, applied twice ────────────────"
newdb m1
apply m1 "${M1_FILES[@]}"
apply m1 "${M1_FILES[@]}"
echo "PASS  all 8 files applied, then applied again without error"
replay m1
same_as_base m1 "G (M1 state)"
checks m1 identity_state_checks.sql "C (accounts and roles left by the replay, M1 state)"

echo "── 3. after cutover: the same, plus the STAGED verified_session_context() ──"
newdb cut
apply cut "${M1_FILES[@]}" "$CUTOVER"
replay cut
same_as_base cut "G (after cutover)"
checks cut identity_state_checks.sql "C (accounts and roles left by the replay, after cutover)"

echo "── 4. invariants on a fresh migrated database ─────────────────────────────"
newdb inv
apply inv "${M1_FILES[@]}" "$CUTOVER"
checks inv behaviour_tests.sql "A, B, C, D, E, F, H behaviour tests"

echo "── 5. Reach throttle under concurrency (12 parallel changes, limit 3) ─────"
HDR="SET ROLE anon; SELECT set_config('request.headers', '{\"x-session-token\":\"tok-p3\"}', false);"
psql -v ON_ERROR_STOP=1 -q -At -d "${PFX}_inv" \
  -c "$HDR" -c "SELECT set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000001', 5)->>'is_set'" >"$OUT/inv.conc.init" 2>&1
for i in $(seq 1 12); do
  psql -q -At -d "${PFX}_inv" -c "$HDR" \
    -c "SELECT 'accepted' FROM set_account_reach('SERVICE_PROVIDER', '71000000-0000-0000-0000-000000000002', $((5 + 5 * i)))" \
    >"$OUT/inv.conc.$i" 2>&1 &
done
wait
ACCEPTED=$(cat "$OUT"/inv.conc.[0-9]* | grep -c '^accepted' || true)
REFUSED=$(cat "$OUT"/inv.conc.[0-9]* | grep -c 'REACH_CHANGE_LIMIT_REACHED' || true)
STORED=$(psql -q -At -d "${PFX}_inv" -c "SELECT count(*) FROM account_reach_history WHERE account_id = '9a000000-0000-0000-0000-000000000003' AND change_kind = 'CHANGE'")
if [ "$ACCEPTED" = "3" ] && [ "$REFUSED" = "9" ] && [ "$STORED" = "3" ]; then
  echo "PASS  H (concurrency): 3 accepted, 9 refused with REACH_CHANGE_LIMIT_REACHED, 3 CHANGE rows stored"
else
  echo "FAIL  H (concurrency): accepted=$ACCEPTED refused=$REFUSED stored=$STORED (expected 3 / 9 / 3)"; FAILED=1
fi

echo "── 6. ROLLBACK file ───────────────────────────────────────────────────────"
newdb rb
apply rb "${M1_FILES[@]}" "$CUTOVER" "$ROLLBACK" "$ROLLBACK"
echo "PASS  ROLLBACK file applied after the cutover, then applied again without error"
KEPT=$(psql -q -At -d "${PFX}_rb" -c "SELECT (SELECT count(*) FROM accounts) || ' accounts and ' || (SELECT count(*) FROM account_roles) || ' roles'")
if [ "$KEPT" = "6 accounts and 6 roles" ]; then echo "PASS  ROLLBACK deleted no data: the $KEPT made by the backfill are still there"
else echo "FAIL  ROLLBACK: expected 6 accounts and 6 roles to remain, found $KEPT"; FAILED=1; fi
replay rb
same_as_base rb "ROLLBACK (behaviour back to the database without the migrations)"

echo "───────────────────────────────────────────────────────────────────────────"
if [ "$FAILED" -eq 0 ]; then echo "ALL PASSED"; else echo "SOME CHECKS FAILED"; fi
[ -n "${KEEP_OUT:-}" ] && echo "raw outputs kept in $OUT"
exit "$FAILED"

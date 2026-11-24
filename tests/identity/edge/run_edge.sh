#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# tests/identity/edge/run_edge.sh
# REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
#
# Runs the real auth core and session verifier against a throw-away local replica
# behind PostgREST, once with the M1 + M2 migrations only and once with the STAGED
# cutover applied as well. Drops everything afterwards.
#
# Needs: psql (libpq variables for a superuser), a local Postgres reachable on
# 127.0.0.1:${PGPORT:-5432} with password auth, DENO_BIN and POSTGREST_BIN.
# NEVER point this at a Supabase project: it creates roles and databases.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
cd "$(dirname "$0")"
MIG="../../../supabase/migrations"
DENO_BIN="${DENO_BIN:-deno}"
POSTGREST_BIN="${POSTGREST_BIN:-postgrest}"
FILES=(
  20261124090000_identity_accounts_core.sql
  20261124090100_identity_farmer_triggers.sql
  20261124090200_identity_backfill.sql
  20261124090300_identity_session_reset_links.sql
  20261124090400_identity_session_fk_validate.sql
  20261124090500_identity_account_session_functions.sql
  20261124090600_identity_reach_settings.sql
  20261124090700_identity_config_seeds.sql
  20261124100000_identity_account_auth_functions.sql
  20261124100100_identity_feature_flag.sql
)
CUTOVER="STAGED_20261124091000_identity_cutover_verified_session_context.sql"
SECRET="identity-it-local-only-jwt-secret-0123456789"
PGRST_PORT="${IT_POSTGREST_PORT:-54398}"
FAILED=0
PGRST_PID=""
DBS=()

cleanup() {
  [ -n "$PGRST_PID" ] && kill "$PGRST_PID" 2>/dev/null || true
  for d in "${DBS[@]}"; do psql -q -d postgres -c "drop database if exists ${d} with (force)" >/dev/null 2>&1 || true; done
  psql -q -d postgres -c "drop role if exists identity_it_authenticator" >/dev/null 2>&1 || true
}
trap cleanup EXIT

run_case() {          # run_case <label> <cutover 0|1>
  local db="identity_edge_$$_$2"
  psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database ${db}"
  DBS+=("$db")
  psql -v ON_ERROR_STOP=1 -q -d "$db" -f ../replica_bootstrap.sql >/dev/null 2>&1
  psql -v ON_ERROR_STOP=1 -q -d "$db" -f replica_edge_addon.sql >/dev/null
  for f in "${FILES[@]}"; do psql -v ON_ERROR_STOP=1 -q -At -d "$db" -f "$MIG/$f" >/dev/null; done
  for f in "${FILES[@]}"; do psql -v ON_ERROR_STOP=1 -q -At -d "$db" -f "$MIG/$f" >/dev/null; done   # safe to re-run
  if [ "$2" = "1" ]; then psql -v ON_ERROR_STOP=1 -q -At -d "$db" -f "$MIG/$CUTOVER" >/dev/null; fi

  PGRST_DB_URI="postgres://identity_it_authenticator:identity_it_local_only@127.0.0.1:${PGPORT:-5432}/${db}" \
  PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$SECRET" \
  PGRST_SERVER_PORT="$PGRST_PORT" PGRST_LOG_LEVEL=crit "$POSTGREST_BIN" >/dev/null 2>&1 &
  PGRST_PID=$!
  for _ in $(seq 1 50); do curl -s -o /dev/null "http://127.0.0.1:${PGRST_PORT}/" && break; sleep 0.2; done

  echo "── $1 ──"
  if IT_POSTGREST_URL="http://127.0.0.1:${PGRST_PORT}" IT_JWT_SECRET="$SECRET" IT_CUTOVER="$2" DENO_NO_PACKAGE_JSON=1 \
     "$DENO_BIN" test --no-config --allow-net --allow-env --allow-read auth_core_test.ts 2>&1 | grep -v "^Download\|^Check"; then :; fi
  [ "${PIPESTATUS[0]}" -eq 0 ] || FAILED=1
  kill "$PGRST_PID" 2>/dev/null || true; wait "$PGRST_PID" 2>/dev/null || true; PGRST_PID=""
}

run_case "M1 + M2 migrations, cutover NOT applied (the state right after the edge deploy)" 0
run_case "M1 + M2 migrations AND the staged cutover" 1

if [ "$FAILED" -eq 0 ]; then echo "ALL PASSED"; else echo "SOME CHECKS FAILED"; fi
exit "$FAILED"

#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# tests/identity/breaker/run_breaker_edge.sh
# REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
#
# Independent attack run against the real auth core and session verifier, on a
# throw-away local replica behind PostgREST with ALL identity migrations and the
# cutover applied. Drops everything afterwards. Run as root:
#
#   PGHOST=127.0.0.1 PGUSER=it_admin PGPASSWORD=it_admin_local \
#   DENO_BIN=/tmp/denoinst/node_modules/.bin/deno POSTGREST_BIN=/tmp/pgrst/postgrest \
#   bash tests/identity/breaker/run_breaker_edge.sh
#
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
  20261124110000_identity_breaker_fixes.sql
  20261124100100_identity_feature_flag.sql
  20261124091000_identity_cutover_verified_session_context.sql
)
SECRET="identity-breaker-local-only-jwt-secret-0123456789"
PGRST_PORT="${IT_POSTGREST_PORT:-54396}"
DB="identity_breaker_edge_$$"
PGRST_PID=""
cleanup() {
  [ -n "$PGRST_PID" ] && kill "$PGRST_PID" 2>/dev/null || true
  psql -q -d postgres -c "drop database if exists ${DB} with (force)" >/dev/null 2>&1 || true
  psql -q -d postgres -c "drop role if exists identity_it_authenticator" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database ${DB}"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f ../replica_bootstrap.sql >/dev/null 2>&1
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f ../edge/replica_edge_addon.sql >/dev/null
for f in "${FILES[@]}"; do psql -v ON_ERROR_STOP=1 -q -At -d "$DB" -f "$MIG/$f" >/dev/null; done

PGRST_DB_URI="postgres://identity_it_authenticator:identity_it_local_only@127.0.0.1:${PGPORT:-5432}/${DB}" \
PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$SECRET" PGRST_DB_POOL=40 \
PGRST_SERVER_PORT="$PGRST_PORT" PGRST_LOG_LEVEL=crit "$POSTGREST_BIN" >/dev/null 2>&1 &
PGRST_PID=$!
for _ in $(seq 1 50); do curl -s -o /dev/null "http://127.0.0.1:${PGRST_PORT}/" && break; sleep 0.2; done

IT_POSTGREST_URL="http://127.0.0.1:${PGRST_PORT}" IT_JWT_SECRET="$SECRET" DENO_NO_PACKAGE_JSON=1 \
  "$DENO_BIN" run --no-config --allow-net --allow-env --allow-read breaker_edge.ts 2>&1 \
  | grep -E "^(PASS|BROKEN|INFO|SCRIPT ERROR|===|auth core:)"
exit "${PIPESTATUS[0]}"

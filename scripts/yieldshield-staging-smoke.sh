#!/usr/bin/env bash
# Staging-only NEGATIVE HTTP smoke: no farmer records, no mutations.
# Required env: STAGING_SUPABASE_PROJECT_REF
set -euo pipefail
ref="${STAGING_SUPABASE_PROJECT_REF:-}"
production="qfklkkzxemsbeniyugiz"
if [[ ! "$ref" =~ ^[a-z]{20}$ || "$ref" == "$production" ]]; then
  echo "DENIED: missing/non-staging project ref" >&2; exit 2
fi
endpoint="https://${ref}.supabase.co/functions/v1/schedule-reconciler"
# curl status only, without Authorization, apikey or private user data.
status="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 7 --max-time 20 \
  -X POST "$endpoint" -H 'Content-Type: application/json' --data '{"dryRun":true}')"
if [[ "$status" != "401" ]]; then
  echo "FAIL: unauthenticated reconciler must return HTTP 401, got $status" >&2
  exit 1
fi
echo "PASS: staging reconciler denies unauthenticated POST with 401"

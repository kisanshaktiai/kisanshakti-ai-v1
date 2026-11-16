#!/usr/bin/env bash
# Runs the YieldShield SQL integration test in a throw-away database and drops it afterwards.
# Uses the standard libpq variables (PGHOST, PGPORT, PGUSER, PGPASSWORD). Never point this at a
# Supabase project: it creates roles and a database.
set -euo pipefail
cd "$(dirname "$0")"
DB="yieldshield_it_$$"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database ${DB}"
trap 'psql -q -d postgres -c "drop database if exists ${DB} with (force)" >/dev/null' EXIT
psql -v ON_ERROR_STOP=1 -q -At -d "${DB}" -f yieldshield_release_nutrient_integration.sql

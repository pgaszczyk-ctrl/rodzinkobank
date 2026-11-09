#!/usr/bin/env bash
# Runs the SQL behaviour tests against a scratch PostgreSQL database.
# Usage: PGHOST=/var/run/postgresql PGPORT=5432 PGUSER=postgres tests/sql/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="groszaki_test_$$"
psql -q -d postgres -c "create database $DB" >/dev/null
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
run() { psql -q -v ON_ERROR_STOP=1 -d "$DB" "$@" >/dev/null 2>&1 || psql -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
run -f tests/sql/supabase_mock.sql
run -f supabase/schema.sql
run -f supabase/schema.sql   # must be re-runnable
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/sql/rpc_test.sql 2>&1 | grep -v '^$' | grep -vE '^\s*(\(|-|expect_error|t$|f$)' || true

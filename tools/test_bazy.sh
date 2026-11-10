#!/usr/bin/env bash
# Testuje migrację Groszaków na lokalnym Postgresie, bez dotykania produkcji.
#
# Użycie:  tools/test_bazy.sh            (połączenie z PGHOST/PGPORT/PGUSER z otoczenia)
#
# Tworzy pustą bazę groszaki_test, wgrywa atrapę Supabase (auth), obecny
# supabase/schema.sql, dane jak w Rodzinobanku, migrację (dwa razy, żeby
# sprawdzić, że można ją powtórzyć), testy SQL i porównanie salda z JS.
set -euo pipefail
cd "$(dirname "$0")/.."
DB=groszaki_test
psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB"
run() { psql -q -v ON_ERROR_STOP=1 -d "$DB" -c "set client_min_messages = warning" -f "$1" >/dev/null; }
run supabase/test/auth_stub.sql
run supabase/schema.sql
run supabase/test/stare_dane.sql
run supabase/migracje/20261110_groszaki.sql
run supabase/migracje/20261110_groszaki.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/test/testy.sql
PSQL_ARGS="-d $DB" node tests/baza_vs_js.mjs
PSQL_ARGS="-d $DB" node tests/dane_baza.mjs

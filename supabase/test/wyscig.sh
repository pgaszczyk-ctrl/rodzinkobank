#!/usr/bin/env bash
# Dwie wypłaty w tej samej chwili (np. dwoje rodziców): przejść może tylko jedna.
# Każda wypłata to ok. 60% salda, więc obie razem zrobiłyby debet.
set -euo pipefail
DB=${1:-groszaki_test}
KID=20000000-0000-0000-0000-000000000001
AS="set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';"
BAL=$(psql -qtA -d "$DB" -c "select balance from private.simulate('$KID', now())")
AMT=$(( BAL * 6 / 10 / 10000 * 10000 ))
start() {  # $1 = id, $2 = opóźnienie przed wypłatą, $3 = czas trzymania transakcji
  psql -qtA -v ON_ERROR_STOP=1 -d "$DB" >"/tmp/wyscig_$1.out" 2>&1 <<SQL &
$AS
select pg_sleep($2);
begin;
select public.gr_add_money('$KID', gen_random_uuid(), 'withdrawal', now(), $AMT, 'wyścig $1');
select pg_sleep($3);
commit;
SQL
}
start a 0 1.5
start b 0.4 0
wait || true
OK=$(cat /tmp/wyscig_a.out /tmp/wyscig_b.out | grep -c '"duplicate": false' || true)
FAIL=$(cat /tmp/wyscig_a.out /tmp/wyscig_b.out | grep -c 'Za mało pieniędzy' || true)
MIN=$(psql -qtA -d "$DB" -c "select min_after from private.simulate('$KID', now())")
if [ "$OK" = 1 ] && [ "$FAIL" = 1 ] && [ "$MIN" -ge 0 ]; then
  echo "OK: z dwóch jednoczesnych wypłat po $((AMT / 1000000)) zł przeszła jedna, saldo nieujemne"
else
  echo "BŁĄD: wyścig wypłat (przeszło: $OK, odrzucono: $FAIL, najniższe saldo: $MIN µg)"; cat /tmp/wyscig_a.out /tmp/wyscig_b.out; exit 1
fi

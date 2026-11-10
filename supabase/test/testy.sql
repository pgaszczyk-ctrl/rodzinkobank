-- Testy migracji Groszaków na lokalnym Postgresie (uruchamia tools/test_bazy.sh).
-- Każdy błąd przerywa testy (ON_ERROR_STOP).
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\o /dev/null

create or replace function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'OCZEKIWANO BŁĘDU (%): %', p_like, p_sql;
exception when others then
  if sqlerrm like 'OCZEKIWANO BŁĘDU%' then raise; end if;
  if sqlerrm not like p_like then raise exception 'Zły błąd: "%" zamiast "%" w: %', sqlerrm, p_like, p_sql; end if;
end $$;
grant execute on function pg_temp.expect_error(text, text) to anon, authenticated;

\o
\echo '1. Przeniesienie danych z Rodzinobanku'
\o /dev/null
do $$
declare v bigint; n int;
begin
  select amount into v from public.kid_events where kid_id = '20000000-0000-0000-0000-000000000001' and note = 'Przeniesione z Rodzinobanku';
  -- 100 zł po 45 dniach: premia ok. +7,4%; 20 zł po 3 dniach: ok. +0,5% → ok. 127,52 zł
  if v is null or v < 127000000 or v > 128000000 or v % 10000 <> 0 then raise exception 'saldo otwierające: %', v; end if;
  select count(*) into n from public.kid_events where kid_id = '20000000-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'Staś nie powinien mieć wpłaty otwierającej'; end if;
  select count(*) into n from public.kid_goals where kid_id = '20000000-0000-0000-0000-000000000001';
  if n <> 2 then raise exception 'cele: %', n; end if;
  if not exists (select 1 from public.kid_goals where name = 'Rower' and amount = 599500000 and img like 'data:%') then raise exception 'cel Rower'; end if;
  -- stare tabele nietknięte
  select count(*) into n from public.deposits; if n <> 2 then raise exception 'stare wpłaty zmienione'; end if;
  raise notice 'saldo otwierające Zosi: % µg', v;
end $$;

\o
\echo '2. Uprawnienia: anon i obcy nie mają dostępu do pieniędzy'
\o /dev/null
set role anon;
select pg_temp.expect_error($$select public.gr_add_money('20000000-0000-0000-0000-000000000001', gen_random_uuid(), 'deposit', now(), 10000000)$$, '%permission denied%');
select pg_temp.expect_error($$select * from public.kid_events$$, '%permission denied%');
select pg_temp.expect_error($$select public.gr_kid_state('20000000-0000-0000-0000-000000000001')$$, '%permission denied%');
-- dziecko z tajnym linkiem: widzi swój skarbiec, bez tokenu linku
do $$
declare j jsonb;
begin
  j := public.gr_kid_state_by_token('30000000-0000-0000-0000-000000000001');
  if j->'kid'->>'name' <> 'Zosia' or j->'kid'->>'view_token' is not null then raise exception 'stan dziecka: %', j->'kid'; end if;
  if jsonb_array_length(j->'events') <> 1 then raise exception 'zdarzenia: %', j->'events'; end if;
end $$;
-- dziecko edytuje swoje cele
select public.gr_save_goal_by_token('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Piłka', 50000000, '⚽');
select public.gr_save_goal_by_token('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Piłka nożna', 60000000, '⚽');
select pg_temp.expect_error($$select public.gr_save_goal_by_token('30000000-0000-0000-0000-000000000099', gen_random_uuid(), 'X', 10000, null)$$, '%link już nie działa%');
-- cudzego celu przez swój link nie zmieni
select pg_temp.expect_error($$select public.gr_save_goal_by_token('30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'Kradzież', 10000, null)$$, '%identyfikator jest już zajęty%');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect_error($$select public.gr_add_money('20000000-0000-0000-0000-000000000001', gen_random_uuid(), 'deposit', now(), 10000000)$$, '%Brak dostępu%');
select pg_temp.expect_error($$select public.gr_kid_state('20000000-0000-0000-0000-000000000001')$$, '%Brak dostępu%');
reset role;

\o
\echo '3. Rodzic: wpłata, ponowienie, walidacja'
\o /dev/null
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$
declare j jsonb; n int;
begin
  j := public.gr_add_money('20000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'deposit', now() - interval '10 days', 50000000, 'od babci');
  if (j->>'duplicate')::boolean then raise exception 'pierwszy zapis oznaczony jako duplikat'; end if;
  -- ponowiony zapis (druga karta, słaby internet) – bez zmian
  j := public.gr_add_money('20000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'deposit', now() - interval '10 days', 50000000, 'od babci');
  if not (j->>'duplicate')::boolean then raise exception 'ponowienie nie wykryte'; end if;
  select count(*) into n from public.gr_kid_state('20000000-0000-0000-0000-000000000002') s, jsonb_array_elements(s->'events');
  if n <> 1 then raise exception 'zdublowana wpłata: %', n; end if;
end $$;
select pg_temp.expect_error($$select public.gr_add_money('20000000-0000-0000-0000-000000000002', gen_random_uuid(), 'deposit', now(), 10000001)$$, '%pełnych groszach%');
select pg_temp.expect_error($$select public.gr_add_money('20000000-0000-0000-0000-000000000002', gen_random_uuid(), 'deposit', now() + interval '1 day', 10000)$$, '%przyszłości%');
select pg_temp.expect_error($$select public.gr_add_money('20000000-0000-0000-0000-000000000002', gen_random_uuid(), 'deposit', now(), -10000)$$, '%Nieprawidłowa kwota%');
select pg_temp.expect_error($$select public.gr_add_money('20000000-0000-0000-0000-000000000002', gen_random_uuid(), 'bonus', now(), 10000)$$, '%Nieznany rodzaj%');
-- wypłata ponad saldo
select pg_temp.expect_error($$select public.gr_add_money('20000000-0000-0000-0000-000000000002', gen_random_uuid(), 'withdrawal', now(), 90000000)$$, '%Za mało pieniędzy%');
-- wsteczna wypłata większa niż saldo w tamtym dniu
select pg_temp.expect_error($$select public.gr_add_money('20000000-0000-0000-0000-000000000002', gen_random_uuid(), 'withdrawal', now() - interval '20 days', 10000)$$, '%Za mało pieniędzy%');
-- ujemna korekta ponad saldo
select pg_temp.expect_error($$select public.gr_add_money('20000000-0000-0000-0000-000000000002', gen_random_uuid(), 'adjustment', now(), -90000000)$$, '%Za mało pieniędzy%');
select public.gr_add_money('20000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', 'withdrawal', now(), 20000000, 'książka');
select public.gr_add_money('20000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000003', 'adjustment', now(), -10000, 'pomyłka');
-- usunięcie wpłaty, które zrobiłoby debet, jest zablokowane
select pg_temp.expect_error($$select public.gr_delete_event('20000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001')$$, '%saldo byłoby ujemne%');

\o
\echo '4. Zmiana stawek: tylko od przyszłej północy, nigdy wstecz'
\o /dev/null
select pg_temp.expect_error($$select public.gr_set_rates('20000000-0000-0000-0000-000000000002', gen_random_uuid(), (now() at time zone 'Europe/Warsaw')::date, 0.04, 0.02, 1000000000)$$, '%najwcześniej od jutra%');
select pg_temp.expect_error($$select public.gr_set_rates('20000000-0000-0000-0000-000000000002', gen_random_uuid(), (now() at time zone 'Europe/Warsaw')::date - 3, 0.04, 0.02, 1000000000)$$, '%najwcześniej od jutra%');
select pg_temp.expect_error($$select public.gr_set_rates('20000000-0000-0000-0000-000000000002', gen_random_uuid(), (now() at time zone 'Europe/Warsaw')::date + 1, 1.5, 0.02, 1000000000)$$, '%Nieprawidłowa stawka%');
reset role;
create temp table saldo_przed as select balance from private.simulate('20000000-0000-0000-0000-000000000002', now());
set role authenticated;
select public.gr_set_rates('20000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000004', (now() at time zone 'Europe/Warsaw')::date + 1, 0.10, 0.02, 500000000);
reset role;
do $$
declare before bigint; after bigint; jutro bigint; bez bigint;
begin
  select balance into before from saldo_przed;
  select balance into after from private.simulate('20000000-0000-0000-0000-000000000002', now());
  if abs(before - after) > 2 then raise exception 'zmiana stawek zmieniła saldo sprzed jej daty: % → %', before, after; end if;
  -- po dacie zmiany saldo rośnie szybciej (10% zamiast 5%)
  select balance into jutro from private.simulate('20000000-0000-0000-0000-000000000002', now() + interval '10 days');
  if jutro <= after then raise exception 'saldo nie rośnie po zmianie stawek'; end if;
end $$;
set role authenticated;
-- nieobowiązującą jeszcze zmianę można cofnąć
select public.gr_delete_event('20000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000004');

\o
\echo '5. Plany, wydarzenia, ferie, cele rodzica'
\o /dev/null
select public.gr_save_plan('20000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 10000000, 'week', current_date + 1);
select public.gr_save_calendar('20000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002', 'Urodziny', current_date + 40, '🎂');
select public.gr_set_ferie('20000000-0000-0000-0000-000000000002', '2027-02-15', '2027-02-28');
select pg_temp.expect_error($$select public.gr_set_ferie('20000000-0000-0000-0000-000000000002', '2027-02-15', null)$$, '%termin ferii%');
select public.gr_save_goal('20000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000003', 'Rolki', 180000000, '🛼');
do $$
declare j jsonb; v1 text; v2 text;
begin
  j := public.gr_kid_state('20000000-0000-0000-0000-000000000002');
  if jsonb_array_length(j->'plans') <> 1 or jsonb_array_length(j->'calendar') <> 1 then raise exception 'plany/wydarzenia'; end if;
  if j->'kid'->'ferie'->>'start' <> '2027-02-15' then raise exception 'ferie: %', j->'kid'->'ferie'; end if;
  if j->'kid'->>'view_token' is null then raise exception 'rodzic powinien widzieć token linku'; end if;
  v1 := public.gr_kid_version('20000000-0000-0000-0000-000000000002');
  perform public.gr_delete_goal('20000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000003');
  v2 := public.gr_kid_version('20000000-0000-0000-0000-000000000002');
  if v1 = v2 then raise exception 'wersja nie zmieniła się po usunięciu celu'; end if;
end $$;

\o
\echo '6. Nowe dziecko dostaje przykładowe cele'
\o /dev/null
do $$
declare j jsonb; kid uuid;
begin
  j := public.add_kid('Ola');
  select (x->>'id')::uuid into kid from jsonb_array_elements(j->'kids') x where x->>'name' = 'Ola';
  if jsonb_array_length(public.gr_kid_state(kid)->'goals') <> 2 then raise exception 'cele nowego dziecka'; end if;
end $$;

-- zdjęcia starych marzeń zostają w bazie, ale nie trafiają do aplikacji
do $$
declare j jsonb;
begin
  j := public.gr_kid_state('20000000-0000-0000-0000-000000000001');
  if exists (select 1 from jsonb_array_elements(j->'goals') g where g ? 'img') then raise exception 'img w odpowiedzi'; end if;
  if exists (select 1 from jsonb_array_elements(j->'goals') g where coalesce(g->>'icon', '') = '') then raise exception 'cel bez ikony'; end if;
end $$;
reset role;
\o
\echo 'OK: wszystkie testy bazy przeszły'

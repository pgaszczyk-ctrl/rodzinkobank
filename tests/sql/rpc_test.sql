-- Behaviour tests for supabase/schema.sql (run by tests/sql/run.sh on a scratch database).
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.expect_error(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error % but statement succeeded: %', p_msg, p_sql;
exception when others then
  if sqlerrm <> p_msg then raise exception 'expected error %, got %', p_msg, sqlerrm; end if;
end $$;

insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'parent@x'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'other@x')
on conflict do nothing;

-- ---- parent A creates a family -------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select (public.create_family('Zosia')->'kids'->0->>'id') as kid \gset
select (public.my_family()->'kids'->0->>'view_token') as token \gset

-- money operations need a PIN session
select pg_temp.expect_error(format($q$select public.add_deposit(gen_random_uuid(), %L, gen_random_uuid(), 10000000, 10000000, 0, 1)$q$, :'kid'), 'pin_required');
select pg_temp.expect_error($q$select public.set_pin('12a')$q$, 'pin_format');
select public.set_pin('2468') as s0 \gset
select pg_temp.expect_error($q$select public.set_pin('1111')$q$, 'pin_required');      -- changing needs a session
select (public.verify_pin('0000')->>'ok')::boolean = false as wrong_pin_rejected \gset
\if :wrong_pin_rejected \else \echo 'FAIL wrong pin' \quit \endif
select public.verify_pin('2468')->>'token' as s \gset

-- ---- deposit + idempotent retry -----------------------------------------
\set op1 'bbbbbbbb-0000-0000-0000-000000000001'
\set bon1 'bbbbbbbb-0000-0000-0000-000000000002'
select (public.add_deposit(:'s', :'kid', :'op1', 10000000, 10000000, 0, 1, :'bon1', 2000000)->>'rev')::int as rev1 \gset
select (public.add_deposit(:'s', :'kid', :'op1', 10000000, 10000000, 0, 1, :'bon1', 2000000)->>'rev')::int as rev1b \gset
reset role;
select count(*) = 2 and :rev1 = :rev1b as idempotent from ledger_ops where kid_id = :'kid' \gset
set role authenticated;
\if :idempotent \else \echo 'FAIL retry duplicated a deposit' \quit \endif

-- split must add up; bonus only when the whole gift goes to the vault; bonus within budget
select pg_temp.expect_error(format($q$select public.add_deposit(%L, %L, gen_random_uuid(), 10000000, 6000000, 3000000, 1)$q$, :'s', :'kid'), 'amount_invalid');
select pg_temp.expect_error(format($q$select public.add_deposit(%L, %L, gen_random_uuid(), 10000000, 6000000, 4000000, 1, gen_random_uuid(), 100000)$q$, :'s', :'kid'), 'bonus_not_allowed');
select pg_temp.expect_error(format($q$select public.add_deposit(%L, %L, gen_random_uuid(), 10000000, 10000000, 0, 1, gen_random_uuid(), 4000000)$q$, :'s', :'kid'), 'bonus_over_budget');
select public.add_deposit(:'s', :'kid', gen_random_uuid(), 10000000, 6000000, 4000000, 1) is not null as split_ok \gset

-- plan: validation and versioning; deposits with an outdated plan version are refused
select pg_temp.expect_error(format($q$select public.save_plan(%L, %L, array[500,400,600,700,800,900], 1)$q$, :'s', :'kid'), 'plan_decreasing');
select pg_temp.expect_error(format($q$select public.save_plan(%L, %L, array[500,1000,1800,2500,3800,5100], 1)$q$, :'s', :'kid'), 'plan_over_cap');
select pg_temp.expect_error(format($q$select public.save_plan(%L, %L, array[100,200,300,400,500,1000], 1)$q$, :'s', :'kid'), 'plan_mine_over_cap');
select (public.save_plan(:'s', :'kid', array[500,1000,2000,3000,4000,5000], 1, 25)->'plan'->>'v')::int as plan_v \gset
select pg_temp.expect_error(format($q$select public.add_deposit(%L, %L, gen_random_uuid(), 10000000, 10000000, 0, 1)$q$, :'s', :'kid'), 'plan_changed');

-- "Na teraz": spending is checked against the pool on the server
select (public.kid_state(:'kid')->>'rev')::int as rev \gset
select pg_temp.expect_error(format($q$select public.spend_now(%L, %L, gen_random_uuid(), %s, 5000000)$q$, :'s', :'kid', :rev), 'now_insufficient');
select public.spend_now(:'s', :'kid', gen_random_uuid(), :rev, 1000000) is not null as spend_ok \gset
-- stale revision is refused (another tab changed the vault meanwhile)
select pg_temp.expect_error(format($q$select public.spend_now(%L, %L, gen_random_uuid(), %s, 1000000)$q$, :'s', :'kid', :rev), 'stale_state');

-- ---- other family cannot read or write ---------------------------------
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
select pg_temp.expect_error(format($q$select public.kid_state(%L)$q$, :'kid'), 'no_access');
select pg_temp.expect_error(format($q$select public.add_deposit(%L, %L, gen_random_uuid(), 10000000, 10000000, 0, 2)$q$, :'s', :'kid'), 'pin_required');

-- ---- child (anonymous, link token) --------------------------------------
reset request.jwt.claim.sub;
set role anon;
select pg_temp.expect_error(format($q$select public.kid_state(%L)$q$, :'kid'), 'permission denied for function kid_state');
select pg_temp.expect_error(format($q$select public.add_deposit(gen_random_uuid(), %L, gen_random_uuid(), 1, 1, 0, 1)$q$, :'kid'), 'permission denied for function add_deposit');
select (public.kid_state_by_token(:'token')->'kid'->>'view_token') is null as token_hidden \gset
\if :token_hidden \else \echo 'FAIL kid sees token' \quit \endif
\set req1 'cccccccc-0000-0000-0000-000000000001'
select pg_temp.expect_error(format($q$select public.request_withdrawal_by_token(%L, gen_random_uuid(), 12345)$q$, :'token'), 'amount_invalid');
select public.request_withdrawal_by_token(:'token', :'req1', 3000000) is not null as req_ok \gset
select public.request_withdrawal_by_token(:'token', :'req1', 3000000) is not null as req_retry_ok \gset
select pg_temp.expect_error(format($q$select public.request_withdrawal_by_token(%L, gen_random_uuid(), 10000)$q$, :'token'), 'request_pending');

-- ---- parent approves only after 24 h, with a valid allocation ----------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select (public.kid_state(:'kid')->>'rev')::int as rev \gset
select pg_temp.expect_error(format($q$select public.approve_withdrawal(%L, %L, gen_random_uuid(), %s, '{"free":0,"principal":{"%s":3000000}}')$q$, :'s', :'req1', :rev, :'op1'), 'request_too_early');
reset role;
update public.withdrawal_requests set created_at = now() - interval '25 hours' where id = :'req1';
set role authenticated;
select pg_temp.expect_error(format($q$select public.approve_withdrawal(%L, %L, gen_random_uuid(), %s, '{"free":0,"principal":{"%s":2000000}}')$q$, :'s', :'req1', :rev, :'op1'), 'alloc_invalid');
select pg_temp.expect_error(format($q$select public.approve_withdrawal(%L, %L, gen_random_uuid(), %s, '{"free":0,"principal":{"%s":30000000}}')$q$, :'s', :'req1', :rev, :'op1'), 'alloc_invalid');
\set wop 'dddddddd-0000-0000-0000-000000000001'
select public.approve_withdrawal(:'s', :'req1', :'wop', :rev, format('{"free":2000000,"principal":{"%s":1000000}}', :'op1')::jsonb) is not null as approved \gset
-- retry of the same approval is harmless
select public.approve_withdrawal(:'s', :'req1', :'wop', :rev, format('{"free":2000000,"principal":{"%s":1000000}}', :'op1')::jsonb) is not null as approved_retry \gset
reset role;
select principal_left = 9000000 as principal_reduced from ledger_ops where id = :'op1' \gset
set role authenticated;
\if :principal_reduced \else \echo 'FAIL principal not reduced once' \quit \endif
reset role;
select count(*) = 1 as one_withdrawal from ledger_ops where kind = 'withdrawal' and kid_id = :'kid' \gset
set role authenticated;
\if :one_withdrawal \else \echo 'FAIL duplicated withdrawal' \quit \endif

-- cancel by child
reset request.jwt.claim.sub;
set role anon;
\set req2 'cccccccc-0000-0000-0000-000000000002'
select public.request_withdrawal_by_token(:'token', :'req2', 10000) is not null as req2_ok \gset
select (public.cancel_withdrawal_by_token(:'token', :'req2')->'requests'->0->>'status') = 'cancelled' as cancelled \gset
\if :cancelled \else \echo 'FAIL cancel' \quit \endif

-- PIN lockout after 5 wrong attempts
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select public.verify_pin('0000'), public.verify_pin('0000'), public.verify_pin('0000'), public.verify_pin('0000'), public.verify_pin('0000') \gset x
select (public.verify_pin('2468') ? 'locked_until') as locked \gset
\if :locked \else \echo 'FAIL no lockout' \quit \endif

\echo 'ALL SQL TESTS PASSED'

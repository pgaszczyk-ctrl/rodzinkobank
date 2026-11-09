-- =====================================================================
--  Groszaki (Coinlings) – wspólna baza rodziny w Supabase
--  Jak użyć: Supabase → SQL Editor → New query → wklej cały plik → Run.
--  Skrypt można uruchamiać wielokrotnie. Zachowuje rodziny, dzieci, linki
--  i marzenia z Rodzinobanku, a stare wpłaty przenosi do nowej księgi.
--
--  Model bezpieczeństwa
--  * Tabele są zamknięte dla API; cały dostęp idzie przez funkcje RPC.
--  * Rodzic: zalogowany (Supabase Auth) członek rodziny. Zmiany pieniędzy,
--    planu, celów i zatwierdzanie wypłat wymagają dodatkowo ważnej sesji PIN
--    (verify_pin → token na 30 min), sprawdzanej po stronie serwera.
--  * Dziecko: tajny link z tokenem. Może oglądać skarbiec i cele oraz złożyć
--    lub anulować wniosek o wypłatę. Nie może wpłacać ani zatwierdzać.
--
--  Księgowanie
--  * ledger_ops to niezmienne operacje (wpłata, bonus, wypłata, korekta,
--    wydatek z „Na teraz”). Mikrogrosze z kopalni i skrzynie wynikają
--    deterministycznie z tych operacji i czasu serwera (src/engine.js), więc
--    odświeżenie strony ani druga karta nie przyznają niczego drugi raz.
--  * Każda operacja ma identyfikator nadany przez klienta (klucz idempotencji):
--    ponowienie zapisu zwraca ten sam wynik zamiast tworzyć duplikat.
--  * kids.rev rośnie przy każdej zmianie. Operacje zależne od salda
--    (wypłata, korekta, wydatek) wymagają zgodnego rev – jeśli druga karta
--    zdążyła coś zmienić, zapis jest odrzucany i klient przelicza stan.
--  * Kwoty są w całkowitych mikrogroszach (1 zł = 1 000 000).
-- =====================================================================

create schema if not exists private;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
--  Tabele (część istnieje od Rodzinobanku)
-- ---------------------------------------------------------------------
create table if not exists public.families (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'Moja rodzina',
  join_code  text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at timestamptz not null default now()
);
alter table public.families add column if not exists tz text not null default 'Europe/Warsaw';
alter table public.families add column if not exists pin_hash text;
alter table public.families add column if not exists pin_fails integer not null default 0;
alter table public.families add column if not exists pin_locked_until timestamptz;

create table if not exists public.family_members (
  family_id  uuid not null references public.families(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (family_id, user_id)
);
create index if not exists family_members_user_idx on public.family_members(user_id);

create table if not exists public.kids (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 30),
  view_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);
create index if not exists kids_family_idx on public.kids(family_id);
alter table public.kids add column if not exists rev bigint not null default 0;
alter table public.kids add column if not exists plan jsonb not null default '{"v":1,"th":[500,1000,1800,2500,3800,5000],"rate":1}'::jsonb;
alter table public.kids add column if not exists schedule jsonb;
alter table public.kids add column if not exists settings jsonb not null default '{"bonusPct":20}'::jsonb;
alter table public.kids add column if not exists seen_until timestamptz not null default now();

create table if not exists public.dreams (
  kid_id     uuid not null references public.kids(id) on delete cascade,
  slot       smallint not null check (slot between 0 and 2),
  name       text not null check (char_length(name) between 1 and 40),
  price      numeric(12,2) not null check (price > 0),
  img        text check (img is null or char_length(img) <= 600000),
  updated_at timestamptz not null default now(),
  primary key (kid_id, slot)
);

-- Stare tabele Rodzinobanku – tylko do jednorazowego przeniesienia danych.
create table if not exists public.deposits (
  id uuid primary key default gen_random_uuid(),
  kid_id uuid not null references public.kids(id) on delete cascade,
  ts timestamptz not null default now(),
  amount numeric(14,6) not null check (amount > 0),
  created_by uuid, created_at timestamptz not null default now()
);
create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  kid_id uuid not null references public.kids(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  created_by uuid, created_at timestamptz not null default now()
);

-- Księga operacji
create table if not exists public.ledger_ops (
  id             uuid primary key,                 -- klucz idempotencji nadany przez klienta
  seq            bigserial not null,
  kid_id         uuid not null references public.kids(id) on delete cascade,
  kind           text not null check (kind in ('deposit','bonus','withdrawal','correction','now_out')),
  ts             timestamptz not null default date_trunc('milliseconds', now()),
  vault          bigint not null default 0,        -- zmiana Skarbca (µg); wypłata ma wartość ujemną
  now_amt        bigint not null default 0,        -- zmiana puli „Na teraz” (µg)
  gift_total     bigint,                           -- pełna kwota prezentu (wpłata)
  plan           jsonb,                            -- wersja planu zapisana z wpłatą
  ref            uuid references public.ledger_ops(id) on delete cascade, -- bonus → wpłata
  alloc          jsonb,                            -- rozbicie wypłaty: {"free":µg,"principal":{"<id>":µg}}
  principal_left bigint,                           -- pozostały kapitał wpłaty (µg)
  request_id     uuid,
  note           text check (note is null or char_length(note) <= 120),
  legacy_id      uuid unique,
  created_by     uuid,
  created_at     timestamptz not null default now()
);
create index if not exists ledger_ops_kid_idx on public.ledger_ops(kid_id, ts, seq);

create table if not exists public.withdrawal_requests (
  id         uuid primary key,                     -- klucz idempotencji nadany przez klienta
  kid_id     uuid not null references public.kids(id) on delete cascade,
  amount     bigint not null check (amount > 0 and amount % 10000 = 0),
  status     text not null default 'pending' check (status in ('pending','cancelled','approved','rejected')),
  created_at timestamptz not null default date_trunc('milliseconds', now()),
  decided_at timestamptz,
  decided_by uuid,
  op_id      uuid
);
create unique index if not exists withdrawal_requests_one_pending on public.withdrawal_requests(kid_id) where status = 'pending';

create table if not exists public.parent_sessions (
  token      uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  family_id  uuid not null references public.families(id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists parent_sessions_user_idx on public.parent_sessions(user_id);

alter table public.families            enable row level security;
alter table public.family_members      enable row level security;
alter table public.kids                enable row level security;
alter table public.dreams              enable row level security;
alter table public.deposits            enable row level security;
alter table public.withdrawals         enable row level security;
alter table public.ledger_ops          enable row level security;
alter table public.withdrawal_requests enable row level security;
alter table public.parent_sessions     enable row level security;
revoke all on public.families, public.family_members, public.kids, public.dreams, public.deposits,
  public.withdrawals, public.ledger_ops, public.withdrawal_requests, public.parent_sessions from anon, authenticated;

-- Stare funkcje Rodzinobanku (zastąpione poniżej)
drop function if exists public.add_deposit(uuid, numeric, timestamptz);
drop function if exists public.delete_deposit(uuid);
drop function if exists public.apply_withdrawal(uuid, numeric, jsonb);
drop function if exists public.save_dream(uuid, integer, text, numeric, text);
drop function if exists public.save_dream_by_token(uuid, integer, text, numeric, text);
drop function if exists public.rename_kid(uuid, text);
drop function if exists public.regenerate_kid_link(uuid);
drop function if exists public.add_kid(text);

-- ---------------------------------------------------------------------
--  Funkcje pomocnicze (schemat private – niewidoczny w API)
--  Komunikaty błędów to kody, które aplikacja tłumaczy (src/locales).
-- ---------------------------------------------------------------------
create or replace function private.my_family_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.family_id from public.family_members m
  where m.user_id = (select auth.uid())
  order by m.created_at limit 1;
$$;

create or replace function private.require_user() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := (select auth.uid());
begin
  if v is null then raise exception 'auth_required' using errcode = '28000'; end if;
  return v;
end $$;

-- Odczyt: zalogowany członek rodziny dziecka.
create or replace function private.assert_kid_member(p_kid uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_user();
  if not exists (
    select 1 from public.kids k join public.family_members m on m.family_id = k.family_id
    where k.id = p_kid and m.user_id = (select auth.uid())
  ) then
    raise exception 'no_access' using errcode = '42501';
  end if;
end $$;

-- Zapis: członek rodziny + ważna sesja PIN (przedłużana przy użyciu).
create or replace function private.assert_parent_session(p_session uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_family uuid;
begin
  select s.family_id into v_family from public.parent_sessions s
  where s.token = p_session and s.user_id = v_user and s.expires_at > now();
  if v_family is null then raise exception 'pin_required' using errcode = '42501'; end if;
  update public.parent_sessions set expires_at = now() + interval '30 minutes' where token = p_session;
  return v_family;
end $$;

create or replace function private.assert_parent(p_kid uuid, p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_family uuid := private.assert_parent_session(p_session);
begin
  if not exists (select 1 from public.kids k where k.id = p_kid and k.family_id = v_family) then
    raise exception 'no_access' using errcode = '42501';
  end if;
end $$;

create or replace function private.kid_by_token(p_token uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid;
begin
  select k.id into v from public.kids k where k.view_token = p_token;
  if v is null then raise exception 'link_invalid' using errcode = '42501'; end if;
  return v;
end $$;

-- Blokada wiersza dziecka i kontrola wersji (gdy p_expected nie jest null).
create or replace function private.lock_kid(p_kid uuid, p_expected bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  select rev into v from public.kids where id = p_kid for update;
  if v is null then raise exception 'no_access' using errcode = '42501'; end if;
  if p_expected is not null and p_expected <> v then
    raise exception 'stale_state' using errcode = '40001';
  end if;
  return v;
end $$;

create or replace function private.bump(p_kid uuid) returns void
language sql security definer set search_path = '' as $$
  update public.kids set rev = rev + 1 where id = p_kid;
$$;

create or replace function private.seed_dreams(p_kid uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.dreams (kid_id, slot, name, price) values
    (p_kid, 0, 'Klocki LEGO', 89),
    (p_kid, 1, 'Hulajnoga', 349),
    (p_kid, 2, 'Konsola do gier', 1499)
  on conflict do nothing;
$$;

create or replace function private.ms(t timestamptz) returns bigint
language sql immutable set search_path = '' as $$ select floor(extract(epoch from t) * 1000)::bigint $$;

-- Walidacja planu: 6 progów (punkty bazowe), niemalejące, ostatni ≤ 50%,
-- tempo 1–3 i kopalnia mieszcząca się w limicie (184 dni × tempo ≈ 15,9%).
create or replace function private.validate_plan(p_th integer[], p_rate integer) returns void
language plpgsql immutable set search_path = '' as $$
declare i int;
begin
  if p_th is null or array_length(p_th, 1) <> 6 then raise exception 'plan_shape' using errcode = '22023'; end if;
  if p_rate is null or p_rate not in (1, 2, 3) then raise exception 'plan_rate' using errcode = '22023'; end if;
  for i in 1..6 loop
    if p_th[i] is null or p_th[i] < 0 then raise exception 'plan_value' using errcode = '22023'; end if;
    if i > 1 and p_th[i] < p_th[i-1] then raise exception 'plan_decreasing' using errcode = '22023'; end if;
  end loop;
  if p_th[6] > 5000 then raise exception 'plan_over_cap' using errcode = '22023'; end if;
  if p_th[6] < ceil(1589760::numeric * p_rate * 10000 / 10000000) then
    raise exception 'plan_mine_over_cap' using errcode = '22023';
  end if;
end $$;

-- Pula „Na teraz” liczona po stronie serwera (bez premii, więc to zwykła suma).
create or replace function private.now_pool(p_kid uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case when kind = 'now_out' then -now_amt else now_amt end), 0)::bigint
  from public.ledger_ops where kid_id = p_kid;
$$;

-- Górne oszacowanie Skarbca: kapitał + maks. 50% premii + korekty dodatnie − wypłaty z premii.
create or replace function private.vault_upper_bound(p_kid uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select (coalesce(sum(principal_left) filter (where kind = 'deposit'), 0) * 3 / 2
        + coalesce(sum(greatest(vault, 0)) filter (where kind in ('correction','bonus')), 0))::bigint
  from public.ledger_ops where kid_id = p_kid;
$$;

create or replace function private.kid_json(p_kid uuid, p_with_token boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'kid', jsonb_build_object('id', k.id, 'name', k.name, 'view_token', case when p_with_token then k.view_token end),
    'tz', f.tz,
    'rev', k.rev,
    'plan', k.plan,
    'schedule', k.schedule,
    'settings', k.settings,
    'seen_until', private.ms(k.seen_until),
    'server_now', private.ms(now()),
    'ops', coalesce((select jsonb_agg(jsonb_build_object(
        'id', o.id, 'seq', o.seq, 'kind', o.kind, 'ts', private.ms(o.ts), 'vault', o.vault, 'now', o.now_amt,
        'gift', o.gift_total, 'plan', o.plan, 'ref', o.ref, 'alloc', o.alloc, 'request_id', o.request_id,
        'principal_left', o.principal_left, 'note', o.note) order by o.ts, o.seq)
      from public.ledger_ops o where o.kid_id = k.id), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'amount', r.amount, 'status', r.status, 'created_at', private.ms(r.created_at),
        'decided_at', private.ms(r.decided_at)) order by r.created_at desc)
      from (select * from public.withdrawal_requests w where w.kid_id = k.id order by w.created_at desc limit 20) r), '[]'::jsonb),
    'dreams', coalesce((select jsonb_agg(jsonb_build_object('slot', d.slot, 'name', d.name, 'price', d.price, 'img', d.img) order by d.slot)
      from public.dreams d where d.kid_id = k.id), '[]'::jsonb)
  )
  from public.kids k join public.families f on f.id = k.family_id
  where k.id = p_kid;
$$;

-- ---------------------------------------------------------------------
--  Rodzina, konta, PIN
-- ---------------------------------------------------------------------
drop function if exists public.my_family();
create function public.my_family() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when f.id is null then null else jsonb_build_object(
    'id', f.id, 'name', f.name, 'join_code', f.join_code, 'tz', f.tz,
    'has_pin', f.pin_hash is not null,
    'members', (select count(*) from public.family_members m where m.family_id = f.id),
    'kids', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'view_token', k.view_token) order by k.created_at)
                      from public.kids k where k.family_id = f.id), '[]'::jsonb)
  ) end
  from (select private.my_family_id() as fid) x
  left join public.families f on f.id = x.fid;
$$;

drop function if exists public.create_family(text);
create function public.create_family(p_kid_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_family uuid; v_kid uuid;
begin
  perform private.require_user();
  if private.my_family_id() is not null then return public.my_family(); end if;
  insert into public.families default values returning id into v_family;
  insert into public.family_members (family_id, user_id) values (v_family, (select auth.uid()));
  insert into public.kids (family_id, name) values (v_family, btrim(p_kid_name)) returning id into v_kid;
  perform private.seed_dreams(v_kid);
  return public.my_family();
end $$;

drop function if exists public.join_family(text);
create function public.join_family(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_family uuid;
begin
  perform private.require_user();
  select id into v_family from public.families where join_code = upper(btrim(p_code));
  if v_family is null then raise exception 'family_code_unknown' using errcode = 'P0002'; end if;
  insert into public.family_members (family_id, user_id) values (v_family, (select auth.uid())) on conflict do nothing;
  return public.my_family();
end $$;

-- Ustawienie PIN-u: pierwszy raz wystarczy logowanie, zmiana wymaga sesji PIN.
drop function if exists public.set_pin(text, uuid);
create function public.set_pin(p_pin text, p_session uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_family uuid := private.my_family_id(); v_has boolean; v_token uuid;
begin
  if v_family is null then raise exception 'no_family' using errcode = '42501'; end if;
  if p_pin !~ '^[0-9]{4,8}$' then raise exception 'pin_format' using errcode = '22023'; end if;
  select pin_hash is not null into v_has from public.families where id = v_family for update;
  if v_has then perform private.assert_parent_session(p_session); end if;
  update public.families set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8)), pin_fails = 0, pin_locked_until = null
  where id = v_family;
  delete from public.parent_sessions where family_id = v_family;
  insert into public.parent_sessions (user_id, family_id, expires_at) values (v_user, v_family, now() + interval '30 minutes')
  returning token into v_token;
  return v_token;
end $$;

-- Sprawdzenie PIN-u: 5 błędów blokuje na 5 minut. Zwraca token sesji (30 min).
drop function if exists public.verify_pin(text);
create function public.verify_pin(p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_family uuid := private.my_family_id(); f record; v_token uuid;
begin
  if v_family is null then raise exception 'no_family' using errcode = '42501'; end if;
  select * into f from public.families where id = v_family for update;
  if f.pin_hash is null then raise exception 'pin_not_set' using errcode = 'P0002'; end if;
  if f.pin_locked_until is not null and f.pin_locked_until > now() then
    return jsonb_build_object('ok', false, 'locked_until', private.ms(f.pin_locked_until));
  end if;
  if extensions.crypt(coalesce(p_pin, ''), f.pin_hash) <> f.pin_hash then
    update public.families set
      pin_locked_until = case when pin_fails + 1 >= 5 then now() + interval '5 minutes' end,
      pin_fails = case when pin_fails + 1 >= 5 then 0 else pin_fails + 1 end
    where id = v_family;
    return jsonb_build_object('ok', false);
  end if;
  update public.families set pin_fails = 0, pin_locked_until = null where id = v_family;
  delete from public.parent_sessions where user_id = v_user and expires_at < now();
  insert into public.parent_sessions (user_id, family_id, expires_at) values (v_user, v_family, now() + interval '30 minutes')
  returning token into v_token;
  return jsonb_build_object('ok', true, 'token', v_token);
end $$;

drop function if exists public.end_parent_session(uuid);
create function public.end_parent_session(p_session uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.parent_sessions where token = p_session and user_id = (select auth.uid());
$$;

drop function if exists public.add_kid(uuid, text);
create function public.add_kid(p_session uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_family uuid := private.assert_parent_session(p_session); v_kid uuid;
begin
  insert into public.kids (family_id, name) values (v_family, btrim(p_name)) returning id into v_kid;
  perform private.seed_dreams(v_kid);
  return public.my_family();
end $$;

drop function if exists public.rename_kid(uuid, uuid, text);
create function public.rename_kid(p_session uuid, p_kid uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_parent(p_kid, p_session);
  update public.kids set name = btrim(p_name), rev = rev + 1 where id = p_kid;
end $$;

drop function if exists public.regenerate_kid_link(uuid, uuid);
create function public.regenerate_kid_link(p_session uuid, p_kid uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  perform private.assert_parent(p_kid, p_session);
  update public.kids set view_token = gen_random_uuid() where id = p_kid returning view_token into v;
  return v;
end $$;

-- ---------------------------------------------------------------------
--  Odczyt stanu
-- ---------------------------------------------------------------------
drop function if exists public.kid_state(uuid);
create function public.kid_state(p_kid uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_kid_member(p_kid);
  return private.kid_json(p_kid, true);
end $$;

drop function if exists public.kid_version(uuid);
create function public.kid_version(p_kid uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_kid_member(p_kid);
  return (select rev::text from public.kids where id = p_kid);
end $$;

drop function if exists public.kid_state_by_token(uuid);
create function public.kid_state_by_token(p_token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.kid_json(private.kid_by_token(p_token), false);
$$;

drop function if exists public.kid_version_by_token(uuid);
create function public.kid_version_by_token(p_token uuid) returns text
language sql stable security definer set search_path = '' as $$
  select rev::text from public.kids where id = private.kid_by_token(p_token);
$$;

-- ---------------------------------------------------------------------
--  Operacje rodzica (wymagają sesji PIN)
-- ---------------------------------------------------------------------

-- Wpłata / prezent z podziałem. p_vault + p_now = p_gift. Bonus tylko gdy cały prezent idzie do Skarbca.
drop function if exists public.add_deposit(uuid, uuid, uuid, bigint, bigint, bigint, integer, uuid, bigint, text);
create function public.add_deposit(
  p_session uuid, p_kid uuid, p_op_id uuid, p_gift bigint, p_vault bigint, p_now bigint,
  p_plan_v integer, p_bonus_id uuid default null, p_bonus bigint default 0, p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_plan jsonb; v_tz text; v_th int[]; v_rate int; v_start timestamptz; v_end timestamptz;
        v_cap bigint; v_mine bigint;
begin
  perform private.assert_parent(p_kid, p_session);
  perform private.lock_kid(p_kid, null);
  if exists (select 1 from public.ledger_ops where id = p_op_id) then
    if not exists (select 1 from public.ledger_ops where id = p_op_id and kid_id = p_kid) then raise exception 'op_conflict' using errcode = '23505'; end if;
    return private.kid_json(p_kid, true);
  end if;
  if p_gift is null or p_vault is null or p_now is null or p_vault < 0 or p_now < 0 or p_gift <= 0
     or p_vault + p_now <> p_gift or p_gift % 10000 <> 0 or p_vault % 10000 <> 0 or p_gift > 1000000000000 then
    raise exception 'amount_invalid' using errcode = '22023';
  end if;
  select k.plan, f.tz into v_plan, v_tz from public.kids k join public.families f on f.id = k.family_id where k.id = p_kid;
  if p_vault > 0 and p_plan_v is not null and (v_plan->>'v')::int <> p_plan_v then
    raise exception 'plan_changed' using errcode = '40001';
  end if;
  insert into public.ledger_ops (id, kid_id, kind, vault, now_amt, gift_total, plan, principal_left, note, created_by)
  values (p_op_id, p_kid, 'deposit', p_vault, p_now, p_gift, case when p_vault > 0 then v_plan end,
          case when p_vault > 0 then p_vault end, nullif(btrim(p_note), ''), (select auth.uid()));

  if coalesce(p_bonus, 0) > 0 then
    if p_now <> 0 or p_vault = 0 or p_bonus_id is null or p_bonus % 10000 <> 0 then
      raise exception 'bonus_not_allowed' using errcode = '22023';
    end if;
    -- Budżet: limit planu minus prognoza kopalni (z tolerancją 1 gr – silnik i tak przycina).
    select array_agg(x::int order by ord) into v_th from jsonb_array_elements_text(v_plan->'th') with ordinality t(x, ord);
    v_rate := (v_plan->>'rate')::int;
    v_start := date_trunc('milliseconds', now());
    v_end := ((v_start at time zone v_tz) + interval '6 months') at time zone v_tz;
    v_cap := (v_th[6]::bigint * p_vault) / 10000;
    v_mine := (floor(extract(epoch from (v_end - v_start)) / 10)::bigint * p_vault * v_rate) / 10000000;
    if p_bonus > v_cap - v_mine + 10000 then raise exception 'bonus_over_budget' using errcode = '22023'; end if;
    insert into public.ledger_ops (id, kid_id, kind, vault, ref, created_by)
    values (p_bonus_id, p_kid, 'bonus', p_bonus, p_op_id, (select auth.uid()));
  end if;
  perform private.bump(p_kid);
  return private.kid_json(p_kid, true);
end $$;

-- Cofnięcie pomyłkowej wpłaty: tylko ostatnia operacja, najpóźniej 24 h po zapisie.
drop function if exists public.void_deposit(uuid, uuid, uuid, bigint);
create function public.void_deposit(p_session uuid, p_kid uuid, p_op_id uuid, p_expected_rev bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o record;
begin
  perform private.assert_parent(p_kid, p_session);
  perform private.lock_kid(p_kid, null);
  select * into o from public.ledger_ops where id = p_op_id and kid_id = p_kid and kind = 'deposit';
  if o.id is null then return private.kid_json(p_kid, true); end if; -- już usunięta (ponowienie)
  perform private.lock_kid(p_kid, p_expected_rev);
  if o.ts < now() - interval '24 hours' then raise exception 'void_too_old' using errcode = '22023'; end if;
  if exists (select 1 from public.ledger_ops x where x.kid_id = p_kid and x.seq > o.seq and coalesce(x.ref, '00000000-0000-0000-0000-000000000000'::uuid) <> o.id) then
    raise exception 'void_not_last' using errcode = '22023';
  end if;
  delete from public.ledger_ops where id = p_op_id;   -- bonus usuwa się kaskadowo
  perform private.bump(p_kid);
  return private.kid_json(p_kid, true);
end $$;

-- Korekta Skarbca lub puli „Na teraz”. Ujemna korekta Skarbca wymaga rozbicia (alloc).
drop function if exists public.add_correction(uuid, uuid, uuid, bigint, bigint, bigint, jsonb, text);
create function public.add_correction(
  p_session uuid, p_kid uuid, p_op_id uuid, p_expected_rev bigint,
  p_vault bigint, p_now bigint, p_alloc jsonb default null, p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_parent(p_kid, p_session);
  perform private.lock_kid(p_kid, null);
  if exists (select 1 from public.ledger_ops where id = p_op_id and kid_id = p_kid) then return private.kid_json(p_kid, true); end if;
  perform private.lock_kid(p_kid, p_expected_rev);
  if coalesce(p_vault, 0) = 0 and coalesce(p_now, 0) = 0 then raise exception 'amount_invalid' using errcode = '22023'; end if;
  if coalesce(p_vault, 0) % 10000 <> 0 or coalesce(p_now, 0) % 10000 <> 0 then raise exception 'amount_invalid' using errcode = '22023'; end if;
  if coalesce(p_now, 0) < 0 and private.now_pool(p_kid) + p_now < 0 then raise exception 'now_insufficient' using errcode = '22023'; end if;
  if coalesce(p_vault, 0) < 0 then
    perform private.apply_alloc(p_kid, -p_vault, p_alloc);
  end if;
  insert into public.ledger_ops (id, kid_id, kind, vault, now_amt, alloc, note, created_by)
  values (p_op_id, p_kid, 'correction', coalesce(p_vault, 0), coalesce(p_now, 0),
          case when p_vault < 0 then p_alloc end, nullif(btrim(p_note), ''), (select auth.uid()));
  perform private.bump(p_kid);
  return private.kid_json(p_kid, true);
end $$;

-- Sprawdza i zapisuje rozbicie wypłaty na kapitał wpłat.
create or replace function private.apply_alloc(p_kid uuid, p_amount bigint, p_alloc jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_free bigint; v_sum bigint := 0; e record; v_left bigint;
begin
  if p_alloc is null or jsonb_typeof(p_alloc) <> 'object' then raise exception 'alloc_invalid' using errcode = '22023'; end if;
  v_free := coalesce((p_alloc->>'free')::bigint, 0);
  if v_free < 0 then raise exception 'alloc_invalid' using errcode = '22023'; end if;
  for e in select key, value from jsonb_each_text(coalesce(p_alloc->'principal', '{}'::jsonb)) loop
    if e.value::bigint <= 0 then raise exception 'alloc_invalid' using errcode = '22023'; end if;
    select principal_left into v_left from public.ledger_ops
      where id = e.key::uuid and kid_id = p_kid and kind = 'deposit' for update;
    if v_left is null or v_left < e.value::bigint then raise exception 'alloc_invalid' using errcode = '22023'; end if;
    update public.ledger_ops set principal_left = principal_left - e.value::bigint where id = e.key::uuid;
    v_sum := v_sum + e.value::bigint;
  end loop;
  if v_free + v_sum <> p_amount then raise exception 'alloc_invalid' using errcode = '22023'; end if;
end $$;

-- Wydatek z puli „Na teraz” – dostępny od razu.
drop function if exists public.spend_now(uuid, uuid, uuid, bigint, bigint, text);
create function public.spend_now(p_session uuid, p_kid uuid, p_op_id uuid, p_expected_rev bigint, p_amount bigint, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_parent(p_kid, p_session);
  perform private.lock_kid(p_kid, null);
  if exists (select 1 from public.ledger_ops where id = p_op_id and kid_id = p_kid) then return private.kid_json(p_kid, true); end if;
  perform private.lock_kid(p_kid, p_expected_rev);
  if p_amount is null or p_amount <= 0 or p_amount % 10000 <> 0 then raise exception 'amount_invalid' using errcode = '22023'; end if;
  if private.now_pool(p_kid) < p_amount then raise exception 'now_insufficient' using errcode = '22023'; end if;
  insert into public.ledger_ops (id, kid_id, kind, now_amt, note, created_by)
  values (p_op_id, p_kid, 'now_out', p_amount, nullif(btrim(p_note), ''), (select auth.uid()));
  perform private.bump(p_kid);
  return private.kid_json(p_kid, true);
end $$;

-- Zatwierdzenie wypłaty: po 24 h od wniosku, przy aktualnym stanie (rev) i poprawnym rozbiciu.
drop function if exists public.approve_withdrawal(uuid, uuid, uuid, bigint, jsonb);
create function public.approve_withdrawal(p_session uuid, p_request uuid, p_op_id uuid, p_expected_rev bigint, p_alloc jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select * into r from public.withdrawal_requests where id = p_request;
  if r.id is null then raise exception 'request_unknown' using errcode = 'P0002'; end if;
  perform private.assert_parent(r.kid_id, p_session);
  perform private.lock_kid(r.kid_id, null);
  select * into r from public.withdrawal_requests where id = p_request for update;
  if r.status = 'approved' and r.op_id = p_op_id then return private.kid_json(r.kid_id, true); end if; -- ponowienie
  if r.status <> 'pending' then raise exception 'request_closed' using errcode = '22023'; end if;
  if now() < r.created_at + interval '24 hours' then raise exception 'request_too_early' using errcode = '22023'; end if;
  perform private.lock_kid(r.kid_id, p_expected_rev);
  perform private.apply_alloc(r.kid_id, r.amount, p_alloc);
  insert into public.ledger_ops (id, kid_id, kind, vault, alloc, request_id, created_by)
  values (p_op_id, r.kid_id, 'withdrawal', -r.amount, p_alloc, r.id, (select auth.uid()));
  update public.withdrawal_requests set status = 'approved', decided_at = now(), decided_by = (select auth.uid()), op_id = p_op_id
  where id = r.id;
  perform private.bump(r.kid_id);
  return private.kid_json(r.kid_id, true);
end $$;

drop function if exists public.reject_withdrawal(uuid, uuid);
create function public.reject_withdrawal(p_session uuid, p_request uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select * into r from public.withdrawal_requests where id = p_request;
  if r.id is null then raise exception 'request_unknown' using errcode = 'P0002'; end if;
  perform private.assert_parent(r.kid_id, p_session);
  perform private.lock_kid(r.kid_id, null);
  update public.withdrawal_requests set status = 'rejected', decided_at = now(), decided_by = (select auth.uid())
  where id = r.id and status = 'pending';
  if found then perform private.bump(r.kid_id); end if;
  return private.kid_json(r.kid_id, true);
end $$;

drop function if exists public.save_plan(uuid, uuid, integer[], integer, integer);
create function public.save_plan(p_session uuid, p_kid uuid, p_th integer[], p_rate integer, p_bonus_pct integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_parent(p_kid, p_session);
  perform private.lock_kid(p_kid, null);
  perform private.validate_plan(p_th, p_rate);
  update public.kids set
    plan = jsonb_build_object('v', coalesce((plan->>'v')::int, 0) + 1, 'th', to_jsonb(p_th), 'rate', p_rate),
    settings = case when p_bonus_pct is null then settings
                    else settings || jsonb_build_object('bonusPct', greatest(0, least(50, p_bonus_pct))) end,
    rev = rev + 1
  where id = p_kid;
  return private.kid_json(p_kid, true);
end $$;

drop function if exists public.save_schedule(uuid, uuid, jsonb);
create function public.save_schedule(p_session uuid, p_kid uuid, p_schedule jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_parent(p_kid, p_session);
  if p_schedule is not null and (
      jsonb_typeof(p_schedule) <> 'object'
      or coalesce((p_schedule->>'amount')::bigint, 0) <= 0
      or (p_schedule->>'amount')::bigint % 10000 <> 0
      or coalesce(p_schedule->>'every', '') not in ('week', 'month')
      or coalesce((p_schedule->>'vaultPct')::int, 100) not between 0 and 100) then
    raise exception 'schedule_invalid' using errcode = '22023';
  end if;
  update public.kids set schedule = case when p_schedule is null then null else jsonb_build_object(
      'amount', (p_schedule->>'amount')::bigint, 'every', p_schedule->>'every',
      'vaultPct', coalesce((p_schedule->>'vaultPct')::int, 100)) end,
    rev = rev + 1 where id = p_kid;
  return private.kid_json(p_kid, true);
end $$;

drop function if exists public.save_dream(uuid, uuid, integer, text, numeric, text);
create function public.save_dream(p_session uuid, p_kid uuid, p_slot integer, p_name text, p_price numeric, p_img text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_parent(p_kid, p_session);
  if p_slot not between 0 and 2 or p_price is null or p_price <= 0 or p_price > 1000000 then raise exception 'dream_invalid' using errcode = '22023'; end if;
  insert into public.dreams (kid_id, slot, name, price, img, updated_at)
  values (p_kid, p_slot, btrim(p_name), round(p_price, 2), nullif(p_img, ''), now())
  on conflict (kid_id, slot) do update set name = excluded.name, price = excluded.price, img = excluded.img, updated_at = now();
  perform private.bump(p_kid);
  return private.kid_json(p_kid, true);
end $$;

-- ---------------------------------------------------------------------
--  Wnioski o wypłatę i „widziane” skrzynie (dziecko lub rodzic)
-- ---------------------------------------------------------------------
create or replace function private.request_withdrawal(p_kid uuid, p_id uuid, p_amount bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_kid(p_kid, null);
  if exists (select 1 from public.withdrawal_requests where id = p_id) then
    if not exists (select 1 from public.withdrawal_requests where id = p_id and kid_id = p_kid) then raise exception 'op_conflict' using errcode = '23505'; end if;
    return; -- ponowienie
  end if;
  if p_amount is null or p_amount <= 0 or p_amount % 10000 <> 0 or p_amount > private.vault_upper_bound(p_kid) then
    raise exception 'amount_invalid' using errcode = '22023';
  end if;
  if exists (select 1 from public.withdrawal_requests where kid_id = p_kid and status = 'pending') then
    raise exception 'request_pending' using errcode = '22023';
  end if;
  insert into public.withdrawal_requests (id, kid_id, amount) values (p_id, p_kid, p_amount);
  perform private.bump(p_kid);
end $$;

create or replace function private.cancel_withdrawal(p_kid uuid, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_kid(p_kid, null);
  update public.withdrawal_requests set status = 'cancelled', decided_at = now()
  where id = p_id and kid_id = p_kid and status = 'pending';
  if found then perform private.bump(p_kid); end if;
end $$;

drop function if exists public.request_withdrawal(uuid, uuid, bigint);
create function public.request_withdrawal(p_kid uuid, p_id uuid, p_amount bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_kid_member(p_kid);
  perform private.request_withdrawal(p_kid, p_id, p_amount);
  return private.kid_json(p_kid, true);
end $$;

drop function if exists public.request_withdrawal_by_token(uuid, uuid, bigint);
create function public.request_withdrawal_by_token(p_token uuid, p_id uuid, p_amount bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_kid uuid := private.kid_by_token(p_token);
begin
  perform private.request_withdrawal(v_kid, p_id, p_amount);
  return private.kid_json(v_kid, false);
end $$;

drop function if exists public.cancel_withdrawal(uuid, uuid);
create function public.cancel_withdrawal(p_kid uuid, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_kid_member(p_kid);
  perform private.cancel_withdrawal(p_kid, p_id);
  return private.kid_json(p_kid, true);
end $$;

drop function if exists public.cancel_withdrawal_by_token(uuid, uuid);
create function public.cancel_withdrawal_by_token(p_token uuid, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_kid uuid := private.kid_by_token(p_token);
begin
  perform private.cancel_withdrawal(v_kid, p_id);
  return private.kid_json(v_kid, false);
end $$;

drop function if exists public.mark_seen(uuid, bigint);
create function public.mark_seen(p_kid uuid, p_until bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_kid_member(p_kid);
  update public.kids set seen_until = greatest(seen_until, least(now(), to_timestamp(p_until / 1000.0))) where id = p_kid;
end $$;

drop function if exists public.mark_seen_by_token(uuid, bigint);
create function public.mark_seen_by_token(p_token uuid, p_until bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.kids set seen_until = greatest(seen_until, least(now(), to_timestamp(p_until / 1000.0)))
  where id = private.kid_by_token(p_token);
end $$;

-- ---------------------------------------------------------------------
--  Jednorazowe przeniesienie wpłat z Rodzinobanku (bezpieczne do ponowienia).
--  Bieżąca kwota starej wpłaty (po dawnych wypłatach) staje się wpłatą
--  z oryginalną datą i domyślnym planem 6 miesięcy.
-- ---------------------------------------------------------------------
insert into public.ledger_ops (id, kid_id, kind, ts, vault, now_amt, gift_total, plan, principal_left, legacy_id, created_by, created_at)
select gen_random_uuid(), d.kid_id, 'deposit', date_trunc('milliseconds', d.ts),
       (round(d.amount * 100) * 10000)::bigint, 0, (round(d.amount * 100) * 10000)::bigint,
       k.plan, (round(d.amount * 100) * 10000)::bigint, d.id, d.created_by, d.created_at
from public.deposits d join public.kids k on k.id = d.kid_id
where round(d.amount * 100) > 0
on conflict (legacy_id) do nothing;

-- ---------------------------------------------------------------------
--  Uprawnienia do funkcji
-- ---------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;
revoke usage on schema private from public, anon, authenticated;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'my_family','create_family','join_family','set_pin','verify_pin','end_parent_session','add_kid','rename_kid',
      'regenerate_kid_link','kid_state','kid_version','add_deposit','void_deposit','add_correction','spend_now',
      'approve_withdrawal','reject_withdrawal','save_plan','save_schedule','save_dream','request_withdrawal',
      'cancel_withdrawal','mark_seen','kid_state_by_token','kid_version_by_token','request_withdrawal_by_token',
      'cancel_withdrawal_by_token','mark_seen_by_token')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.proname like '%by_token' then
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    else
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

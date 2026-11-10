-- =====================================================================
--  Groszaki – migracja z Rodzinobanku
--
--  Uruchamia się NA ISTNIEJĄCEJ bazie (po supabase/schema.sql).
--  Dodaje nowe tabele i funkcje; starych tabel (deposits, withdrawals,
--  dreams) NIE usuwa ani nie zmienia – zostają jako archiwum.
--  Skrypt można uruchomić ponownie: dane przenosi tylko raz.
--
--  Model pieniędzy (tak samo jak src/groszaki/finanse.js):
--   * kwoty w całkowitych mikrogroszach (1 zł = 1 000 000 µg),
--   * źródło prawdy: dziennik zdarzeń (kid_events), saldo zawsze liczone,
--   * każde zdarzenie ma id nadane przez aplikację – ponowiony zapis
--     z tym samym id niczego nie dubluje,
--   * oprocentowanie progowe, składane, kapitalizacja dzienna w strefie
--     Europe/Warsaw; zmiana stawek tylko od przyszłej północy.
--
--  Bezpieczeństwo: tabele zamknięte dla API, dostęp tylko przez funkcje.
--  Pieniądze zmienia wyłącznie zalogowany rodzic z rodziny dziecka.
--  Dziecko (tajny link) ogląda swój skarbiec i edytuje swoje cele.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Tabele
-- ---------------------------------------------------------------------
alter table public.kids add column if not exists tz text not null default 'Europe/Warsaw';
alter table public.kids add column if not exists ferie_start date;
alter table public.kids add column if not exists ferie_end date;
alter table public.kids add column if not exists updated_at timestamptz not null default now();

create table if not exists public.kid_events (
  id          uuid primary key,
  kid_id      uuid not null references public.kids(id) on delete cascade,
  type        text not null check (type in ('deposit', 'withdrawal', 'adjustment', 'rate')),
  ts          timestamptz not null,
  amount      bigint,
  rate_low    double precision,
  rate_high   double precision,
  threshold   bigint,
  note        text check (note is null or char_length(note) <= 80),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  deleted_by  uuid references auth.users(id) on delete set null,
  check (
    (type = 'rate' and amount is null and rate_low between 0 and 1 and rate_high between 0 and 1 and threshold >= 0)
    or (type in ('deposit', 'withdrawal') and amount > 0 and amount % 10000 = 0 and rate_low is null)
    or (type = 'adjustment' and amount <> 0 and amount % 10000 = 0 and rate_low is null)
  )
);
create index if not exists kid_events_kid_idx on public.kid_events(kid_id, ts);

create table if not exists public.kid_goals (
  id          uuid primary key,
  kid_id      uuid not null references public.kids(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  amount      bigint not null check (amount > 0 and amount <= 100000000000),
  icon        text check (icon is null or char_length(icon) <= 16),
  img         text check (img is null or char_length(img) <= 600000),
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists kid_goals_kid_idx on public.kid_goals(kid_id);

create table if not exists public.kid_plans (
  id          uuid primary key,
  kid_id      uuid not null references public.kids(id) on delete cascade,
  amount      bigint not null check (amount > 0 and amount % 10000 = 0),
  every       text not null check (every in ('week', '2weeks', 'month')),
  start_date  date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists kid_plans_kid_idx on public.kid_plans(kid_id);

create table if not exists public.kid_calendar (
  id          uuid primary key,
  kid_id      uuid not null references public.kids(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  day         date not null,
  icon        text check (icon is null or char_length(icon) <= 16),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists kid_calendar_kid_idx on public.kid_calendar(kid_id);

-- znacznik jednorazowego przeniesienia danych
create table if not exists private.migrations (name text primary key, applied_at timestamptz not null default now());

alter table public.kid_events   enable row level security;
alter table public.kid_goals    enable row level security;
alter table public.kid_plans    enable row level security;
alter table public.kid_calendar enable row level security;
revoke all on public.kid_events, public.kid_goals, public.kid_plans, public.kid_calendar from anon, authenticated;

-- ---------------------------------------------------------------------
--  Obliczenia (odpowiednik src/groszaki/finanse.js)
-- ---------------------------------------------------------------------

-- Stawka dzienna z miesięcznej.
create or replace function private.daily_rate(p_monthly double precision) returns double precision
language sql immutable as $$ select power(1 + p_monthly, 1 / 30.4375::double precision) - 1 $$;

-- Saldo dziecka w chwili p_at (µg) z dodatkowym, jeszcze niezapisanym zdarzeniem
-- (do sprawdzenia przed zapisem). Zwraca saldo końcowe i najniższe saldo po
-- którymkolwiek zdarzeniu (żeby wsteczna wypłata nie zrobiła debetu).
create or replace function private.simulate(
  p_kid uuid, p_at timestamptz,
  p_extra_type text default null, p_extra_ts timestamptz default null, p_extra_amount bigint default null,
  out balance bigint, out min_after bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text;
  e record;
  v_bal bigint := 0;
  v_acc double precision := 0;
  v_low double precision := 0.05;
  v_high double precision := 0.03;
  v_thr bigint := 1000000000;
  v_dl double precision := private.daily_rate(0.05);
  v_dh double precision := private.daily_rate(0.03);
  v_day date;
  v_ds timestamptz;
  v_de timestamptz;
  v_seg timestamptz;
  v_len double precision;
  v_started boolean := false;
  v_cap bigint;
  v_lowpart double precision;
begin
  select k.tz into v_tz from public.kids k where k.id = p_kid;
  min_after := 0;
  for e in
    select x.type, x.ts, x.amount, x.rate_low, x.rate_high, x.threshold from (
      select ev.id::text as id, ev.type, ev.ts, ev.amount, ev.rate_low, ev.rate_high, ev.threshold
        from public.kid_events ev where ev.kid_id = p_kid and ev.deleted_at is null and ev.ts <= p_at
      union all
      select '~extra', p_extra_type, p_extra_ts, p_extra_amount, null, null, null
        where p_extra_type is not null and p_extra_ts <= p_at
    ) x
    order by x.ts, case x.type when 'rate' then 0 when 'deposit' then 1 when 'adjustment' then 2 else 3 end, x.id
  loop
    if not v_started then
      v_day := (e.ts at time zone v_tz)::date;
      v_ds := v_day::timestamp at time zone v_tz;
      v_de := (v_day + 1)::timestamp at time zone v_tz;
      v_seg := v_ds;
      v_started := true;
    end if;
    -- domknij pełne doby przed zdarzeniem
    while e.ts >= v_de loop
      v_len := extract(epoch from (v_de - v_ds)) * 1000;
      v_lowpart := least(v_bal, v_thr);
      if v_bal > 0 then v_acc := v_acc + (v_lowpart * v_dl + (v_bal - v_lowpart) * v_dh) * (extract(epoch from (v_de - v_seg)) * 1000) / v_len; end if;
      v_cap := floor(v_acc);
      v_bal := v_bal + v_cap;
      v_acc := 0;
      v_day := v_day + 1;
      v_ds := v_de;
      v_de := (v_day + 1)::timestamp at time zone v_tz;
      v_seg := v_ds;
    end loop;
    v_len := extract(epoch from (v_de - v_ds)) * 1000;
    v_lowpart := least(v_bal, v_thr);
    if v_bal > 0 then v_acc := v_acc + (v_lowpart * v_dl + (v_bal - v_lowpart) * v_dh) * (extract(epoch from (e.ts - v_seg)) * 1000) / v_len; end if;
    v_seg := e.ts;
    if e.type = 'deposit' then v_bal := v_bal + e.amount;
    elsif e.type = 'withdrawal' then v_bal := v_bal - e.amount;
    elsif e.type = 'adjustment' then v_bal := v_bal + e.amount;
    elsif e.type = 'rate' then
      v_low := e.rate_low; v_high := e.rate_high; v_thr := e.threshold;
      v_dl := private.daily_rate(v_low); v_dh := private.daily_rate(v_high);
    end if;
    if e.type <> 'rate' then min_after := least(min_after, v_bal + floor(v_acc)::bigint); end if;
  end loop;
  if not v_started then balance := 0; return; end if;
  while p_at >= v_de loop
    v_len := extract(epoch from (v_de - v_ds)) * 1000;
    v_lowpart := least(v_bal, v_thr);
    if v_bal > 0 then v_acc := v_acc + (v_lowpart * v_dl + (v_bal - v_lowpart) * v_dh) * (extract(epoch from (v_de - v_seg)) * 1000) / v_len; end if;
    v_cap := floor(v_acc);
    v_bal := v_bal + v_cap;
    v_acc := 0;
    v_day := v_day + 1;
    v_ds := v_de;
    v_de := (v_day + 1)::timestamp at time zone v_tz;
    v_seg := v_ds;
  end loop;
  v_len := extract(epoch from (v_de - v_ds)) * 1000;
  v_lowpart := least(v_bal, v_thr);
  if v_bal > 0 then v_acc := v_acc + (v_lowpart * v_dl + (v_bal - v_lowpart) * v_dh) * (extract(epoch from (p_at - v_seg)) * 1000) / v_len; end if;
  balance := v_bal + floor(v_acc)::bigint;
end $$;

-- Stara „Premia za cierpliwość” – tylko do jednorazowego przeniesienia sald.
create or replace function private.legacy_value(p_amount numeric, p_days double precision) returns double precision
language plpgsql immutable as $$
declare
  md constant double precision := 365.0 / 12;
  cyc constant double precision := md * 6;
  tiers double precision[] := array[0, 0.05, 0.10, 0.18, 0.27, 0.38, 0.50];
  n integer; rest double precision; m double precision; i integer; b double precision;
begin
  if p_days <= 0 then return p_amount; end if;
  n := floor(p_days / cyc);
  rest := p_days - n * cyc;
  m := rest / md;
  if m >= 6 then b := 0.5;
  else i := floor(m); b := tiers[i + 1] + (tiers[i + 2] - tiers[i + 1]) * (m - i); end if;
  return p_amount * power(1.5, n) * (1 + b);
end $$;

-- ---------------------------------------------------------------------
--  Stan dziecka (JSON dla aplikacji)
-- ---------------------------------------------------------------------
create or replace function private.gr_version(p_kid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select md5(concat_ws('|',
    (select k.name || k.updated_at::text from public.kids k where k.id = p_kid),
    (select count(*)::text || ':' || coalesce(max(greatest(created_at, coalesce(deleted_at, created_at)))::text, '') from public.kid_events where kid_id = p_kid),
    (select count(*)::text || ':' || coalesce(max(updated_at)::text, '') from public.kid_goals where kid_id = p_kid),
    (select count(*)::text || ':' || coalesce(max(updated_at)::text, '') from public.kid_plans where kid_id = p_kid),
    (select count(*)::text || ':' || coalesce(max(updated_at)::text, '') from public.kid_calendar where kid_id = p_kid)
  ));
$$;

create or replace function private.gr_json(p_kid uuid, p_parent boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'kid', jsonb_build_object('id', k.id, 'name', k.name, 'tz', k.tz,
                              'view_token', case when p_parent then k.view_token end,
                              'ferie', case when k.ferie_start is null then null
                                            else jsonb_build_object('start', k.ferie_start, 'end', k.ferie_end) end),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', e.id, 'type', e.type, 'ts', (extract(epoch from e.ts) * 1000)::bigint, 'amount', e.amount,
                 'rates', case when e.type = 'rate' then jsonb_build_object('low', e.rate_low, 'high', e.rate_high, 'threshold', e.threshold) end,
                 'note', e.note) order by e.ts)
               from public.kid_events e where e.kid_id = k.id and e.deleted_at is null), '[]'::jsonb),
    'goals', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'amount', g.amount, 'icon', g.icon, 'img', g.img)
               order by g.sort, g.created_at) from public.kid_goals g where g.kid_id = k.id), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'amount', p.amount, 'every', p.every, 'start', p.start_date)
               order by p.created_at) from public.kid_plans p where p.kid_id = k.id), '[]'::jsonb),
    'calendar', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'day', c.day, 'icon', c.icon)
               order by c.day) from public.kid_calendar c where c.kid_id = k.id), '[]'::jsonb),
    'server_now', (extract(epoch from now()) * 1000)::bigint,
    'version', private.gr_version(k.id)
  )
  from public.kids k where k.id = p_kid;
$$;

create or replace function private.touch_kid(p_kid uuid) returns void
language sql security definer set search_path = '' as $$
  update public.kids set updated_at = now() where id = p_kid;
$$;

create or replace function private.seed_goals(p_kid uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.kid_goals (id, kid_id, name, amount, icon, sort)
  select gen_random_uuid(), p_kid, x.name, x.amount, x.icon, x.sort
  from (values ('Klocki', 89000000::bigint, '🧩', 0), ('Hulajnoga', 349000000, '🛴', 1)) as x(name, amount, icon, sort)
  where not exists (select 1 from public.kid_goals g where g.kid_id = p_kid);
$$;

-- ---------------------------------------------------------------------
--  RPC dla Rodzica
-- ---------------------------------------------------------------------
drop function if exists public.gr_kid_state(uuid);
create function public.gr_kid_state(p_kid uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_kid_access(p_kid);
  return private.gr_json(p_kid, true);
end $$;

drop function if exists public.gr_kid_version(uuid);
create function public.gr_kid_version(p_kid uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_kid_access(p_kid);
  return private.gr_version(p_kid);
end $$;

-- Wpłata, wypłata albo korekta. p_id nadaje aplikacja (ponowienie = bez zmian).
drop function if exists public.gr_add_money(uuid, uuid, text, timestamptz, bigint, text);
create function public.gr_add_money(p_kid uuid, p_id uuid, p_type text, p_ts timestamptz, p_amount bigint, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ts timestamptz := coalesce(p_ts, now());
  v_sim record;
  v_existing public.kid_events;
begin
  perform private.assert_kid_access(p_kid);
  select * into v_existing from public.kid_events where id = p_id;
  if found then
    if v_existing.kid_id <> p_kid or v_existing.type <> p_type or v_existing.amount <> p_amount then
      raise exception 'Ten identyfikator jest już zajęty' using errcode = '23505';
    end if;
    return jsonb_build_object('id', p_id, 'duplicate', true);
  end if;
  if p_type not in ('deposit', 'withdrawal', 'adjustment') then raise exception 'Nieznany rodzaj operacji' using errcode = '22023'; end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 100000000000 then raise exception 'Nieprawidłowa kwota' using errcode = '22023'; end if;
  if p_type <> 'adjustment' and p_amount < 0 then raise exception 'Nieprawidłowa kwota' using errcode = '22023'; end if;
  if p_amount % 10000 <> 0 then raise exception 'Kwota musi być w pełnych groszach' using errcode = '22023'; end if;
  if v_ts > now() + interval '2 minutes' then raise exception 'Data nie może być w przyszłości' using errcode = '22023'; end if;
  if v_ts < now() - interval '10 years' then raise exception 'Data jest zbyt odległa' using errcode = '22023'; end if;
  if p_type = 'withdrawal' or p_amount < 0 then
    select * into v_sim from private.simulate(p_kid, now() + interval '2 minutes', p_type, least(v_ts, now()), p_amount);
    -- tolerancja 10 µg na różnice zaokrągleń między przeglądarką a bazą
    if v_sim.min_after < -10 then raise exception 'Za mało pieniędzy w Skarbcu' using errcode = '22023'; end if;
  end if;
  insert into public.kid_events (id, kid_id, type, ts, amount, note, created_by)
  values (p_id, p_kid, p_type, least(v_ts, now()), p_amount, nullif(btrim(p_note), ''), (select auth.uid()));
  return jsonb_build_object('id', p_id, 'duplicate', false);
end $$;

-- Zmiana oprocentowania od północy wybranego dnia (najwcześniej jutro).
drop function if exists public.gr_set_rates(uuid, uuid, date, double precision, double precision, bigint);
create function public.gr_set_rates(p_kid uuid, p_id uuid, p_from date, p_low double precision, p_high double precision, p_threshold bigint)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_tz text; v_today date;
begin
  perform private.assert_kid_access(p_kid);
  if exists (select 1 from public.kid_events where id = p_id) then return jsonb_build_object('id', p_id, 'duplicate', true); end if;
  select tz into v_tz from public.kids where id = p_kid;
  v_today := (now() at time zone v_tz)::date;
  if p_from is null or p_from <= v_today then raise exception 'Zmiana może obowiązywać najwcześniej od jutra' using errcode = '22023'; end if;
  if p_low is null or p_low < 0 or p_low > 1 or p_high is null or p_high < 0 or p_high > 1 then raise exception 'Nieprawidłowa stawka' using errcode = '22023'; end if;
  if p_threshold is null or p_threshold < 0 then raise exception 'Nieprawidłowy próg' using errcode = '22023'; end if;
  insert into public.kid_events (id, kid_id, type, ts, rate_low, rate_high, threshold, created_by)
  values (p_id, p_kid, 'rate', p_from::timestamp at time zone v_tz, p_low, p_high, p_threshold, (select auth.uid()));
  return jsonb_build_object('id', p_id, 'duplicate', false);
end $$;

-- Usunięcie pomyłki: operacji pieniężnej albo zmiany stawek, która jeszcze nie weszła w życie.
-- Wpis zostaje w bazie z datą usunięcia (ślad dla rodziców).
drop function if exists public.gr_delete_event(uuid, uuid);
create function public.gr_delete_event(p_kid uuid, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.kid_events; v_sim record;
begin
  perform private.assert_kid_access(p_kid);
  select * into v from public.kid_events where id = p_id and kid_id = p_kid and deleted_at is null for update;
  if not found then return; end if;
  if v.type = 'rate' and v.ts <= now() then raise exception 'Ta zmiana stawek już obowiązuje – ustaw nową od jutra' using errcode = '22023'; end if;
  update public.kid_events set deleted_at = now(), deleted_by = (select auth.uid()) where id = p_id;
  -- usunięcie wpłaty nie może zrobić debetu
  select * into v_sim from private.simulate(p_kid, now() + interval '2 minutes');
  if v_sim.min_after < -10 then raise exception 'Po usunięciu tej wpłaty saldo byłoby ujemne' using errcode = '22023'; end if;
end $$;

drop function if exists public.gr_save_plan(uuid, uuid, bigint, text, date);
create function public.gr_save_plan(p_kid uuid, p_id uuid, p_amount bigint, p_every text, p_start date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_kid_access(p_kid);
  insert into public.kid_plans (id, kid_id, amount, every, start_date) values (p_id, p_kid, p_amount, p_every, p_start)
  on conflict (id) do update set amount = excluded.amount, every = excluded.every, start_date = excluded.start_date, updated_at = now()
  where public.kid_plans.kid_id = p_kid;
end $$;

drop function if exists public.gr_delete_plan(uuid, uuid);
create function public.gr_delete_plan(p_kid uuid, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_kid_access(p_kid);
  delete from public.kid_plans where id = p_id and kid_id = p_kid;
  perform private.touch_kid(p_kid);
end $$;

drop function if exists public.gr_save_calendar(uuid, uuid, text, date, text);
create function public.gr_save_calendar(p_kid uuid, p_id uuid, p_name text, p_day date, p_icon text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_kid_access(p_kid);
  insert into public.kid_calendar (id, kid_id, name, day, icon) values (p_id, p_kid, btrim(p_name), p_day, nullif(p_icon, ''))
  on conflict (id) do update set name = excluded.name, day = excluded.day, icon = excluded.icon, updated_at = now()
  where public.kid_calendar.kid_id = p_kid;
end $$;

drop function if exists public.gr_delete_calendar(uuid, uuid);
create function public.gr_delete_calendar(p_kid uuid, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_kid_access(p_kid);
  delete from public.kid_calendar where id = p_id and kid_id = p_kid;
  perform private.touch_kid(p_kid);
end $$;

-- Termin ferii (oba null = ferie ukryte na Drodze przez rok).
drop function if exists public.gr_set_ferie(uuid, date, date);
create function public.gr_set_ferie(p_kid uuid, p_start date, p_end date) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_kid_access(p_kid);
  if (p_start is null) <> (p_end is null) or p_end < p_start then raise exception 'Nieprawidłowy termin ferii' using errcode = '22023'; end if;
  update public.kids set ferie_start = p_start, ferie_end = p_end, updated_at = now() where id = p_kid;
end $$;

-- Cele: rodzic i dziecko (wspólna funkcja wewnętrzna)
create or replace function private.save_goal(p_kid uuid, p_id uuid, p_name text, p_amount bigint, p_icon text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_amount is null or p_amount <= 0 or p_amount % 10000 <> 0 then raise exception 'Nieprawidłowa kwota' using errcode = '22023'; end if;
  if (select count(*) from public.kid_goals where kid_id = p_kid) >= 30
     and not exists (select 1 from public.kid_goals where id = p_id) then
    raise exception 'Za dużo celów' using errcode = '22023';
  end if;
  insert into public.kid_goals (id, kid_id, name, amount, icon, sort)
  values (p_id, p_kid, btrim(p_name), p_amount, nullif(p_icon, ''),
          coalesce((select max(sort) + 1 from public.kid_goals where kid_id = p_kid), 0))
  on conflict (id) do update set name = excluded.name, amount = excluded.amount, icon = excluded.icon, updated_at = now()
  where public.kid_goals.kid_id = p_kid;
  if not found and exists (select 1 from public.kid_goals where id = p_id and kid_id <> p_kid) then
    raise exception 'Ten identyfikator jest już zajęty' using errcode = '23505';
  end if;
end $$;

create or replace function private.delete_goal(p_kid uuid, p_id uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.kid_goals where id = p_id and kid_id = p_kid;
  update public.kids set updated_at = now() where id = p_kid;
$$;

drop function if exists public.gr_save_goal(uuid, uuid, text, bigint, text);
create function public.gr_save_goal(p_kid uuid, p_id uuid, p_name text, p_amount bigint, p_icon text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_kid_access(p_kid);
  perform private.save_goal(p_kid, p_id, p_name, p_amount, p_icon);
end $$;

drop function if exists public.gr_delete_goal(uuid, uuid);
create function public.gr_delete_goal(p_kid uuid, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_kid_access(p_kid);
  perform private.delete_goal(p_kid, p_id);
end $$;

-- ---------------------------------------------------------------------
--  RPC dla Dziecka (tajny link)
-- ---------------------------------------------------------------------
drop function if exists public.gr_kid_state_by_token(uuid);
create function public.gr_kid_state_by_token(p_token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.gr_json(private.kid_by_token(p_token), false);
$$;

drop function if exists public.gr_kid_version_by_token(uuid);
create function public.gr_kid_version_by_token(p_token uuid) returns text
language sql stable security definer set search_path = '' as $$
  select private.gr_version(private.kid_by_token(p_token));
$$;

drop function if exists public.gr_save_goal_by_token(uuid, uuid, text, bigint, text);
create function public.gr_save_goal_by_token(p_token uuid, p_id uuid, p_name text, p_amount bigint, p_icon text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.save_goal(private.kid_by_token(p_token), p_id, p_name, p_amount, p_icon);
end $$;

drop function if exists public.gr_delete_goal_by_token(uuid, uuid);
create function public.gr_delete_goal_by_token(p_token uuid, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.delete_goal(private.kid_by_token(p_token), p_id);
end $$;

-- ---------------------------------------------------------------------
--  Nowe dzieci dostają przykładowe cele zamiast 3 marzeń
-- ---------------------------------------------------------------------
create or replace function private.seed_dreams(p_kid uuid) returns void
language sql security definer set search_path = '' as $$
  select private.seed_goals(p_kid);
$$;

-- ---------------------------------------------------------------------
--  Jednorazowe przeniesienie danych z Rodzinobanku
-- ---------------------------------------------------------------------
do $$
declare k record; v_val double precision; v_micro bigint;
begin
  if exists (select 1 from private.migrations where name = '20261110_groszaki') then return; end if;
  for k in select id from public.kids loop
    -- saldo otwierające = to, co pokazywała stara aplikacja (wpłaty z Premią za cierpliwość),
    -- w pełnych groszach w dół; od teraz liczy się już nowe oprocentowanie
    select coalesce(sum(private.legacy_value(d.amount, extract(epoch from (now() - d.ts)) / 86400.0)), 0)
      into v_val from public.deposits d where d.kid_id = k.id;
    v_micro := floor(v_val * 100) * 10000;
    if v_micro > 0 then
      insert into public.kid_events (id, kid_id, type, ts, amount, note)
      values (gen_random_uuid(), k.id, 'deposit', now(), v_micro, 'Przeniesione z Rodzinobanku');
    end if;
    -- marzenia → cele (z własnym zdjęciem, jeśli było)
    insert into public.kid_goals (id, kid_id, name, amount, img, icon, sort)
    select gen_random_uuid(), r.kid_id, r.name, round(r.price * 100)::bigint * 10000, r.img,
           case when r.img is null then '⭐' end, r.slot
    from public.dreams r where r.kid_id = k.id;
  end loop;
  insert into private.migrations (name) values ('20261110_groszaki');
end $$;

-- ---------------------------------------------------------------------
--  Uprawnienia
-- ---------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;

revoke all on function
  public.gr_kid_state(uuid), public.gr_kid_version(uuid),
  public.gr_add_money(uuid, uuid, text, timestamptz, bigint, text),
  public.gr_set_rates(uuid, uuid, date, double precision, double precision, bigint),
  public.gr_delete_event(uuid, uuid),
  public.gr_save_plan(uuid, uuid, bigint, text, date), public.gr_delete_plan(uuid, uuid),
  public.gr_save_calendar(uuid, uuid, text, date, text), public.gr_delete_calendar(uuid, uuid),
  public.gr_set_ferie(uuid, date, date),
  public.gr_save_goal(uuid, uuid, text, bigint, text), public.gr_delete_goal(uuid, uuid),
  public.gr_kid_state_by_token(uuid), public.gr_kid_version_by_token(uuid),
  public.gr_save_goal_by_token(uuid, uuid, text, bigint, text), public.gr_delete_goal_by_token(uuid, uuid)
from public, anon, authenticated;

grant execute on function
  public.gr_kid_state(uuid), public.gr_kid_version(uuid),
  public.gr_add_money(uuid, uuid, text, timestamptz, bigint, text),
  public.gr_set_rates(uuid, uuid, date, double precision, double precision, bigint),
  public.gr_delete_event(uuid, uuid),
  public.gr_save_plan(uuid, uuid, bigint, text, date), public.gr_delete_plan(uuid, uuid),
  public.gr_save_calendar(uuid, uuid, text, date, text), public.gr_delete_calendar(uuid, uuid),
  public.gr_set_ferie(uuid, date, date),
  public.gr_save_goal(uuid, uuid, text, bigint, text), public.gr_delete_goal(uuid, uuid)
to authenticated;

grant execute on function
  public.gr_kid_state_by_token(uuid), public.gr_kid_version_by_token(uuid),
  public.gr_save_goal_by_token(uuid, uuid, text, bigint, text), public.gr_delete_goal_by_token(uuid, uuid)
to anon, authenticated;

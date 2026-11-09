-- =====================================================================
--  Rodzinobank – wspólna baza w Supabase
--  Jak użyć: Supabase → SQL Editor → New query → wklej cały plik → Run.
--  Skrypt można uruchomić ponownie (najpierw usuwa stare funkcje).
--
--  Model bezpieczeństwa:
--  * Tabele są zamknięte dla API (brak uprawnień dla anon/authenticated).
--  * Cały dostęp idzie przez funkcje RPC, które same sprawdzają uprawnienia:
--      - Rodzic (zalogowany) widzi i zmienia tylko dzieci ze swojej rodziny.
--      - Dziecko (bez konta) używa tajnego linku z tokenem: może oglądać
--        swój skarbiec i zmieniać swoje 3 marzenia. Nie może wpłacać ani wypłacać.
-- =====================================================================

create schema if not exists private;

-- ---------------------------------------------------------------------
--  Tabele
-- ---------------------------------------------------------------------
create table if not exists public.families (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'Moja rodzina',
  join_code  text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at timestamptz not null default now()
);

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

create table if not exists public.deposits (
  id         uuid primary key default gen_random_uuid(),
  kid_id     uuid not null references public.kids(id) on delete cascade,
  ts         timestamptz not null default now(),
  amount     numeric(14,6) not null check (amount > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists deposits_kid_idx on public.deposits(kid_id);

create table if not exists public.dreams (
  kid_id     uuid not null references public.kids(id) on delete cascade,
  slot       smallint not null check (slot between 0 and 2),
  name       text not null check (char_length(name) between 1 and 40),
  price      numeric(12,2) not null check (price > 0),
  img        text check (img is null or char_length(img) <= 600000),
  updated_at timestamptz not null default now(),
  primary key (kid_id, slot)
);

create table if not exists public.withdrawals (
  id         uuid primary key default gen_random_uuid(),
  kid_id     uuid not null references public.kids(id) on delete cascade,
  amount     numeric(14,2) not null check (amount > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists withdrawals_kid_idx on public.withdrawals(kid_id);

-- Tabele dostępne wyłącznie przez funkcje poniżej
alter table public.families       enable row level security;
alter table public.family_members enable row level security;
alter table public.kids           enable row level security;
alter table public.deposits       enable row level security;
alter table public.dreams         enable row level security;
alter table public.withdrawals    enable row level security;
revoke all on public.families, public.family_members, public.kids, public.deposits, public.dreams, public.withdrawals from anon, authenticated;

-- ---------------------------------------------------------------------
--  Funkcje pomocnicze (schemat private – niewidoczny w API)
-- ---------------------------------------------------------------------
create or replace function private.my_family_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.family_id from public.family_members m
  where m.user_id = (select auth.uid())
  order by m.created_at limit 1;
$$;

create or replace function private.assert_kid_access(p_kid uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Musisz się zalogować' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.kids k
    join public.family_members m on m.family_id = k.family_id
    where k.id = p_kid and m.user_id = (select auth.uid())
  ) then
    raise exception 'Brak dostępu do tego skarbca' using errcode = '42501';
  end if;
end $$;

create or replace function private.kid_by_token(p_token uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid;
begin
  select k.id into v from public.kids k where k.view_token = p_token;
  if v is null then
    raise exception 'Ten link już nie działa – poproś Rodzica o nowy' using errcode = '42501';
  end if;
  return v;
end $$;

create or replace function private.seed_dreams(p_kid uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.dreams (kid_id, slot, name, price) values
    (p_kid, 0, 'Klocki LEGO', 89),
    (p_kid, 1, 'Hulajnoga', 349),
    (p_kid, 2, 'Konsola do gier', 1499)
  on conflict do nothing;
$$;

-- Krótki „odcisk” stanu – urządzenia sprawdzają go co kilkanaście sekund
create or replace function private.kid_version(p_kid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select md5(concat_ws('|',
    (select k.name from public.kids k where k.id = p_kid),
    (select count(*)::text || ':' || coalesce(sum(amount), 0)::text || ':' || coalesce(max(created_at)::text, '') from public.deposits where kid_id = p_kid),
    (select coalesce(max(updated_at)::text, '') from public.dreams where kid_id = p_kid),
    (select count(*)::text from public.withdrawals where kid_id = p_kid)
  ));
$$;

create or replace function private.kid_json(p_kid uuid, p_with_token boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'kid', jsonb_build_object('id', k.id, 'name', k.name,
                              'view_token', case when p_with_token then k.view_token end),
    'deposits', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'ts', d.ts, 'amount', d.amount) order by d.ts)
                          from public.deposits d where d.kid_id = k.id), '[]'::jsonb),
    'dreams', coalesce((select jsonb_agg(jsonb_build_object('slot', r.slot, 'name', r.name, 'price', r.price, 'img', r.img) order by r.slot)
                        from public.dreams r where r.kid_id = k.id), '[]'::jsonb),
    'withdrawals', coalesce((select jsonb_agg(jsonb_build_object('ts', w.created_at, 'amount', w.amount) order by w.created_at desc)
                             from public.withdrawals w where w.kid_id = k.id), '[]'::jsonb),
    'version', private.kid_version(k.id)
  )
  from public.kids k where k.id = p_kid;
$$;

-- ---------------------------------------------------------------------
--  RPC dla Rodzica (zalogowany)
-- ---------------------------------------------------------------------
drop function if exists public.my_family();
create function public.my_family() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when f.id is null then null else jsonb_build_object(
    'id', f.id, 'name', f.name, 'join_code', f.join_code,
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
  if (select auth.uid()) is null then raise exception 'Musisz się zalogować' using errcode = '28000'; end if;
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
  if (select auth.uid()) is null then raise exception 'Musisz się zalogować' using errcode = '28000'; end if;
  select id into v_family from public.families where join_code = upper(btrim(p_code));
  if v_family is null then raise exception 'Nie znam takiego kodu rodziny' using errcode = 'P0002'; end if;
  insert into public.family_members (family_id, user_id) values (v_family, (select auth.uid())) on conflict do nothing;
  return public.my_family();
end $$;

drop function if exists public.add_kid(text);
create function public.add_kid(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_family uuid := private.my_family_id(); v_kid uuid;
begin
  if v_family is null then raise exception 'Najpierw załóż rodzinę' using errcode = '42501'; end if;
  insert into public.kids (family_id, name) values (v_family, btrim(p_name)) returning id into v_kid;
  perform private.seed_dreams(v_kid);
  return public.my_family();
end $$;

drop function if exists public.rename_kid(uuid, text);
create function public.rename_kid(p_kid uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_kid_access(p_kid);
  update public.kids set name = btrim(p_name) where id = p_kid;
end $$;

drop function if exists public.regenerate_kid_link(uuid);
create function public.regenerate_kid_link(p_kid uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  perform private.assert_kid_access(p_kid);
  update public.kids set view_token = gen_random_uuid() where id = p_kid returning view_token into v;
  return v;
end $$;

drop function if exists public.kid_state(uuid);
create function public.kid_state(p_kid uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_kid_access(p_kid);
  return private.kid_json(p_kid, true);
end $$;

drop function if exists public.kid_version(uuid);
create function public.kid_version(p_kid uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_kid_access(p_kid);
  return private.kid_version(p_kid);
end $$;

drop function if exists public.add_deposit(uuid, numeric, timestamptz);
create function public.add_deposit(p_kid uuid, p_amount numeric, p_ts timestamptz default now()) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  perform private.assert_kid_access(p_kid);
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then raise exception 'Nieprawidłowa kwota' using errcode = '22023'; end if;
  insert into public.deposits (kid_id, amount, ts, created_by)
  values (p_kid, round(p_amount, 2), least(coalesce(p_ts, now()), now()), (select auth.uid()))
  returning id into v;
  return v;
end $$;

drop function if exists public.delete_deposit(uuid);
create function public.delete_deposit(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_kid uuid;
begin
  select kid_id into v_kid from public.deposits where id = p_id;
  if v_kid is null then return; end if;
  perform private.assert_kid_access(v_kid);
  delete from public.deposits where id = p_id;
end $$;

-- Wypłata: aplikacja wylicza, które wpłaty zmniejszyć (od najmłodszych),
-- a baza sprawdza, że żadna kwota nie rośnie, i zapisuje wszystko naraz.
drop function if exists public.apply_withdrawal(uuid, numeric, jsonb);
create function public.apply_withdrawal(p_kid uuid, p_amount numeric, p_changes jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare c jsonb; v_id uuid; v_new numeric; v_old numeric;
begin
  perform private.assert_kid_access(p_kid);
  if p_amount is null or p_amount <= 0 then raise exception 'Nieprawidłowa kwota' using errcode = '22023'; end if;
  for c in select * from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) loop
    v_id := (c->>'id')::uuid;
    v_new := greatest(0, (c->>'amount')::numeric);
    select amount into v_old from public.deposits where id = v_id and kid_id = p_kid for update;
    if v_old is null then raise exception 'Nieznana wpłata' using errcode = 'P0002'; end if;
    if v_new > v_old then raise exception 'Wypłata nie może zwiększać wpłat' using errcode = '22023'; end if;
    if v_new < 0.000001 then delete from public.deposits where id = v_id;
    else update public.deposits set amount = v_new where id = v_id; end if;
  end loop;
  insert into public.withdrawals (kid_id, amount, created_by) values (p_kid, round(p_amount, 2), (select auth.uid()));
end $$;

drop function if exists public.save_dream(uuid, integer, text, numeric, text);
create function public.save_dream(p_kid uuid, p_slot integer, p_name text, p_price numeric, p_img text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_kid_access(p_kid);
  insert into public.dreams (kid_id, slot, name, price, img, updated_at)
  values (p_kid, p_slot, btrim(p_name), p_price, nullif(p_img, ''), now())
  on conflict (kid_id, slot) do update set name = excluded.name, price = excluded.price, img = excluded.img, updated_at = now();
end $$;

-- ---------------------------------------------------------------------
--  RPC dla Dziecka (tajny link, bez logowania)
-- ---------------------------------------------------------------------
drop function if exists public.kid_state_by_token(uuid);
create function public.kid_state_by_token(p_token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.kid_json(private.kid_by_token(p_token), false);
$$;

drop function if exists public.kid_version_by_token(uuid);
create function public.kid_version_by_token(p_token uuid) returns text
language sql stable security definer set search_path = '' as $$
  select private.kid_version(private.kid_by_token(p_token));
$$;

drop function if exists public.save_dream_by_token(uuid, integer, text, numeric, text);
create function public.save_dream_by_token(p_token uuid, p_slot integer, p_name text, p_price numeric, p_img text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_kid uuid := private.kid_by_token(p_token);
begin
  insert into public.dreams (kid_id, slot, name, price, img, updated_at)
  values (v_kid, p_slot, btrim(p_name), p_price, nullif(p_img, ''), now())
  on conflict (kid_id, slot) do update set name = excluded.name, price = excluded.price, img = excluded.img, updated_at = now();
end $$;

-- ---------------------------------------------------------------------
--  Uprawnienia do funkcji
-- ---------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;
revoke usage on schema private from public, anon, authenticated;

revoke all on function
  public.my_family(), public.create_family(text), public.join_family(text), public.add_kid(text),
  public.rename_kid(uuid, text), public.regenerate_kid_link(uuid), public.kid_state(uuid), public.kid_version(uuid),
  public.add_deposit(uuid, numeric, timestamptz), public.delete_deposit(uuid),
  public.apply_withdrawal(uuid, numeric, jsonb), public.save_dream(uuid, integer, text, numeric, text),
  public.kid_state_by_token(uuid), public.kid_version_by_token(uuid),
  public.save_dream_by_token(uuid, integer, text, numeric, text)
from public, anon, authenticated;

grant execute on function
  public.my_family(), public.create_family(text), public.join_family(text), public.add_kid(text),
  public.rename_kid(uuid, text), public.regenerate_kid_link(uuid), public.kid_state(uuid), public.kid_version(uuid),
  public.add_deposit(uuid, numeric, timestamptz), public.delete_deposit(uuid),
  public.apply_withdrawal(uuid, numeric, jsonb), public.save_dream(uuid, integer, text, numeric, text)
to authenticated;

grant execute on function
  public.kid_state_by_token(uuid), public.kid_version_by_token(uuid),
  public.save_dream_by_token(uuid, integer, text, numeric, text)
to anon, authenticated;

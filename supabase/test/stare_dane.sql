-- Dane jak w produkcyjnym Rodzinobanku przed migracją (do testu przeniesienia).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'rodzic@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'obcy@example.com');
insert into public.families (id, name, join_code) values ('10000000-0000-0000-0000-000000000001', 'Test', 'ABCD1234');
insert into public.family_members (family_id, user_id) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a');
insert into public.kids (id, family_id, name, view_token) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Zosia', '30000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Staś',  '30000000-0000-0000-0000-000000000002');
-- Zosia: 100 zł sprzed 45 dni i 20 zł sprzed 3 dni; Staś: nic
insert into public.deposits (kid_id, ts, amount) values
  ('20000000-0000-0000-0000-000000000001', now() - interval '45 days', 100),
  ('20000000-0000-0000-0000-000000000001', now() - interval '3 days', 20);
insert into public.dreams (kid_id, slot, name, price, img) values
  ('20000000-0000-0000-0000-000000000001', 0, 'Lego', 89, null),
  ('20000000-0000-0000-0000-000000000001', 1, 'Rower', 599.5, 'data:image/png;base64,AAAA');

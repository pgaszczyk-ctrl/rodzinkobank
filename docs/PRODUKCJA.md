# Groszaki na produkcji: wdrożenie i ustawienia

Strona: **groszaki.pl** (GitHub Pages z domyślnej gałęzi repozytorium, dziś `claude/gallant-brown-p5e9qn`
ze starym Rodzinobankiem). Baza: projekt Supabase `kjvwvgvwsdtlfogliizz`.

## 1. Baza (najpierw!)

1. Supabase → projekt → **SQL Editor** → *New query*.
2. Wklej całą zawartość `supabase/migracje/20261110_groszaki.sql` → **Run**.
3. Powinno skończyć się bez błędu. Migrację można uruchomić ponownie: dane z Rodzinobanku przenosi tylko
   raz, a funkcje zastępuje nowszymi.

Migracja tylko dodaje tabele i funkcje. Stary Rodzinobank działa dalej na starych tabelach, więc między
krokiem 1 a 2 nic się nie psuje.

Kontrola (w tym samym SQL Editorze):

```sql
select count(*) as zdarzenia from public.kid_events;
select proname from pg_proc where proname = 'lock_kid';
```

Pierwsze zapytanie: co najmniej tyle wierszy, ile dzieci miało oszczędności. Drugie: jeden wiersz.

## 2. Strona

Po kroku 1 nowa wersja trafia na gałąź, z której GitHub Pages serwuje groszaki.pl
(przesunięcie `claude/gallant-brown-p5e9qn` na `claude/serene-turing-r17emp`; to czyste przesunięcie
do przodu, bez scalania). GitHub Pages publikuje zmianę w 1–2 minuty.

Powrót do starej wersji: ustawić gałąź z powrotem na commit `b919afb`. Baza nie przeszkadza, bo stary
Rodzinobank korzysta ze starych tabel.

Sprawdź w **Settings → Pages**, że źródłem jest ta gałąź i folder `/ (root)`, a domena to groszaki.pl.

Jednorazowo: Supabase → **Authentication → URL Configuration** → *Site URL* `https://groszaki.pl` i to samo
w *Redirect URLs*. Dzięki temu linki z maili (potwierdzenie konta, reset hasła) wracają do aplikacji.

## 3. Poczta przy rejestracji (konieczne przy wielu rodzinach)

Wbudowana poczta Supabase wysyła tylko kilka maili na godzinę i służy do testów. Przy większej liczbie
rodziców maile z potwierdzeniem konta i resetem hasła przestaną dochodzić.

1. Załóż konto w usłudze wysyłki maili, np. **Resend** (darmowo do 3000 maili/miesiąc) albo SendGrid, Postmark.
2. Dodaj tam domenę `groszaki.pl` i wpisz u rejestratora domeny rekordy DNS, które pokaże usługa
   (SPF, DKIM). Bez tego maile trafiają do spamu.
3. Utwórz klucz API.
4. Supabase → **Authentication → Emails → SMTP Settings** → włącz *Custom SMTP*:
   - Resend: host `smtp.resend.com`, port `465`, użytkownik `resend`, hasło = klucz API,
   - nadawca np. `Groszaki <no-reply@groszaki.pl>`.
5. Supabase → **Authentication → Rate Limits**: podnieś limit maili na godzinę (np. do 100).
6. Przy okazji: **Authentication → Emails → Templates** – przetłumacz treść maili na polski.

## 4. Ochrona przed zasypywaniem zapytaniami

Stan dziś:
- tabele są zamknięte, wszystko idzie przez funkcje, które same sprawdzają uprawnienia,
- link dziecka zawiera losowy identyfikator (122 bity), więc cudzego nie da się zgadnąć,
- logowanie i rejestracja mają własne limity Supabase (punkt 3.5).

Ryzyko, które zostaje: ktoś może zasypywać publiczne funkcje dziecka zapytaniami. Danych nie wykradnie,
ale może spowolnić serwis i zwiększyć rachunek. Przy obecnej skali wystarczy:

1. Plan **Pro** z włączonym **Spend Cap** (domyślnie włączony): rachunek nie urośnie ponad plan.
2. **Reports / Observability** w Supabase: raz w tygodniu rzut oka na liczbę zapytań API.
   Normalnie to ok. 4 zapytania na minutę na każde otwarte urządzenie.
3. Jeśli kiedyś pojawi się nadużycie: funkcje dziecka można przenieść za Edge Function z limitem
   zapytań na adres IP. Aplikacja zmieni wtedy tylko adres wywołania.

## 5. Plan Supabase

Darmowy plan ma 5 GB transferu i usypia projekt po tygodniu bez ruchu. Przy kilkuset rodzinach i więcej
potrzebny jest **Pro** (250 GB transferu w cenie). Szacunek dla 10 000 rodzin: 12–25 GB miesięcznie.

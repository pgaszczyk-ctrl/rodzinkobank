# Rodzinobank

Domowy „Tata-Bank” dla dzieci: dziecko odkłada kieszonkowe u rodziców, a im dłużej monety czekają, tym większą dostają **Premię za cierpliwość** (od +5% po 1 miesiącu do +50% po 6 miesiącach, potem cykl zaczyna się od powiększonej kwoty).

Cała aplikacja to jeden plik: `index.html` (Tailwind CSS z CDN + czysty JavaScript). Wspólna baza rodziny działa na Supabase (`supabase/schema.sql`).

## Co jest w środku
- **Wielki Skarbiec** – licznik na żywo, co 10 s dolicza ułamki groszy i wypuszcza monety; pod nim kopalnia z kręcącymi się zębatkami i blokowymi górnikami.
- **Schody Cierpliwości** – pokazują, na którym schodku premii jest najstarsza wpłata.
- **3 Marzenia** – Proste / Średnie / Niesamowite, z własnym zdjęciem (wgranie pliku lub link) i paskiem postępu.
- **Magiczna Oś Oszczędzania** – rok podzielony na pory roku; po wpisaniu kwoty (domyślnie 10 zł) i częstotliwości pokazuje, kiedy każde marzenie będzie w zasięgu.
- **Strefa Rodzica** – wpłaty (także z datą wsteczną), wypłaty, historia, link/kod QR dla dziecka, kod rodziny dla drugiego rodzica, kilkoro dzieci.

## Trzy tryby
| Tryb | Kto | Co może |
|---|---|---|
| **Rodzic** | zalogowany e-mailem i hasłem | wszystko w skarbcach dzieci ze swojej rodziny |
| **Dziecko** | otwiera magiczny link / kod QR od rodzica, bez konta | ogląda swój skarbiec, zmienia swoje 3 marzenia |
| **Próbny** | bez konta | wszystko, ale dane zostają tylko w tej przeglądarce |

Urządzenia same sprawdzają zmiany co 15 sekund – wpłata zrobiona na telefonie rodzica pojawia się u dziecka z animacją monety.

## Uruchomienie wspólnej bazy (jednorazowo)
1. **Baza:** w Supabase otwórz projekt → **SQL Editor** → *New query* → wklej całą zawartość `supabase/schema.sql` → **Run**.
2. **Klucz:** **Project Settings → API Keys** → skopiuj *Publishable key* (`sb_publishable_…`) i wklej go w `index.html` w miejsce `WKLEJ_TUTAJ_PUBLISHABLE_KEY`. Ten klucz jest publiczny – tabele są zamknięte, a wszystkie operacje idą przez funkcje, które same sprawdzają uprawnienia.
3. **Adres strony:** **Authentication → URL Configuration** → w *Site URL* wpisz adres, pod którym działa aplikacja (np. `https://pgaszczyk-ctrl.github.io/rodzinkobank/`) i dodaj go też do *Redirect URLs*. Dzięki temu linki z e-maili (potwierdzenie konta, reset hasła) wrócą do aplikacji.
4. Opcjonalnie: **Authentication → Sign In / Providers → Email** – wyłącz *Confirm email*, jeśli nie chcesz potwierdzać adresu przy zakładaniu konta.

Dopóki klucz nie jest wpisany, aplikacja działa w trybie próbnym.

## Hosting
Najprościej GitHub Pages: **Settings → Pages → Deploy from a branch** → wybierz gałąź i folder `/ (root)`.

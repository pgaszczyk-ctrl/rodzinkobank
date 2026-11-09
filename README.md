# Groszaki (Coinlings)

Rodzinna aplikacja webowa do nauki oszczędzania i odroczonej gratyfikacji. Rodzic rejestruje wpłaty, premie i wypłaty. Dziecko widzi, jak Skarbiec rośnie o mikrogrosze co 10 sekund, kiedy otworzy się kolejna skrzynia i ile brakuje do marzenia.

Aplikacja **prowadzi ewidencję** – prawdziwe pieniądze przechowuje rodzic.

## Widok dziecka
1. **Mój Skarbiec** – saldo w formacie `10,00₀₀₀₁ zł` (cztery małe cyfry to mikrogrosze; dotknij ich, by zobaczyć „10 000 mikrogroszy to 1 grosz”), odliczanie do kolejnego mikrogrosza, najbliższa skrzynia z kwotą i datą, osobna pula **Na teraz**, wniosek o wypłatę.
2. **Kopalnia Marzeń** – jeden ilustrowany przekrój: nad ziemią oś czasu od znacznika **Dziś** z płynnie zmieniającymi się porami roku, pod ziemią maksymalnie trzy najbliższe skrzynie (drewniana / srebrna / złota), każda dokładnie pod swoją datą. Na telefonie przewija się poziomo tylko ta scena.
3. **Moje marzenia** – trzy karty (Proste, Średnie, Niesamowite) liczone od tego samego salda Skarbca, z opcjonalną prognozą przy regularnych wpłatach.

Scena to ilustracja „Cztery pory roku” od grafika: bieżąca pora roku i dwie kolejne, a pod ziemią kopalnia. Oś czasu przelicza każdą datę na tę panoramę, więc skrzynia leży dokładnie pod swoją datą. Animacje (GSAP): górnik kopie według czterech klatek i czasów ze `scena.json`, przy uderzeniu lecą iskry i pył; winda wwozi złoto na górę dokładnie w chwili zmiany cyfr – z cichym „ka-ching”; latarnie migoczą, drzewa i nać się kołyszą, chmury płyną, liście, śnieg i płatki spadają według pory roku. Groszacy: pierwsza, druga i trzecia wpłata do Skarbca odblokowują kolejnego górnika (kopie przy skale, sortuje bryłkę złota, rozbija stos rudy). Gdy kopalnia nie nalicza premii – odpoczywają (stoją, siedzą albo drzemią). Tryb ograniczonego ruchu wyłącza animacje, a liczby dalej się aktualizują.

## Zasady naliczania (`src/engine.js`)
- Kwoty są w całkowitych mikrogroszach (1 zł = 1 000 000 µg).
- Kopalnia: 1 µg co 10 s za każde 10 zł pozostającej części wpłaty; reszta z dzielenia przechodzi między krokami.
- Każda wpłata ma plan na 6 miesięcy kalendarzowych z narastającymi progami łącznej premii (domyślnie 5/10/18/25/38/50%). Skrzynia wypłaca różnicę między progiem a premią przyznaną dotąd (kopalnia + skrzynie + bonus), zostawiając budżet na przyszłe mikrogrosze. Łączna premia nie przekracza ostatniego progu (maks. 50%).
- Bonus rodzica (np. 20%) jest osobną operacją w tym samym limicie – saldo 10 zł po pół roku wynosi 15 zł z bonusem i bez.
- Wypłata: najpierw premie, potem kapitał od najstarszej wpłaty; pozostała część zachowuje datę; nagrody nie są cofane; mikrogrosze poniżej grosza zostają w saldzie.
- Mikrogrosze i skrzynie **wynikają deterministycznie** z zapisanych operacji i czasu serwera. Odświeżenie strony, druga karta czy powrót po przerwie pokazują ten sam, należny stan – nic nie jest przyznawane dwa razy.

## Strefa rodzica
Chroniona PIN-em (w trybie z kontami sprawdzanym po stronie serwera: 5 błędów = blokada na 5 minut, sesja 30 min). Zakładki: **Wpłata** (podział prezentu suwakiem, bonus, podgląd skrzyń), **Wypłaty** (zatwierdzanie wniosków po 24 h, wydatki z „Na teraz”, korekty), **Historia** (budżet premii każdej wpłaty i rozbicie skrzyń), **Plan nagród** (progi, tempo, wersjonowanie), **Cele** (nazwa, ilustracja, cena, harmonogram do prognozy), **Rodzina** (dzieci, link/QR, kod drugiego rodzica, PIN).

## Pliki
| Ścieżka | Zawartość |
|---|---|
| `index.html` | szkielet strony |
| `src/engine.js` | księgowanie: kopalnia, skrzynie, limity, wypłaty, prognozy |
| `src/app.js`, `src/parent.js` | widok dziecka i Strefa rodzica |
| `src/scene.js` | scena „Cztery pory roku” złożona według `assets/scene/scena.json` i animowana przez GSAP |
| `assets/scene/` | ilustracje od grafika (opis w `assets/scene/README.md`); poprawione: słońce, proporcje włazu i latarni, marchewki |
| `src/scenedata.js` | `scena.json` jako moduł JS z wersjami plików (generowany: `npm run build:scene`) |
| `src/chests.js` | skrzynie drewniana / srebrna / złota w stylu sceny (scena, ikony, świętowanie) |
| `assets/vendor/gsap-3.13.0.min.js` | biblioteka animacji GSAP (licencja „Standard no charge”, https://gsap.com/standard-license) |
| `src/art.js` | ilustracje SVG (sztygar przy saldzie, skrzynie, obrazki marzeń) |
| `src/sound.js` | delikatne „ka-ching” (Web Audio, bez plików dźwiękowych) |
| `src/backend.js` | tryb próbny (localStorage) i Supabase – to samo API |
| `src/i18n.js`, `src/locales/` | teksty (polski, angielski), formaty kwot i dat |
| `supabase/schema.sql` | baza, uprawnienia i funkcje RPC |
| `assets/` | style (Tailwind zbudowany do `tailwind.css` + `app.css`) |

## Uruchomienie
Statyczna strona bez kroku budowania – wystarczy hosting plików (np. GitHub Pages, gałąź i folder `/`). Lokalnie: `npm run serve` i `http://localhost:8080` (`?local=1` wymusza tryb próbny, `?lang=en` – angielski).

Po każdej zmianie plików: `npm run build` (`scena.json` → `src/scenedata.js`, Tailwind → `assets/tailwind.css`, znaczniki wersji w `index.html`, żeby przeglądarki i GitHub Pages nie podawały starych plików).

### Wspólna baza (Supabase)
1. **SQL Editor** → wklej `supabase/schema.sql` → **Run**. Skrypt można uruchamiać wielokrotnie. Zachowuje rodziny, dzieci, linki i marzenia z Rodzinobanku, a stare wpłaty przenosi do nowej księgi (bieżąca kwota z oryginalną datą i domyślnym planem).
2. Klucz *Publishable* jest w `src/app.js` (`SUPABASE_KEY`). Tabele są zamknięte – wszystko idzie przez funkcje, które sprawdzają uprawnienia, PIN, wersję stanu (`rev`) i klucze idempotencji.
3. **Authentication → URL Configuration**: wpisz adres aplikacji w *Site URL* i *Redirect URLs*.

## Testy
- `npm test` – silnik (kryteria odbioru) i kompletność tłumaczeń.
- `npm run test:sql` – funkcje bazy na lokalnym PostgreSQL (zmienne `PGHOST`, `PGPORT`, `PGUSER`).

# Groszaki: prompt dla Claude Code

Przebuduj aplikację z tego repozytorium w **Groszaki** (ang. *Coinlings*), rodzinny bank dla dzieci.
Rodzic prowadzi ewidencję wpłat i wypłat dziecka, a aplikacja nalicza procent. Dziecko ogląda
wspólnie z rodzicem gwarne miasteczko, w którym jego pieniądze (Groszaki) pracują. Widzi, że
pieniądze są bezpieczne, rosną co kilka sekund i kiedy wystarczą na jego cele. Prostota jest
ważniejsza niż liczba funkcji.

## 0. Zanim zaczniesz

- Przeczytaj `README.md`, `index.html` i `supabase/schema.sql`. Zachowaj obecną infrastrukturę:
  jeden plik `index.html` (Tailwind + czysty JS; wydzielone pliki JS są w porządku), Supabase,
  logowanie rodzica, kilkoro dzieci, magiczny link/QR dla dziecka, kod rodziny dla drugiego
  rodzica, tryb próbny bez konta.
- Usuń całą starą mechanikę premii: Premię za cierpliwość, cykle 6-miesięczne, schody, kopalnię,
  górników i skrzynie. Nie korzystaj z gałęzi `claude/groszaki-savings-app-*`, to porzucony kierunek.
- **Nie zmieniaj produkcyjnej bazy Supabase bez mojej zgody.** Przygotuj migrację SQL, przetestuj
  ją lokalnie na Postgresie i pokaż mi przed wdrożeniem.
- Pracuj na gałęzi, na której leży ten plik. Nie twórz PR, dopóki o niego nie poproszę.

## 1. Grafika (pliki w `assets/groszaki/zrodla/`)

| Plik | Co to jest | Jak użyć |
|---|---|---|
| `mapa-wiosna.jpg`, `mapa-lato.jpg`, `mapa-jesien.jpg`, `mapa-zima.jpg` | Mapa miasteczka 2000×1116, ten sam układ w każdej porze roku, bez postaci | Tło sceny, użyte bez zmian |
| `czesci-miedziany.jpg` | Części miedzianego Groszaka: korpus bez buzi, 6 buź, rączka, nóżka, okruszek, plecak, bąbelki snu | Wytnij i złóż z nich animowaną postać |
| `arkusz-postaci.jpg` | Wzór wyglądu i póz (miedziany, srebrny, dwukolorowy) | Tylko jako wzór proporcji i póz |
| `ksiegowy.jpg` | Groszak Księgowy, dwie pozy | Na razie jako gotowe obrazki w dymku (pkt 4) |

Jutro dojdą części srebrnego i dwukolorowego Groszaka oraz rekwizyty Księgowego. Zbuduj wszystko
tak, żeby dodanie nowego materiału monety sprowadzało się do wrzucenia arkusza i dopisania
jednej pozycji w konfiguracji.

**Przygotowanie części:** napisz skrypt (Python + Pillow albo Node), który wycina każdą część
z białego tła (flood fill od krawędzi, żeby nie wyciąć białych odblasków w środku), wygładza
krawędzie (lekkie rozmycie maski, bez białej obwódki) i zapisuje przezroczyste PNG/WebP do
`assets/groszaki/`. Skrypt i wycięte pliki dodaj do repo. Pliki źródłowe zostają bez zmian.

## 2. Animacja Groszaków (wycinanka, „papierowa kukiełka”)

- Postać składa się z części: korpus, buzia nałożona na korpus, dwie rączki, dwie nóżki,
  opcjonalnie okruszek albo plecak. Rączki i nóżki obracaj wokół zaokrąglonego górnego końca
  (ramię, biodro). Prawą stronę uzyskaj przez lustrzane odbicie. Kończyny są pod korpusem, tak jak
  na `arkusz-postaci.jpg`.
- Ruchy:
  - **dreptanie**: nóżki na zmianę, rączki w przeciwfazie, lekki podskok i przechył w stronę marszu;
  - **niesienie okruszka**: obie rączki w górze, okruszek nad głową, buzia „szczęśliwa”;
  - **machanie**: jedna rączka macha, gdy Groszak czeka albo gdy dziecko go dotknie;
  - **mruganie** co kilka sekund (podmiana buzi), **sen** w nocy albo przy pustym Skarbcu
    (buzia śpiąca, bąbelki);
  - **plecak**, gdy Groszak odchodzi po marzenie przy wypłacie.
- Renderuj na `<canvas>` (lub WebGL, jeśli canvas nie wystarczy) z `requestAnimationFrame`,
  płynnie do ok. 100 postaci na telefonie. Wstrzymaj animację, gdy karta jest w tle.
- Przy `prefers-reduced-motion` Groszaki stoją, a zmieniają się tylko liczby.

## 3. Miasteczko

- Mapa jako tło z przesuwaniem i przybliżaniem palcem/myszą. Na telefonie (390 px) startuj
  przybliżony na rynek i schody do Skarbca, bo w pełnym widoku Groszaki są za małe.
  Mapa nie może przesuwać całej strony, przesuwa się tylko ona.
- Pora roku mapy wynika z dzisiejszej daty (grudzień–luty zima, marzec–maj wiosna, czerwiec–sierpień
  lato, wrzesień–listopad jesień). Przy zmianie pory mapy przenikają się płynnie. Dodaj delikatne
  efekty: śnieg, liście, płatki, dym z komina, obracający się wiatrak.
- **Trasy:** zapisz sieć ścieżek jako graf punktów w `assets/groszaki/trasy.json`, wspólny dla
  wszystkich pór roku. Pierwszą wersję wyznacz, patrząc na mapę: ścieżki rynku, mostki, schody
  do Skarbca, droga na farmę. Dodaj ukryty **edytor tras** (`?edytor=1`): klikanie dodaje i przesuwa
  punkty, Groszaki od razu po nich chodzą, a przycisk eksportuje JSON. Groszaki nie chodzą po
  dachach ani po wodzie, rzekę przekraczają mostkami.
- **Liczba Groszaków:** 1 Groszak na każde 10 zł salda (co najmniej 1, gdy saldo > 0), najwyżej 80.
  Powyżej tej liczby jeden Groszak oznacza większą kwotę. Na ulicach ma być gwarno, gdy jest dużo
  pieniędzy.
- **Gdzie pracują:** Groszaki z części salda do 1000 zł (5% miesięcznie) pracują blisko: rynek,
  piekarnia, młyn. Groszaki z części powyżej 1000 zł (3%) chodzą przez mostki na farmę. Mają dalej,
  więc wracają rzadziej.
- **Okruszki:** Groszak idzie do pracy, wraca z okruszkiem, wspina się schodami do Skarbca
  (budynek ze świnką) i oddaje okruszek. Dostawa jest zsynchronizowana z aktualizacją małych cyfr
  salda (co 10 s). Animacja odzwierciedla przyrost, ale go nie wylicza.
- Dotknięcie Groszaka pokazuje dymek, np. „Niosę mąkę do piekarni”, „Wracam z okruszkiem”.
- **Wpłata:** nowe Groszaki wybiegają ze Skarbca. **Wypłata:** kilka Groszaków zakłada plecaki
  i wyrusza po marzenie. Bez smutnych min i bez wywoływania poczucia winy.
- **Pusty Skarbiec:** jeden śpiący Groszak na schodach i napis „Pierwsza wpłata obudzi Groszaki”.

## 4. Widok dziecka (od góry)

1. **Saldo**: największy element. Złote i grosze duże, cztery cyfry mikrogroszy mniejsze, np.
   `512,37₄₈₂₁ zł`. Po dotknięciu małych cyfr: „10 000 mikrogroszy to 1 grosz”. Po przekroczeniu
   pełnego grosza delikatnie podświetl dużą kwotę. **W widoku dziecka nie pokazuj procentów**,
   tylko kwoty, daty i paski.
2. **Miasteczko** (pkt 3).
3. **Droga przez rok**: osobny poziomy pasek przewijany palcem, narysowany w kodzie (SVG/canvas)
   w stylu mapy.
   - Zaczyna się od znacznika „Dziś” i obejmuje 14 miesięcy. Odległość jest proporcjonalna do liczby dni.
   - Pory roku przechodzą płynnie: jesień (liście), zima (śnieg, bałwan, choinka), wiosna (pąki,
     pisanki), lato (słońce, morze, namioty kolonii), potem tornister i znów jesień.
   - Drogowskazy z datami: Mikołajki, Wigilia, ferie (termin ustawia rodzic albo je ukrywa),
     Wielkanoc (licz datę ruchomą), Dzień Dziecka, koniec roku szkolnego, wakacje, 1 września,
     oraz wydarzenia dodane przez rodzica (urodziny, kolonie, morze…).
   - Przy każdym drogowskazie prognoza salda z dopiskiem „jeśli nic nie wydasz”.
   - Przeszłe wpłaty jako ślady na początku drogi, np. „50 zł od babci”.
   - Termin bliższy niż 14 dni pokazuj w nocach: „jeszcze 9 nocy”.
4. **Cele**: dowolna liczba celów (dodaje rodzic i dziecko). Każdy ma nazwę, kwotę i obrazek
   z zestawu lub emoji, a karta pokazuje pasek postępu i brakującą kwotę. Każdy cel ma flagę na
   Drodze przez rok w dniu, w którym saldo go osiągnie (z procentem i opcjonalnymi regularnymi
   wpłatami). **Groszak Księgowy** (`ksiegowy.jpg`) pojawia się w większym rozmiarze w rogu
   ekranu, gdy dziecko dotknie flagi lub celu. Mówi w dymku, przy którym wydarzeniu cel zostanie
   osiągnięty („Policzyłem! Hulajnoga będzie Twoja przed wakacjami”). Cele dalsze niż 14 miesięcy
   trafiają na koniec drogi z napisem „za ponad rok”. Gdy saldo wystarcza, pokaż „Możesz spełnić to
   marzenie!”. Prognozę zawsze oznaczaj jako prognozę.

Bez serii, odznak za codzienne wejścia i liczników „nie przerwij passy”.

## 5. Model pieniędzy (najważniejsza część, najpierw testy)

- Kwoty przechowuj w całkowitych mikrogroszach: 1 zł = 100 gr, 1 gr = 10 000 mikrogroszy.
- Źródłem prawdy jest dziennik zdarzeń: wpłata, wypłata, korekta, zmiana oprocentowania.
  Saldo zawsze wyliczaj z dziennika i upływu czasu. Odświeżenie strony, druga karta ani ponowienie
  zapisu nie mogą niczego naliczyć podwójnie.
- **Oprocentowanie progowe, składane.** Domyślnie część salda do 1000 zł rośnie 5% miesięcznie,
  a część powyżej 1000 zł 3% miesięcznie. Rodzic może zmienić obie stawki i próg. Zmiana obowiązuje
  od wybranej daty, nigdy wstecz.
- Kapitalizacja dzienna: stawka dzienna = (1 + stawka miesięczna)^(1/30,4375) − 1, osobno dla części
  do progu i ponad próg. Wewnątrz dnia licznik rośnie liniowo do kwoty należnej na koniec dnia
  i aktualizuje się co 10 sekund. Po powrocie do aplikacji saldo uwzględnia czas nieobecności.
- Wypłacić można tylko pełne grosze. Mikrogrosze zostają w saldzie.
- Obliczenia wydziel jako czyste funkcje bez DOM i Supabase, testowane w Node.

## 6. Strefa rodzica (spokojna, rzeczowa)

- Lista dzieci z saldami. Wpłata, wypłata i korekta (z datą, także wsteczną). Historia z rozbiciem
  na kapitał i odsetki.
- Ustawienia oprocentowania: stawki, próg, data obowiązywania. Podpowiedź: „Powiedz dziecku o zmianie
  wcześniej”.
- Przy wpłacie podgląd kosztu: „Jeśli nic nie zostanie wypłacone, za rok dołożysz ok. X zł”.
- Regularne wpłaty (kwota, częstotliwość) jako podstawa prognoz Księgowego.
- Własne wydarzenia na Drodze przez rok i termin ferii.
- Uprawnienia sprawdzane po stronie serwera (RLS): dziecko ogląda i edytuje swoje cele,
  wszystkie operacje na pieniądzach należą do rodzica.

## 7. Kryteria odbioru

- 10 zł bez innych operacji: po 10 s małe cyfry salda są większe niż na starcie.
- 500 zł bez operacji przez 365 dni: saldo ≈ 897,6 zł.
- 1500 zł: część powyżej 1000 zł rośnie 3%, a test sprawdza oba progi.
- Zmiana stawki od daty D nie zmienia salda sprzed D.
- Odświeżenie i dwie karty nie zmieniają należnej kwoty.
- Wielkanoc i pory roku są poprawne dla kolejnych lat.
- Groszak drepcze, podnosi rączki z okruszkiem, macha i mruga, a części nie mają białych obwódek.
- Liczba Groszaków rośnie po wpłacie i maleje po wypłacie. Groszaki chodzą tylko po trasach.
- Na telefonie (390 px) saldo mieści się bez poziomego przewijania strony, a przesuwają się tylko
  mapa i Droga przez rok. Animacja jest płynna przy 80 Groszakach.
- Działają stany: pusty Skarbiec, cel osiągnięty, cel za ponad rok, saldo powyżej progu.
- Teksty po polsku, przygotowane do tłumaczenia. Daty i waluty przez `Intl`.

## 8. Kolejność pracy

1. Czyste funkcje finansowe i testy.
2. Wycinanie części i prototyp jednego animowanego Groszaka na mapie. **Pokaż mi zrzut lub nagranie
   przed dalszą pracą.**
3. Trasy, edytor tras, liczba Groszaków i okruszki zsynchronizowane z saldem.
4. Droga przez rok i cele z Księgowym.
5. Strefa rodzica i migracja Supabase (bez wdrażania na produkcję).

Po każdym etapie pokaż zrzuty z telefonu (390 px) i komputera.

## Poza zakresem (na później)

Miasteczko rozbudowujące się z łącznych odsetek (nowe domki), pula „Na teraz”, wnioski dziecka
o wypłatę.

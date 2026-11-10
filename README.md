# Groszaki

Rodzinny bank dla dzieci. Rodzic prowadzi ewidencję wpłat i wypłat, a aplikacja nalicza procent.
Dziecko ogląda miasteczko, w którym jego pieniądze (Groszaki) pracują i co 10 sekund dokładają odrobinę.

## Co jest w środku

- **Saldo** w złotych i groszach plus cztery cyfry mikrogroszy, które rosną na oczach dziecka.
- **Miasteczko**: 1 Groszak na każde 10 zł (najwyżej 80). Pracują na rynku, w piekarni i w młynie,
  a pieniądze ponad próg – na farmie. Wracają z okruszkami do Skarbca równo z tyknięciem salda.
  Wpłata: nowe Groszaki wybiegają ze Skarbca. Wypłata: kilka rusza z plecakami po marzenie.
- **Droga przez rok** pod miasteczkiem: pionowa panorama pór roku przewijana razem ze stroną, u góry „dziś”.
  Przy datach stoją dekoracje (worek Mikołaja, choinka, bałwan na ferie, koszyk wielkanocny, balony,
  tornister, tort na urodziny, drogowskaz na inne wydarzenia), przy dniu prognozy – znaczniki celów.
  Groszak idzie drogą w środku ekranu; dotknięcie celu przewija do niego i włącza Księgowego.
- **Cele** z paskiem postępu i Groszakiem Księgowym, który mówi, kiedy cel będzie w zasięgu (prognoza).
- **Strefa rodzica**: wpłaty, wypłaty i korekty (także z datą wsteczną), historia z rozbiciem na kapitał
  i odsetki, oprocentowanie (stawki i próg od wybranej daty, nigdy wstecz), regularne wpłaty,
  kalendarz (ferie, własne wydarzenia), magiczny link/QR dla dziecka, kod rodziny dla drugiego rodzica.

Oprocentowanie: domyślnie część salda do 1000 zł rośnie 5% miesięcznie, część powyżej – 3%,
składane codziennie (strefa czasowa Europe/Warsaw). Kwoty są przechowywane w całkowitych mikrogroszach,
a saldo zawsze liczone z dziennika operacji, więc odświeżenie strony ani druga karta niczego nie dublują.

## Trzy tryby

| Tryb | Kto | Co może |
|---|---|---|
| **Rodzic** | zalogowany e-mailem i hasłem | wszystko w skarbcach dzieci ze swojej rodziny |
| **Dziecko** | magiczny link / kod QR od rodzica, bez konta | ogląda swój skarbiec, zmienia swoje cele |
| **Próbny** | bez konta (`?probny`) | wszystko, dane tylko w tej przeglądarce |

Uprawnienia sprawdza baza (funkcje SQL): pieniądze zmienia wyłącznie rodzic z rodziny dziecka.

## Pliki

- `index.html` – strona aplikacji; logika w `src/groszaki/` (czyste moduły ES, bez budowania).
  - `finanse.js`, `czas.js`, `kalendarz.js`, `liczenie.js`, `droga.js` – czyste obliczenia (testy w Node),
  - `dane.js` – zapis i odczyt (Supabase albo localStorage),
  - `miasteczko.js`, `symulacja.js`, `kukielka.js`, `trasy.js`, `przeslony.js` – miasteczko na canvasie,
  - `drogaWidok.js` – Droga przez rok (układ na panoramie liczy `layoutRoad` w `droga.js`),
  - `cele.js`, `teksty.js` (wszystkie napisy, gotowe do tłumaczenia), `app.js`.
- `assets/groszaki/` – grafika: źródła w `zrodla/`, wycięte części, `trasy.json`, `przeslony.json`.
- `prototyp.html` – plac zabaw: miasteczko ze studiem póz, `?edytor=1` – edytor tras i przesłon.
- `tools/wytnij_czesci.py` – wycina części z arkuszy (nowy materiał monety = arkusz + wpis w `czesci.config.json`).
- `tools/sprawdz_trasy.py` – sprawdza trasy z mapą (`--poszerz` poszerza drogi).
- `tools/droga_rok.py` – panorama Drogi przez rok: wygładza szew, odczytuje oś drogi do `droga-rok.json`
  (początki miesięcy ustawia się w `czesci.config.json` → `droga_rok`; `--podglad plik.png` rysuje je na obrazku).
  Dekoracje drogi wycina `tools/wytnij_czesci.py droga` (pola w `czesci.config.json` → `obiekty`).
- `supabase/schema.sql` – baza Rodzinobanku; `supabase/migracje/20261110_groszaki.sql` – migracja do Groszaków.

## Testy

```bash
npm test
```

Baza (lokalny Postgres, bez dotykania produkcji):

```bash
PGHOST=… PGPORT=… PGUSER=postgres tools/test_bazy.sh
```

## Wdrożenie

Krok po kroku (baza, strona, poczta, ochrona): **[docs/PRODUKCJA.md](docs/PRODUKCJA.md)**.
Najpierw baza, potem strona – nowa strona bez migracji pokaże komunikat, że baza nie jest gotowa.

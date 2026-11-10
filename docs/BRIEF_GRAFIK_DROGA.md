# Groszaki: brief dla grafika – Droga przez rok

## Jak to ma działać

Pod miasteczkiem jest poziomy pas „Droga przez rok”, przewijany palcem. Pokazuje 14 miesięcy od dziś.
Na drodze nie ma napisów. Wydarzenia i cele to obiekty postawione mniej więcej we właściwym miejscu
na osi czasu:

- **wydarzenie** (Wigilia, ferie, Wielkanoc, wakacje…) – rozpoznawalny obiekt przy drodze, np. choinka
  z prezentami albo namiot kolonii;
- **cel dziecka** – stragan, na którego ladzie leży to, na co dziecko zbiera (hulajnoga, klocki…),
  w dniu, w którym saldo według prognozy na to wystarczy;
- **Groszak** – drepcze w miejscu na drodze przy „dziś”, zwrócony w stronę celów. Po dotknięciu straganu
  droga przesuwa się pod nim, jakby szedł do tego straganu. Termin podaje Groszak Księgowy w dymku,
  więc na samej drodze nie ma tekstu.

Aplikacja układa elementy w kodzie: skleja kafle tła, stawia obiekty na osi i animuje Groszaka.
Grafik dostarcza osobne elementy, a nie gotową, długą panoramę (daty co roku wypadają gdzie indziej).

## Lista elementów

### 1. Tło drogi – kafle pór roku

- 4 kafle: **jesień, zima, wiosna, lato**.
- 4 kafle przejściowe: **jesień → zima, zima → wiosna, wiosna → lato, lato → jesień**.
- Każdy kafel ma **2400 × 700 px**. Droga biegnie poziomo, a jej środek na lewej i prawej krawędzi kafla
  jest zawsze na tej samej wysokości (np. y = 430 px), szerokość drogi też ta sama. Dzięki temu kafle
  łączą się w dowolnej kolejności. Krawędzie lewa i prawa muszą do siebie pasować (bez szwu).
- Nad drogą wolne miejsce (ok. 250 px) na obiekty wydarzeń, pod drogą (ok. 150 px) na stragany.
- Bez postaci, bez napisów, bez obiektów świątecznych (te stawiamy osobno). Drzewa, krzaki, śnieg,
  kwiatki, łąka mogą być wrysowane w tło.
- Styl i perspektywa jak na mapach miasteczka (lekko z góry, ten sam kontur i paleta).

### 2. Obiekty wydarzeń (osobno, każdy na swoim polu)

Wysokość ok. 300–400 px, stoją na ziemi (cień pod spodem mile widziany).

| Wydarzenie | Propozycja obiektu |
|---|---|
| Mikołajki (6 XII) | but z prezentami albo worek Mikołaja |
| Wigilia (24 XII) | choinka z prezentami |
| Ferie | sanki albo bałwan z nartami |
| Wielkanoc | koszyk z pisankami |
| Dzień Dziecka | pęk balonów |
| Koniec roku szkolnego | świadectwo z kokardą albo kwiaty dla nauczyciela |
| Wakacje | parasol plażowy z leżakiem albo namioty kolonii |
| 1 września | tornister |
| Urodziny (dodaje rodzic) | tort ze świeczkami |
| Inne wydarzenie rodzica | uniwersalny obiekt, np. słupek z pustą chorągiewką |

### 3. Stragan celu

- Pusty stragan z pustą ladą, w **3 kolorach daszka**. Na ladzie aplikacja kładzie obrazek celu.
- Wariant **„cel osiągnięty”**: ten sam stragan z girlandą, światełkami albo konfetti.
- Zaznacz na arkuszu (np. kropką albo prostokątem na osobnej warstwie), gdzie na ladzie stoi przedmiot.

### 4. Obrazki celów (zamiast emoji)

Ok. 200 × 200 px, w stylu miasteczka: hulajnoga, rower, rolki, klocki, pluszak, konsola, słuchawki,
książki, farby, piłka, instrument, zwierzątko, prezent (uniwersalny), puzzle. Kolejne można dodawać później.

### 5. Groszak w widoku z boku (najważniejsze)

Groszak idzie wzdłuż drogi w bok, a obecne części są tylko z przodu. Potrzebne części miedzianego Groszaka
w **widoku z boku albo 3/4**, w tym samym układzie co `czesci-miedziany.jpg`:

- korpus z boku (moneta lekko obrócona, widać grubość krawędzi),
- buzia z boku: uśmiech, radosna, mrugnięcie (oczy zamknięte),
- rączka i nóżka w profilu (zaokrąglony górny koniec, jak dotychczas),
- plecak widziany z boku.

To samo później dla srebrnego i dwukolorowego.

### 6. Drobne elementy

- **Znacznik „dziś”**: np. słupek albo kamień milowy bez napisu.
- **Ślady wcześniejszych wpłat**: małe monetki albo odciski stópek na drodze, 2–3 warianty.
- **Koniec drogi („za ponad rok”)**: brama, most znikający we mgle albo góry z chmurami. Tu stają
  stragany celów dalszych niż 14 miesięcy.
- **Brakujący element z miasteczka**: śmigła wiatraka osobno i wiatrak bez śmigieł, żeby mogły się kręcić.

## Format plików

- PNG z przezroczystością albo, jak dotychczas, jednolite **białe tło** z odstępem co najmniej 30 px
  między elementami – skrypt `tools/wytnij_czesci.py` sam je wytnie. Kontur zamknięty, bez białych
  przerw między elementem a tłem.
- Kafle tła (pkt 1) jako pełne obrazy JPG/PNG bez przezroczystości.
- Rozdzielczość jak podana albo większa; nic nie zmniejszać.
- Nazwy plików mogą być dowolne, ale jeden arkusz na grupę: `droga-kafle-*.png`, `droga-wydarzenia.png`,
  `droga-stragany.png`, `droga-cele.png`, `czesci-miedziany-bok.png`, `droga-drobne.png`.

## Kolejność (co odblokowuje najwięcej)

1. Groszak z boku (pkt 5) i stragan (pkt 3) – z tym można zbudować działający prototyp na obecnym tle.
2. Kafle pór roku (pkt 1).
3. Obiekty wydarzeń (pkt 2), obrazki celów (pkt 4) i drobne elementy (pkt 6).

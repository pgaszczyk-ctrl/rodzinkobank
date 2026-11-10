# Groszaki: brief dla grafika – Droga przez rok

## Jak to ma działać

Pod miasteczkiem jest „Droga przez rok”: kręta droga biegnąca **z góry na dół** przez pory roku,
przewijana razem ze stroną. U góry jest „dziś”, na dole koniec 14 miesięcy.
Na drodze nie ma napisów. Wydarzenia i cele to obiekty postawione mniej więcej we właściwym miejscu
na osi czasu:

- **wydarzenie** (Wigilia, ferie, Wielkanoc, wakacje…) – rozpoznawalny obiekt przy drodze, np. choinka
  z prezentami albo namiot kolonii;
- **cel dziecka** – stragan, na którego ladzie leży to, na co dziecko zbiera (hulajnoga, klocki…),
  w dniu, w którym saldo według prognozy na to wystarczy;
- **Groszak** – idzie drogą w dół: gdy dziecko przewija stronę, Groszak drepcze w miejscu na środku
  ekranu, a droga przesuwa się pod nim. Po dotknięciu straganu strona sama przewija się do niego, a Groszak
  „dochodzi” na miejsce. Termin podaje Groszak Księgowy w dymku, więc na samej drodze nie ma tekstu.

Aplikacja układa elementy w kodzie: skleja kafle tła, stawia obiekty na osi i animuje Groszaka.
Grafik dostarcza osobne elementy, a nie gotową, długą panoramę (daty co roku wypadają gdzie indziej).

## Lista elementów

### 1. Tło drogi – kafle pór roku (pionowe, kręta droga)

- 4 kafle: **jesień, zima, wiosna, lato**.
- 4 kafle przejściowe: **jesień → zima, zima → wiosna, wiosna → lato, lato → jesień**.
- Każdy kafel ma **1200 × 1800 px** (pion). Droga wchodzi górną krawędzią i wychodzi dolną **zawsze
  w tym samym miejscu** (np. środek drogi x = 600 px) i z tą samą szerokością (ok. 160 px). Dzięki temu
  kafle łączą się w dowolnej kolejności. Krawędzie górna i dolna muszą do siebie pasować (bez szwu).
- Między krawędziami droga może wić się serpentyną (2–3 zakręty na kafel), ale **nigdy nie zawraca pod
  górę** – zawsze biegnie w dół albo w bok. Groszak idzie wtedy przodem do widza (te części już mamy)
  albo bokiem na poziomych odcinkach.
- Po obu stronach drogi wolne miejsce na obiekty wydarzeń i stragany (najlepiej w zakolach).
- **Osobna warstwa z samą drogą** (droga zamalowana jednym płaskim kolorem, reszta przezroczysta albo
  biała). Z niej aplikacja sama odczyta przebieg drogi i rozłoży daty wzdłuż niej.
- Bez postaci, bez napisów, bez obiektów świątecznych (te stawiamy osobno). Drzewa, krzaki, śnieg,
  kwiatki, łąka mogą być wrysowane w tło.
- Styl i perspektywa jak na mapach miasteczka (lekko z góry, ten sam kontur i paleta).
- Na komputerze droga będzie kolumną o szerokości ok. 800 px, więc kafel powinien dobrze wyglądać
  także w całości, nie tylko w wąskim wycinku telefonu.

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
- Stragan powinien dać się postawić po lewej i po prawej stronie drogi (lustrzane odbicie wystarczy,
  jeśli na straganie nie ma napisów).

### 4. Obrazki celów (zamiast emoji)

Ok. 200 × 200 px, w stylu miasteczka: hulajnoga, rower, rolki, klocki, pluszak, konsola, słuchawki,
książki, farby, piłka, instrument, zwierzątko, prezent (uniwersalny), puzzle. Kolejne można dodawać później.

### 5. Groszak w widoku z boku (na poziome odcinki drogi)

Na odcinkach w dół Groszak idzie przodem – to mamy. Na poziomych zakrętach idzie bokiem, a obecne części
są tylko z przodu. Potrzebne części miedzianego Groszaka w **widoku z boku albo 3/4**, w tym samym
układzie co `czesci-miedziany.jpg`:

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
- Nazwy plików mogą być dowolne, ale jeden arkusz na grupę: `droga-kafle-*.png` (+ `droga-kafle-*-maska.png` z samą drogą), `droga-wydarzenia.png`,
  `droga-stragany.png`, `droga-cele.png`, `czesci-miedziany-bok.png`, `droga-drobne.png`.

## Kolejność (co odblokowuje najwięcej)

1. Jeden kafel pory roku z warstwą drogi (pkt 1) i stragan (pkt 3) – z tym można zbudować działający
   prototyp przewijanej drogi; Groszak przodem już jest.
2. Pozostałe kafle (pkt 1) i Groszak z boku (pkt 5).
3. Obiekty wydarzeń (pkt 2), obrazki celów (pkt 4) i drobne elementy (pkt 6).

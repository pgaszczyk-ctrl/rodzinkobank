# Groszaki: brief dla grafika – Droga przez rok

## ✅ Stan (10 XI 2026)

Zamiast kafli przyszła **jedna pionowa panorama całego roku** (768 × 5472 px, wiosna u góry → zima
i roztopy na dole, droga wchodzi i wychodzi środkiem). Działa jako zapętlony rok: pod dołem znowu jest
góra, więc kafle z pkt 1 nie są już potrzebne. Jest w aplikacji (`zrodla/droga-rok.jpg`).

Z pkt 2 są: worek Mikołaja, choinka, bałwan na nartach (ferie), koszyk z pisankami, balony (Dzień Dziecka),
tornister (1 września), tort (urodziny), drogowskaz (inne wydarzenie rodzica) – `zrodla/droga-wydarzenia.jpg`.

### Prośba do grafika po pierwszym podglądzie (10 XI)

Dekoracje postawione wprost na trawie wyglądają jak naklejki. Potrzebne:

1. **Stolik pod dekoracje.** Niski drewniany stolik (albo ława / skrzynka), widziany lekko z góry,
   w stylu panoramy, z cieniem pod spodem. Dekoracje stoją **na blacie** jako małe przedmioty.
   Najlepiej: pusty stolik osobno + zaznaczone miejsce na blacie, gdzie stawiamy przedmiot
   (wtedy każdą dekorację postawimy na tym samym stoliku). Druga możliwość: każda dekoracja od razu
   narysowana na stoliku. Dekoracje są na drodze małe (ok. 1/7 szerokości panoramy), więc proste kształty.
2. **Pudełko celu zamiast ikonki.** Zwykłe **szare kartonowe pudełko** (nie prezent: bez kokardy,
   bez wstążki, bez kolorowego papieru), zaklejone taśmą, widziane lekko z góry i z boku, z cieniem.
   Na przedniej ściance **pusta biała naklejka** – aplikacja nakleja na nią obrazek tego, co jest w środku
   (hulajnoga, klocki…). Zaznacz prostokątem na osobnej warstwie, gdzie jest naklejka.
   Warianty: zamknięte, **otwarte z wystającym przedmiotem / konfetti** („cel osiągnięty”).
   Zamiast pudełka może być stragan z pkt 3 – wtedy na ladzie stoi takie pudełko.

Do czasu dostarczenia aplikacja rysuje tymczasowe szare pudełko z naklejką (za nim pulsująca poświata
z iskierkami) i prosty stolik pod tortem, workiem, koszykiem i tornistrem. Tort nie może stać na ziemi.

**Nadal brakuje:** obiektów na koniec roku szkolnego i wakacje, stolika i pudełka celu (patrz wyżej) albo
straganu (pkt 3), obrazków celów (pkt 4), Groszaka z boku (pkt 5) i drobnych elementów (pkt 6).

## ⚠️ Korekta po pierwszych kaflach (lato, jesień) – przeczytaj najpierw

Kafle są ładne, ale **nie da się ich połączyć w jedną drogę**. Co trzeba poprawić:

| Problem w obecnych kaflach | Jak ma być |
|---|---|
| Droga wchodzi i wychodzi w różnych miejscach (lato: u góry ok. 60% szerokości, na dole ok. 67%; jesień: u góry ok. 45%) | **Zawsze środek kafla**: oś drogi x = 600 px, droga od x = 520 do x = 680 px – i u góry, i na dole, w każdym kaflu |
| Jesień ma horyzont, niebo i perspektywę: droga u góry wąska, na dole dwa razy szersza | **Widok prosto z góry**, jak na mapie. Bez nieba i horyzontu. Droga ma **wszędzie tę samą szerokość: 160 px** |
| Przy krawędzi kafla droga skręca, a drzewa i krzaki są ucięte | **Pas łączenia**: górne 150 px i dolne 150 px kafla to prosty, pionowy odcinek drogi na samej trawie/ziemi. Żadne drzewo, krzak ani kamień nie przecina górnej ani dolnej krawędzi |
| Różny rozmiar (1342 × 2000) | **1200 × 1800 px** (albo dokładnie 2× więcej: 2400 × 3600) |
| Inny kolor i kontur drogi w każdej porze | Droga w pasach łączenia **w tym samym kolorze i z tym samym konturem** we wszystkich kaflach (śnieg na drodze zimą tylko w środku kafla, nie w pasach) |

**Pomiędzy pasami łączenia – pełna swoboda**: 2–4 zakręty, serpentyny, odcinki w bok, zakola na stragany.
Jedyny zakaz: droga **nie wraca pod górę** i nie zmienia szerokości.

Sprawdzian, zanim oddasz kafel: połóż go **pod samym sobą** (dół kafla przy górze tego samego kafla)
i pod każdym innym kaflem. Szwu nie może być widać.

Do pobrania z repozytorium:
- `docs/szablon-kafla-drogi.png` – szablon z wymiarami (pasy łączenia, oś drogi, przykładowa serpentyna),
- `docs/szablon-kafla-drogi-maska.png` – sam kształt drogi (czarna droga na białym tle). Można go użyć
  jako podkładu w generatorze obrazów (np. img2img / ControlNet / „structure reference”) albo jako
  warstwę w programie graficznym i malować wokół niej. Przebieg w środku wolno zmienić, pasy łączenia nie.

Zimowy kafel i 4 kafle przejściowe (jesień → zima itd.) robimy według tych samych zasad: w kaflu
przejściowym górna połowa ma kolory jednej pory roku, dolna – następnej, a pasy łączenia pasują do obu sąsiadów.

### Gotowy prompt do generatora (po angielsku generatory działają lepiej)

> Seamless vertical game map tile, 1200×1800 px, strict top-down orthographic view (no perspective,
> no horizon, no sky). A dirt path of constant width (160 px) winds through a {SEASON} meadow with
> 2–4 smooth bends and wide pockets of open grass beside the path. The path never turns back upward.
> IMPORTANT: in the top 150 px and the bottom 150 px of the image the path is perfectly straight and
> vertical, centered horizontally (from x=520 to x=680), with only plain grass around it — no trees,
> bushes or rocks touching the top or bottom edge, so the tile can be stacked above and below itself
> seamlessly. Cozy hand-drawn children's book style, clean brown outlines, soft flat colors, matching
> the attached town map. No characters, no text, no holiday objects.

Zamień `{SEASON}` na: `autumn (orange and red trees, falling leaves, pumpkins)`, `winter (snow, bare and
snowy pine trees)`, `spring (fresh green, blossoms, tulips)`, `summer (lush green, flowers)`.
Do promptu dołącz `szablon-kafla-drogi-maska.png` jako obraz sterujący i mapę miasteczka jako wzór stylu.

Jeśli generator nie trafi idealnie w piksele, wystarczy, że pasy łączenia będą **mniej więcej** proste
i na środku – resztę (dosunięcie o kilkanaście pikseli, wyrównanie szwu) zrobi skrypt po naszej stronie.
Perspektywy i drogi wchodzącej z boku nie da się naprawić skryptem.

---

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

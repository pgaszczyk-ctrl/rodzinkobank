# Próba rynku w Canvas

`rynek-podglad.html` to osobny podgląd integracyjny, bez zmian w głównej aplikacji i bez połączenia z bazą. Uruchom z katalogu repozytorium:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Otwórz lokalnie `/rynek-podglad.html`. Dostępne są kadry rynku, obu stanowisk i całej mapy, suwak czasu, odtwarzanie, ograniczenie ruchu i przełącznik przedniej warstwy straganu. Odtwarzanie wymaga ręcznego uruchomienia; ukrycie karty zatrzymuje animację.

Aktualne materiały w `assets/groszaki/design/rynek/v5/` skopiowano bez zmian z commita grafika `8715baa` na `design/groszaki-rynek`. Są makietą; oryginalny podgląd SVG pozostaje w tym katalogu. Starszy zestaw v4 pozostaje jako odniesienie i test zgodności wstecznej. Render Canvas w `src/groszaki/scena.js` używa tego samego manifestu. Obsługuje lokalne pozycje, obroty, odbicia, pivoty w pikselach pliku, hierarchię części i osobne cienie. Pozycja jabłka uwzględnia pełny łańcuch transformacji, w tym odbicie ramienia.

## Sprawdzone

- Wczytanie wszystkich materiałów i zgodność rozmiarów źródeł z manifestem.
- Interpolacja naprawy i nieruchomy kontakt młotka od 700 do 920 ms.
- Przenoszenie jabłka wraz z dłonią, pozostawienie go w miejscu odłożenia, wygaszenie oraz pojawienie się następnego w koszyku zgodnie z `seller.appleReset`.
- Domknięcie pętli 3400 ms: identyczna pozycja ręki, głowa i stan obu jabłek na początku i końcu.
- Interpolacja przechyłu głowy również z klatek bez jawnego pola `headTilt`.
- Przednia warstwa straganu rzeczywiście zmienia piksele renderu po przełączeniu. Złożenie jej z rekonstrukcją tła odtwarza oryginalny kadr piksel w piksel.
- Cztery kadry, ręczny czas, odtwarzanie, ręczne i systemowe ograniczenie ruchu.
- Testy Node: odrzucenie cyklu i brakującego rodzica, dziedziczenie obrotu/odbicia, kontakt młotka, tor jabłka, domknięcie pętli, przenikanie jabłek i przechył głowy.

## Ograniczenia do zamknięcia z grafikiem

- Przesłona jest dopasowana do natywnej mapy, ale pod nią znajduje się interpolowana rekonstrukcja; wymaga retuszu artystycznego przed finalnym eksportem.
- Zmiana jabłek to umowne przenikanie między cyklami zgodne z makietą grafika, a nie fizyczne pobranie następnego owocu.
- Brakuje docelowych źródeł w wysokiej rozdzielczości i zatwierdzenia artystycznego.
- Postacie w próbie nie są jeszcze powiązane z symulacją salda. Groszak w scenie to próbna postać do oceny animacji.
- Kolejność rysowania pochodzi z manifestu. Integracja z trasami i przesłonami całego miasteczka nastąpi po otrzymaniu finalnych warstw.

Nie należy włączać tej sceny automatycznie na produkcji przed zamknięciem powyższych punktów.

## Kadr v8 i źródła do animacji

Po uruchomieniu lokalnego serwera otwórz `/rynek-v8-podglad.html`.
Podgląd zaczyna od zatwierdzonego kadru. „Odtwórz próbę” pokazuje osobne tło
i klatki postaci w Canvas. Groszak podchodzi do skrzynki, uderza młotkiem
i wraca, a sprzedawczyni odkłada jabłko. To próba ruchu w kadrze 1448 × 1086,
z opcją szerokości 390 px i bez automatycznego odtwarzania. Klatki są nowymi
rysunkami opartymi na v8. Współrzędne tras są lokalne dla kadru. W rozszerzonej próbie piekarz niesie
pieczywo, klientka idzie z koszykiem, a dwa Groszaki transportują skrzynki.
Trasy mają różne przesunięcia w czasie i postoje. Canvas sortuje postacie
według położenia stóp. Cały pokaz trwa 19,2 s.

Do odtworzenia kadru w Canvas potrzebne są eksporty z jednej kompozycji,
w natywnej skali 1448 × 1086, z kompletnym podłożem pod postaciami i skrzynką:

- Tło z piekarnią, placem i roślinnością, tył straganu oraz osobna przednia
  przesłona z ladą i słupkami. Kolejność musi uwzględniać stronę, po której
  znajduje się postać.
- Pełne klatki sylwetki Groszaka dla chodu, postoju i naprawy. Punkt stóp
  wspólny dla wszystkich klatek pozwala przemieszczać go po trasie mapy.
  Naprawa zaczyna się przy skrzynce, a młotek jest częścią klatek naprawy.
- Pełne klatki gestu sprzedawczyni, od chwytu do odłożenia jabłka.
  Do odłożenia owoc należy do klatki gestu, a po nim jest rysowany w skrzynce.
- Skrzynka i osobne cienie kontaktowe. W manifeście potrzebne są punkty
  stóp, położenie stanowisk, punkt odłożenia jabłka i kolejność przesłaniania.

Przed animacją należy złożyć pozę spoczynkową w tym samym kadrze i porównać
ją z zatwierdzoną ilustracją. Przy ocenie chodu i obu czynności w 390 px
sprawdzamy kontur, paletę, kontakt stóp z ziemią oraz kontakt dłoni z
młotkiem i jabłkiem w każdej pozie.

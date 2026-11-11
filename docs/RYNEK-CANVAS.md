# Próba rynku w Canvas

`rynek-podglad.html` to osobny podgląd integracyjny, bez zmian w głównej aplikacji i bez połączenia z bazą. Uruchom z katalogu repozytorium:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Otwórz lokalnie `/rynek-podglad.html`. Dostępne są kadry rynku, obu stanowisk i całej mapy, suwak czasu, odtwarzanie i ograniczenie ruchu. Odtwarzanie wymaga ręcznego uruchomienia; ukrycie karty zatrzymuje animację.

Materiały w `assets/groszaki/design/rynek/v4/` skopiowano bez zmian z commita grafika `6046889` na `design/groszaki-rynek`. Są makietą; oryginalny podgląd SVG pozostaje w tym katalogu. Render Canvas w `src/groszaki/scena.js` używa tego samego manifestu. Obsługuje lokalne pozycje, obroty, odbicia, pivoty w pikselach pliku, hierarchię części i osobne cienie. Pozycja jabłka uwzględnia pełny łańcuch transformacji, w tym odbicie ramienia.

## Sprawdzone

- Wczytanie wszystkich materiałów i zgodność rozmiarów źródeł z manifestem.
- Interpolacja naprawy i nieruchomy kontakt młotka od 700 do 920 ms.
- Przenoszenie jabłka wraz z dłonią, pozostawienie go w miejscu odłożenia.
- Cztery kadry, ręczny czas, odtwarzanie, ręczne i systemowe ograniczenie ruchu.
- Testy Node: odrzucenie cyklu i brakującego rodzica, dziedziczenie obrotu/odbicia, kontakt młotka i tor jabłka.

## Ograniczenia do zamknięcia z grafikiem

- Cykl sprzedawczyni kończy się innym kątem ręki i inną głową niż zaczyna; zapętlenie powoduje skok. Potrzebna jawna faza powrotu. Podgląd odtwarza dostarczone klatki bez ukrywania tego braku.
- Nie ma dopasowanej przesłony straganu ani odtworzonego tła; robocza przesłona pozostaje wyłączona zgodnie z manifestem.
- Brakuje docelowych źródeł w wysokiej rozdzielczości i zatwierdzenia artystycznego.
- Postacie w próbie nie są jeszcze powiązane z symulacją salda. Groszak w scenie to próbna postać do oceny animacji.
- Kolejność rysowania pochodzi z manifestu. Integracja z trasami i przesłonami całego miasteczka nastąpi po otrzymaniu finalnych warstw.

Nie należy włączać tej sceny automatycznie na produkcji przed zamknięciem powyższych punktów.

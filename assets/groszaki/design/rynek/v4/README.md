# Iteracja 4 · jabłko i stanowisko

W katalogu głównym repozytorium uruchom `python -m http.server 8000 --bind 127.0.0.1`. Otwórz [podgląd](http://127.0.0.1:8000/assets/groszaki/design/rynek/v4/rynek.html). Są cztery kadry, w tym dodatkowe zbliżenia uderzenia i sprzedawczyni, oraz ręczny wybór klatek i tryb ograniczonego ruchu.

Podgląd pobiera [manifest](manifest.json) i buduje scenę z jego pozycji, rozmiarów, punktów obrotu i relacji nadrzędnych. Ramię Groszaka i młotek używają lokalnych współrzędnych, odpowiednio (9, −8) w układzie korpusu i (0, 10) w układzie ramienia. Pivot młotka jest zapisany w pikselach jego PNG i przeliczany na rozmiar świata podczas rysowania.

Rozdzielone PNG sprzedawczyni obejmują dwie głowy, tułów, nogi, ramię użyte po obu stronach, koszyk oraz pojedyncze jabłko. W próbie jabłko przemieszcza się z koszyka do straganu, po czym postać odwraca głowę w kierunku Groszaka i wykonuje krótki gest. Stanowisko ma osobną skrzynkę, deskę, młotek i trzy niezależne cienie.

Przednia plecionka jest dostarczona jako osobny próbny PNG z pierwszej iteracji. Jest oznaczona w manifeście jako ukryta, bo podgląd korzysta z istniejącego straganu wkomponowanego w oryginalną mapę. Do produkcji potrzebna jest przesłona zgodna pikselowo z tym straganem i odtworzenie fragmentu za nią. Dostarczone części są roboczymi źródłami animacji, w tym deska nad istniejącą kompletną skrzynką. Master mapy 6000 × 3348 oraz finalna retuszerska integracja pozostają osobnym etapem.

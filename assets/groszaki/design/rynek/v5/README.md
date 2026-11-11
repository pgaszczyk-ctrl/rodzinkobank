# Iteracja 5 · pętla sprzedawczyni i przesłona straganu

W katalogu głównym repozytorium uruchom `python -m http.server 8000 --bind 127.0.0.1` i otwórz [podgląd rynku](http://127.0.0.1:8000/assets/groszaki/design/rynek/v5/rynek.html).

- Sprzedawczyni wraca ręką i spojrzeniem do pozy początkowej. Pętla trwa 3400 ms. Od 2830 do 3190 ms odłożone jabłko zanika, a kolejne pojawia się w koszyku. To umowna zmiana między cyklami, oddzielna od ruchu odkładania.
- `manifest.json` zapisuje offset chwytu przed odbiciem i obrotem ramienia. `seller.appleReset` opisuje czas wygaszania dwóch instancji jabłka. Integracja Canvas może użyć tych samych danych, ale wymaga obsługi nowych pól. Pokaz jest w podglądzie SVG.
- `przeslona-straganu.png` zawiera wycięte z oryginalnej mapy przednie słupki i górną krawędź lady. Leży na (670, 652), a linia gruntu jest w `stall.groundLine`. Nakładka rysuje się po jabłku i przesłania je tam, gdzie się przecinają.
- `stragan-pod-przeslona.png` zawiera roboczą rekonstrukcję powierzchni pod wyciętymi pikselami. Przełącznik Przesłona pokazuje tę rekonstrukcję. Po złożeniu obu warstw bez ruchomych elementów piksele odpowiadają oryginalnemu kadrowi.

Obie warstwy straganu są w natywnej skali mapy 2000 × 1116. Odsłonięte powierzchnie są interpolowane z sąsiednich pikseli i wymagają ręcznego retuszu do finalnego mastera 6000 × 3348.

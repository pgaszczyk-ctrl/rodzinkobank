# Iteracja 2 · jesienna naprawa skrzynki

Otwórz lokalnie [podgląd HTML](naprawa-skrzynki.html) z pobranego repozytorium. Działa bez serwera. Pokazuje całą mapę, kadr kamery i cztery kluczowe pozy, które można przełączać ręcznie lub odtwarzać w pętli. Przyjąłem kadr 370 × 278 px z mapy 2000 × 1116 px, wyświetlany na szerokości do 390 CSS px. W masterze 6000 × 3348 ten sam kadr zajmie 1110 × 834 px. Oryginalna mapa, piekarnia, stragany i ścieżki tworzą ciągłe tło. Scena dodaje postacie i stanowisko naprawy bez wklejanego fragmentu podłoża.

Groszak używa istniejących części z katalogu miedziany. Sprzedawczyni pochodzi z wariantu ludzkiego, który właściciel wybrał w rozmowie projektowej. Podgląd sprawdza jej skalę obok Groszaka i zabudowy. Sprzedawczyni pozostaje w jednej pozie na czas oceny ruchu naprawy.

## Proponowany podział źródeł

| Element | Warstwy i punkty animacji |
| --- | --- |
| Groszak | Korpus z obrotem u podstawy, buzia, osobne ręce z punktami ramion, dłonie i punkty chwytu, nogi, młotek, cień. |
| Sprzedawczyni | Głowa, tułów, dwie ręce i dłonie, nogi, koszyk, przekładane jabłko i cień. |
| Stragan | Konstrukcja z pełnym blatem, oddzielna tkanina, towary, przednie słupki i plecionka jako przesłony. |
| Stanowisko | Kompletna skrzynka z wnętrzem, luźna deska, zapasowe skrzynki, niezależne cienie i pełne podłoże. |
| Roślinność | Oddzielne kępki zakotwiczone u podstawy. |

Współrzędne robocze w układzie oryginalnej mapy (x w prawo, y w dół) to (645, 765) dla stóp Groszaka, (674, 765) dla podstawy skrzynki i (805, 732) dla sprzedawczyni. W eksporcie produkcyjnym manifest powinien zapisać dla każdego pliku rozmiar źródła, współrzędne na mapie, pivot, punkty chwytu i kolejność rysowania. Podgląd używa istniejącej mapy 2000 × 1116 i warstw z pierwszej iteracji. Master 6000 × 3348 oraz nowe warstwy produkcyjne wymagają osobnego przygotowania po ocenie kadru i ruchu.

# Groszaki — Cztery pory roku

Otwórz `podglad.html` bezpośrednio w przeglądarce. Podgląd działa offline, pokazuje trzy sezony i ma ręczny wybór pierwszej pory roku oraz przycisk pauzy. `podglad-HD.png` to render 3000 × 1440 px z jesienią, zimą i wiosną. Docelowe grafiki są osobnymi SVG z przezroczystością tam, gdzie element nakłada się na inne warstwy.

## Składanie sceny

- `scena.json` zawiera wymiary plików, pozycje, skale, obroty, kotwice i kolejność rysowania od tła do przodu. Współrzędne sceny to 1500 × 720. Powierzchnia gruntu leży na Y = 252. Każdy sezon zajmuje 500 jednostek szerokości.
- Dla elementu wykonaj kolejno przesunięcie do `[x,y]`, obrót w stopniach wokół kotwicy, skalę i odjęcie `pivot` podanego w lokalnych współrzędnych pliku. Domyślna kotwica to `[0,0]`. Zachowaj proporcje sceny przy skalowaniu.
- Role `season:<slot>:<plik>` przełączaj na odpowiednik z folderu właściwej pory roku. Podstawowy sezon bierze miesiąc z daty w strefie Europe/Warsaw według miesięcy meteorologicznych. Wybierz bieżący sezon i dwa następne, zawijając cykl modulo 4.
- `wzgorza-i-powierzchnia.svg` ma wspólny profil na obu brzegach. Ziemia i kopalnia są wspólne dla całej panoramy.
- W module marchwi korzeń i nać mają tę samą kotwicę. Osadź ją 1 px pod powierzchnią i zmieniaj obydwa pliki razem między etapami `kielek`, `mloda` i `dojrzala`. Liście można kołysać wokół kotwicy.
- Górnicy są namalowani od nowa na podstawie makiety. W folderze `gornicy/klatki` są osobne PNG z alfą. Odpowiedniki SVG zawierają te same obrazy rastrowe do bezpośredniego użycia w demonstracji.
- Cztery klatki kopania mają wspólny rozmiar 560 × 510 i kotwicę stóp [245, 490]. Odtwarzaj je według `animationRigs.uderzenie.frames` w `scena.json`. Klatka uderzenia ma indeks 2. Kilof i dłonie są namalowane razem w każdej pozie, dzięki czemu trzonek pozostaje w chwycie.
- Wózek ma oddzielne koła i złoto. Winda ma oddzielną klatkę. Światła, pył i iskry są niezależnymi nakładkami.

| Pierwsza pora | Druga | Trzecia |
| --- | --- | --- |
| Wiosna | Lato | Jesień |
| Lato | Jesień | Zima |
| Jesień | Zima | Wiosna |
| Zima | Wiosna | Lato |

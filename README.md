# Rodzinobank

Domowy „Tata-Bank” dla dzieci: dziecko odkłada kieszonkowe u rodziców, a im dłużej monety czekają, tym większą dostają **Premię za cierpliwość** (od +5% po 1 miesiącu do +50% po 6 miesiącach, potem cykl zaczyna się od powiększonej kwoty).

Cała aplikacja to jeden plik: `index.html` (Tailwind CSS z CDN + czysty JavaScript). Wystarczy otworzyć go w przeglądarce.

## Co jest w środku
- **Wielki Skarbiec** – licznik na żywo, co 10 s dolicza ułamki groszy i wypuszcza monety; pod nim kopalnia z kręcącymi się zębatkami i blokowymi górnikami.
- **Schody Cierpliwości** – pokazują, na którym schodku premii jest najstarsza wpłata.
- **3 Marzenia** – Proste / Średnie / Niesamowite, z własnym zdjęciem (wgranie pliku lub link) i paskiem postępu.
- **Magiczna Oś Oszczędzania** – rok podzielony na pory roku; po wpisaniu kwoty (domyślnie 10 zł) i częstotliwości pokazuje, kiedy każde marzenie będzie w zasięgu.
- **Strefa Rodzica** – chroniona zagadką z tabliczki mnożenia: wpłaty (także z datą wsteczną), wypłaty, historia.

Dane zapisują się w `localStorage` przeglądarki (tylko na tym urządzeniu).

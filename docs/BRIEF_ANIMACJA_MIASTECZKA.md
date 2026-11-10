# Groszaki: brief – życie w miasteczku (animacja pracy)

## Co chcemy zmienić

Dziś Groszaki dreptają do straganu, stoją chwilę i wracają z okruszkiem. Wygląda to, jakby nic nie robiły.
Chcemy, żeby **było widać, że pomagają mieszkańcom i za to dostają okruszek** (odsetki), który niosą do Skarbca.

Przekaz dla dziecka: *pieniądze w Skarbcu nie leżą – pracują, pomagają innym i dlatego przybywa ich.*

## Najważniejsze: dwa różne produkty

| | A. Film pokazowy | B. Animacja w aplikacji |
|---|---|---|
| Do czego | ekran powitalny, strona www, reklama | miasteczko, które ogląda dziecko |
| Narzędzie | generator wideo (Sora, Veo, Kling, Runway) | generator obrazków (ChatGPT, Midjourney) + kod |
| Wynik | gotowy plik MP4/WebM, pętla 8–15 s | arkusze postaci i rekwizytów na białym tle |
| Czy liczba Groszaków = saldo | nie, to tylko film | tak, Groszaki są rysowane w kodzie |

W aplikacji **nie da się użyć filmu z generatora**: Groszaków jest tyle, ile dziecko ma pieniędzy, chodzą po trasach,
reagują na dotknięcie i niosą okruszki w chwili naliczenia odsetek. Dlatego do aplikacji zamawiamy **części**
(mieszkańców, rekwizyty, nowe pozy), a ruch składamy w kodzie – tak jak dziś Groszaka z `czesci-miedziany.jpg`.

---

## Mieszkańcy i łańcuch pracy

Propozycja: w miasteczku mieszkają małe zwierzątka. Groszaki im pomagają, a praca tworzy łańcuch
od pola do rynku – dziecko widzi, skąd się bierze wartość.

```
pole i stodoła ──► młyn ──► piekarnia ──► stragany ──► okruszek ──► Skarbiec
 (zboże, dynie)   (mąka)   (bułki)      (sprzedaż)
```

| Miejsce (punkt w `trasy.json`) | Mieszkaniec | Co robi Groszak (pętla 4–8 s) | Rekwizyty |
|---|---|---|---|
| `dynie` (1708, 612) | Kret-ogrodnik | podnosi dynię, toczy ją do kosza | dynia mała, kosz wiklinowy |
| `podworze` (1645, 478) | Owieczka | nosi snopek siana, wrzuca do żłobu | snopek siana, żłób |
| `stodola` (1812, 812) | Borsuk-rolnik | podaje worek zboża na taczkę, pcha taczkę | worek zboża, taczka |
| `mlyn` (422, 812) | Myszka-młynarka | wsypuje zboże do leja, odbiera worek mąki | worek mąki (biały), lej |
| `piekarnia` (866, 672) | Jeż-piekarz | niesie mąkę do drzwi, wynosi tacę bułek | taca z bułkami, bochenek |
| `stragan-a` (560, 672) | Wiewiórka | układa jabłka w skrzynce | skrzynka jabłek |
| `stragan-b` (488, 752) | Królik | ustawia marchewki i kapustę | koszyk warzyw |
| `stragan-c` (712, 756) | Lis-kupiec | podaje paczkę klientowi (innemu zwierzątku) | papierowa torba |

Koniec każdej pracy: **mieszkaniec macha i podaje Groszakowi okruszek**, Groszak robi radosny podskok
i rusza do Skarbca. To jedna chwila, która tłumaczy „odsetki” bez słowa.

Dodatkowo (tło, bez Groszaków – zapętlone warstwy): kręcące się skrzydła wiatraka, koło młyna wodnego,
lśnienie rzeki, kołyszące się szyldy straganów, dym z kominów (już jest), spadające liście jesienią.

---

## B. Prompty do aplikacji (ChatGPT / generator obrazków)

Zawsze dołącz do rozmowy: `assets/groszaki/zrodla/mapa-jesien.jpg` (styl) i `assets/groszaki/zrodla/arkusz-postaci.jpg`
(wygląd Groszaka). Każdy arkusz osobno. Zasady wspólne – wklej na początku rozmowy:

> Style reference: the attached town map and coin-character sheet. Cozy hand-drawn children's book style,
> clean warm-brown outlines, soft flat colors, gentle shading, no gradients on the background.
> Every sheet: pure white background (#FFFFFF), objects well separated with at least 60 px of empty space
> between them, no shadows touching other objects, no text, no labels, no frames.
> Camera: the same slight top-down three-quarter view as the town map.

### B1. Mieszkańcy (jeden arkusz na postać)

> Character sheet of {CHARACTER}, a small friendly villager of the coin town, about 1.3× the height of the
> coin characters on the attached sheet. Show 4 poses side by side, all facing right:
> 1) standing and smiling, 2) waving one paw, 3) holding out a tiny shiny copper crumb (a reward) with both paws,
> 4) {WORK_POSE}. Wears {OUTFIT}. Same outline thickness and palette as the town map.

Podstawienia:

| {CHARACTER} | {WORK_POSE} | {OUTFIT} |
|---|---|---|
| a hedgehog baker | holding a tray of buns | white baker's hat and apron |
| a mouse miller | lifting a sack of flour | dusty flour-white apron, cap |
| a badger farmer | leaning on a pitchfork | straw hat, dungarees |
| a mole gardener | holding a small watering can | round glasses, green scarf |
| a sheep | munching hay | small bell on a ribbon |
| a squirrel fruit seller | holding a red apple | striped market apron |
| a rabbit vegetable seller | holding a carrot bunch | checkered neckerchief |
| a fox merchant | handing over a paper bag | waistcoat |

### B2. Rekwizyty (jeden arkusz)

> Prop sheet for the coin town, 14 separate small objects on white, each drawn at the scale it would have next to
> the coin characters: small pumpkin, wicker basket, hay bundle, wooden feeding trough, grain sack (tied),
> wooden wheelbarrow (side view), flour sack (white, tied), tray with 5 buns, round bread loaf,
> crate of red apples, basket of carrots and cabbage, brown paper shopping bag,
> tiny shiny copper crumb (coin fragment) with a sparkle, small watering can.

### B3. Nowe pozy Groszaka (części, nie całe postacie)

Groszak jest wycinanką: korpus + buzia + rączki + nóżki. Do pracy potrzebujemy tylko nowych **rąk z uchwytem**:

> Parts sheet for the copper coin character from the attached sheet, same size and outline as its existing arm
> and leg parts. Separate pieces on white: 1) arm bent forward, open hand, for carrying a box in front,
> 2) arm stretched up holding (empty grip), 3) arm pushing forward (for pushing a wheelbarrow),
> 4) two new faces: "effort" (eyes squeezed, cheeks puffed) and "proud" (eyes closed, big smile).
> Each arm has a rounded top end (shoulder) so it can rotate around it.

Później ten sam arkusz dla srebrnego i dwukolorowego Groszaka.

### B4. Warstwy tła do zapętlenia (opcjonalnie)

> Separate overlay pieces matching the attached town map exactly in scale and angle, on white:
> 1) the windmill's four sails as one piece, centered on the hub, so it can be rotated,
> 2) the water-mill wheel seen at the same angle, so it can be rotated,
> 3) each of the 5 market stall awnings alone (so they can sway slightly).

Pozycje na mapie (wiatrak, koło młyna) dopiszemy w konfiguracji, tak jak przesłony w `przeslony.json`.

### Jak oddać pliki

- PNG lub JPG, białe tło (wytniemy skryptem `tools/` jak części Groszaka), min. 2048 px dłuższy bok.
- Nazwy: `mieszkaniec-jez.jpg`, `rekwizyty.jpg`, `czesci-miedziany-praca.jpg`, `tlo-ruchome.jpg`
  → do `assets/groszaki/zrodla/`.
- Ruch (kto gdzie stoi, co niesie, ile trwa pętla) składamy w kodzie na podstawie tabeli z sekcji
  „Mieszkańcy i łańcuch pracy”.

---

## A. Prompt do filmu pokazowego (Sora / Veo / Kling / Runway)

Pierwsza klatka: `assets/groszaki/zrodla/mapa-jesien.jpg` (tryb „image to video”). Kamera ma stać,
bo mapa w aplikacji to ten sam kadr.

> Animate this exact illustrated autumn town map. Locked camera, no zoom, no pan, keep every building, path,
> river and bridge exactly where it is; the art style must stay hand-drawn and flat like the input image.
> Bring the town to life: dozens of tiny round copper coin characters with small arms and legs (like little
> walking coins with cute faces) are busy helping the animal villagers.
> Near the pumpkin field on the right, coins roll pumpkins into baskets for a mole; by the red barn they push a
> wheelbarrow of grain sacks for a badger; at the windmill and water mill on the left they carry grain in and
> flour sacks out; at the bakery in the middle a hedgehog baker hands them trays of buns, which they carry to
> the market stalls where a squirrel, a rabbit and a fox sell fruit and vegetables to villagers.
> After each task the villager gives the coin a tiny shiny copper crumb; the coin hops with joy and carries the
> crumb over the bridge and up the long winding staircase into the domed vault on the hill, where the pink
> piggy on the roof gently bobs. Windmill sails turn slowly, the water wheel spins, the river shimmers,
> autumn leaves drift, light smoke rises from chimneys.
> Calm, cozy, cheerful pace, seamless loop, 10 seconds, no text, no people.

Wskazówki:
- Generatory gubią drobne postacie – jeśli Groszaki wychodzą rozmazane, wygeneruj 2–3 zbliżenia
  (rynek, farma, schody do Skarbca) i zmontuj je jako osobne ujęcia.
- Pętla: ostatnią klatkę poproś „ending on the same frame as the input image” albo zmontuj z przenikaniem.
- Wersje pór roku: podmień mapę na `mapa-zima.jpg` itd. i słowo „autumn” w prompcie
  (zimą: odśnieżanie, sanki z workami zamiast taczki; latem: zbieranie truskawek; wiosną: sadzenie).

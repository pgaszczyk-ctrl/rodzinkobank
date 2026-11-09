#!/usr/bin/env python3
"""Wycina części Groszaków z arkuszy na białym tle.

Użycie:  python3 tools/wytnij_czesci.py            (wszystkie materiały)
         python3 tools/wytnij_czesci.py miedziany  (jeden materiał)

Czyta assets/groszaki/czesci.config.json, arkusze z assets/groszaki/zrodla/
(pliki źródłowe zostają bez zmian) i zapisuje:
  assets/groszaki/<material>/<czesc>.webp   – przezroczyste części
  assets/groszaki/czesci.json               – rozmiary, punkty obrotu, buzie

Jak usuwane jest tło:
 1. Flood fill od krawędzi pola części po jasnych pikselach. Zatrzymuje się na
    ciemnym konturze, więc białe odblaski wewnątrz monety zostają nietknięte.
 2. Piksele tła dostają przezroczystość metodą „kolor → alfa” względem bieli:
    półprzezroczysty brzeg konturu traci białą domieszkę (brak białej obwódki),
    a poświata okruszka i bąbelki stają się naturalnie półprzezroczyste.
 3. Szum JPEG przy zerowej alfie jest usuwany, maska lekko rozmyta.
Wymaga: Pillow, numpy.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
GROSZ = ROOT / 'assets' / 'groszaki'
SRC = GROSZ / 'zrodla'

# Tryb twardy (korpus, kończyny, buzie, plecak): tło to prawie biel połączona
# z krawędzią pola (NEAR_WHITE) oraz jasny, mieszany z bielą brzeg o szerokości
# FRINGE px (najciemniejszy kanał > FRINGE_LIGHT). Reszta jest w pełni kryjąca,
# więc rumieńce i odblaski nie robią się półprzezroczyste.
NEAR_WHITE = 225
FRINGE = 2
FRINGE_LIGHT = 150
# Tryb miękki (okruszek z poświatą, bąbelki): wypełnienie idzie aż do ciemnego
# konturu (LIGHT), a poświata i bąbelki stają się półprzezroczyste.
LIGHT = 110
ALPHA_FLOOR = 0.05      # poniżej – całkowicie przezroczyste (szum JPEG)
MASK_BLUR = 0.6         # lekkie rozmycie maski (px)
PAD = 4                 # margines wokół wyciętej części


def background_mask(rgb: np.ndarray, limit: int) -> np.ndarray:
    """True tam, gdzie jasne piksele (min. kanał > limit) łączą się z krawędzią pola."""
    h, w, _ = rgb.shape
    light = rgb.min(axis=2) > limit
    # ramka 1 px, żeby wypełnienie mogło obejść całe pole
    canvas = np.zeros((h + 2, w + 2), np.uint8)
    canvas[1:-1, 1:-1] = np.where(light, 255, 0)
    canvas[0, :] = canvas[-1, :] = 255
    canvas[:, 0] = canvas[:, -1] = 255
    img = Image.fromarray(canvas).copy()  # kopia: obraz ze wspólnej pamięci numpy jest tylko do odczytu
    ImageDraw.floodfill(img, (0, 0), 128, thresh=0)
    return (np.asarray(img)[1:-1, 1:-1] == 128)


def dilate(mask: np.ndarray, r: int) -> np.ndarray:
    img = Image.fromarray(np.where(mask, 255, 0).astype(np.uint8))
    return np.asarray(img.filter(ImageFilter.MaxFilter(2 * r + 1))) > 0


def large_holes(rgb: np.ndarray, core: np.ndarray, min_area: int) -> np.ndarray:
    """Zamknięte prawie białe obszary większe niż min_area (np. prześwit między szelką a plecakiem)."""
    cand = (rgb.min(axis=2) > NEAR_WHITE) & ~core
    img = Image.fromarray(np.where(cand, 255, 0).astype(np.uint8)).copy()
    out = np.zeros_like(cand)
    while True:
        arr = np.asarray(img)
        ys, xs = np.nonzero(arr == 255)
        if not len(xs):
            return out
        ImageDraw.floodfill(img, (int(xs[0]), int(ys[0])), 100, thresh=0)
        comp = np.asarray(img) == 100
        if comp.sum() >= min_area:
            out |= comp
        img.paste(1, mask=Image.fromarray(np.where(comp, 255, 0).astype(np.uint8)))


def cut(region: Image.Image, soft=False, holes=0) -> Image.Image:
    rgb = np.asarray(region.convert('RGB')).astype(np.float32)
    if soft:
        bg = background_mask(rgb, LIGHT)
    else:
        core = background_mask(rgb, NEAR_WHITE)
        if holes:
            core |= large_holes(rgb, core, holes)
        bg = core | (dilate(core, FRINGE) & (rgb.min(axis=2) > FRINGE_LIGHT))

    # kolor → alfa względem bieli (tylko dla pikseli tła)
    deficit = (255.0 - rgb).max(axis=2) / 255.0
    alpha = np.where(bg, deficit, 1.0)
    alpha = np.where(bg & (alpha < ALPHA_FLOOR), 0.0, alpha)
    a3 = np.clip(alpha, 1e-6, 1)[..., None]
    unmixed = (rgb - (1 - a3) * 255.0) / a3
    out_rgb = np.where(bg[..., None], unmixed, rgb)
    out_rgb = np.clip(out_rgb, 0, 255)

    a_img = Image.fromarray((alpha * 255).round().astype(np.uint8), 'L')
    a_img = a_img.filter(ImageFilter.GaussianBlur(MASK_BLUR))
    a = np.asarray(a_img).astype(np.float32)
    a = np.where(a < ALPHA_FLOOR * 255, 0, a)
    rgba = np.dstack([out_rgb, a]).round().astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA')


def tight_box(img: Image.Image, keep_y=False):
    a = np.asarray(img)[..., 3]
    ys, xs = np.nonzero(a > 8)
    if not len(xs):
        raise SystemExit('Pusta część – sprawdź pole w czesci.config.json')
    x0, x1 = max(0, xs.min() - PAD), min(img.width, xs.max() + 1 + PAD)
    y0, y1 = (0, img.height) if keep_y else (max(0, ys.min() - PAD), min(img.height, ys.max() + 1 + PAD))
    return x0, y0, x1, y1


def save(img: Image.Image, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, 'WEBP', lossless=True, method=6)


def process_material(mat, layout):
    sheet = Image.open(SRC / mat['arkusz']).convert('RGB')
    lay = {**layout, **mat.get('uklad', {})}
    out_dir = GROSZ / mat['id']
    meta = {'nazwa': mat.get('nazwa', mat['id']), 'czesci': {}, 'buzie': {}}

    def simple(name, spec):
        x0, y0, x1, y1 = spec['box']
        part = cut(sheet.crop((x0, y0, x1, y1)), soft=spec.get('miekki', False), holes=spec.get('dziury', 0))
        bx = tight_box(part)
        part = part.crop(bx)
        save(part, out_dir / f'{name}.webp')
        info = {'plik': f'{mat["id"]}/{name}.webp', 'w': part.width, 'h': part.height}
        if spec.get('pivot') == 'gora':
            # obrót wokół zaokrąglonego górnego końca: środek półkola u góry
            a = np.asarray(part)[..., 3]
            top_rows = a[: max(1, part.width // 2)]
            cols = np.nonzero(top_rows.max(axis=0) > 128)[0]
            cx = float(cols.mean()) if len(cols) else part.width / 2
            width = float(cols.max() - cols.min() + 1) if len(cols) else part.width
            first = int(np.nonzero(a.max(axis=1) > 128)[0][0])
            info['pivot'] = [round(cx, 1), round(first + width / 2, 1)]
        meta['czesci'][name] = info

    for name in ('korpus', 'raczka', 'nozka', 'okruszek', 'plecak', 'babelki'):
        simple(name, lay[name])

    # Buzie: wspólny pas w pionie, żeby wszystkie leżały na korpusie w tym samym miejscu.
    fy0, fy1 = lay['buzie']['pas_y']
    for name, (x0, x1) in zip(lay['buzie']['nazwy'], lay['buzie']['box_x']):
        part = cut(sheet.crop((x0, fy0, x1, fy1)))
        bx = tight_box(part, keep_y=True)
        part = part.crop(bx)
        save(part, out_dir / f'buzia-{name}.webp')
        meta['buzie'][name] = {'plik': f'{mat["id"]}/buzia-{name}.webp', 'w': part.width, 'h': part.height}

    # Położenie buzi względem korpusu (środek buzi w ułamkach korpusu) – z arkusza wzoru:
    # buzia leży mniej więcej w środku tarczy, lekko powyżej.
    meta['buziaNaKorpusie'] = lay.get('buzia_na_korpusie', {'x': 0.5, 'y': 0.54, 'szerokosc': 0.6})
    return meta


def main():
    cfg = json.loads((GROSZ / 'czesci.config.json').read_text())
    only = set(sys.argv[1:])
    manifest_path = GROSZ / 'czesci.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'materialy': {}}
    for mat in cfg['materialy']:
        if only and mat['id'] not in only:
            continue
        manifest['materialy'][mat['id']] = process_material(mat, cfg['uklad'])
        print('wycięto:', mat['id'])
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()

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


def cut(region: Image.Image, soft=False, holes=0, seeds=()) -> Image.Image:
    rgb = np.asarray(region.convert('RGB')).astype(np.float32)
    if soft:
        bg = background_mask(rgb, LIGHT)
    else:
        core = background_mask(rgb, NEAR_WHITE)
        if holes:
            core |= large_holes(rgb, core, holes)
        for sx, sy in seeds:
            # ręcznie wskazane prześwity tła (np. między ręką a korpusem)
            cand = Image.fromarray(np.where(rgb.min(axis=2) > NEAR_WHITE, 255, 0).astype(np.uint8)).copy()
            ImageDraw.floodfill(cand, (int(sx), int(sy)), 100, thresh=0)
            core |= np.asarray(cand) == 100
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


def recolor(img: Image.Image, hue_deg: float, sat: float) -> Image.Image:
    """Przemalowuje kolorowe pola na jedną barwę, zachowując jasność (cieniowanie i paski)
    oraz ciemny kontur."""
    rgba = np.asarray(img).astype(np.float32) / 255.0
    rgb, a = rgba[..., :3], rgba[..., 3:]
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    light = (mx + mn) / 2
    chroma = mx - mn
    colored = ((chroma > 0.18) & (light > 0.34))[..., None]   # ciemny kontur zostaje
    # jasność wyrównana do zakresu, żeby paski różniły się odcieniem tej samej barwy
    l = np.clip(0.30 + (light - 0.35) * 0.9, 0.22, 0.85)
    h = hue_deg / 360.0
    def hue2rgb(p, q, t):
        t = t % 1.0
        return np.where(t < 1/6, p + (q - p) * 6 * t, np.where(t < 1/2, q, np.where(t < 2/3, p + (q - p) * (2/3 - t) * 6, p)))
    q = np.where(l < 0.5, l * (1 + sat), l + sat - l * sat)
    pp = 2 * l - q
    new = np.dstack([hue2rgb(pp, q, h + 1/3), hue2rgb(pp, q, h), hue2rgb(pp, q, h - 1/3)])
    out = np.where(colored, new, rgb)
    return Image.fromarray((np.dstack([out, a]) * 255).round().astype(np.uint8), 'RGBA')


def process_material(mat, layout, pack_colors):
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

    # Plecaki w kolorach (tęczowy zostaje jako 'teczowy')
    base_pack = Image.open(out_dir / 'plecak.webp').convert('RGBA')
    meta['plecaki'] = {'teczowy': {'plik': meta['czesci']['plecak']['plik'], 'szelka': '#8a5cc0'}}
    for name, spec in pack_colors.items():
        if name.startswith('_'):
            continue
        img = recolor(base_pack, spec['barwa'], spec['nasycenie'])
        save(img, out_dir / f'plecak-{name}.webp')
        # kolor szelki: średni kolor kolorowych pól plecaka, trochę ciemniejszy
        arr = np.asarray(img).astype(np.float32)
        rgb, a = arr[..., :3], arr[..., 3]
        sel = (a > 200) & (rgb.max(axis=2) - rgb.min(axis=2) > 40)
        c = rgb[sel].mean(axis=0) * 0.85
        meta['plecaki'][name] = {'plik': f'{mat["id"]}/plecak-{name}.webp',
                                 'szelka': '#%02x%02x%02x' % tuple(int(v) for v in c)}

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


def process_character(cid, spec):
    sheet = Image.open(SRC / spec['arkusz']).convert('RGB')
    out = {}
    for pose, box in spec['pozy'].items():
        part = cut(sheet.crop(tuple(box)), holes=spec.get('dziury', 0), seeds=[(x - box[0], y - box[1]) for x, y in spec.get('punkty_tla', {}).get(pose, [])])
        part = part.crop(tight_box(part))
        save(part, GROSZ / cid / f'{pose}.webp')
        out[pose] = {'plik': f'{cid}/{pose}.webp', 'w': part.width, 'h': part.height}
    return out


def main():
    cfg = json.loads((GROSZ / 'czesci.config.json').read_text())
    only = set(sys.argv[1:])
    manifest_path = GROSZ / 'czesci.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'materialy': {}}
    for cid, spec in cfg.get('postacie', {}).items():
        if cid.startswith('_') or (only and cid not in only):
            continue
        manifest.setdefault('postacie', {})[cid] = process_character(cid, spec)
        print('wycięto postać:', cid)
    for mat in cfg['materialy']:
        if only and mat['id'] not in only:
            continue
        manifest['materialy'][mat['id']] = process_material(mat, cfg['uklad'], cfg.get('plecaki_kolory', {}))
        print('wycięto:', mat['id'])
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()

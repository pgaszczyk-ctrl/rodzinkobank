#!/usr/bin/env python3
"""Przygotowuje panoramę Drogi przez rok.

Użycie:  python3 tools/droga_rok.py [--podglad plik.png]

Czyta wpis "droga_rok" z assets/groszaki/czesci.config.json i panoramę
z assets/groszaki/zrodla/ (plik źródłowy zostaje bez zmian). Zapisuje:
  assets/groszaki/droga/rok.jpg     – panorama z wygładzonym szwem dół → góra
                                      (rok się zapętla: pod dołem znowu jest góra)
  assets/groszaki/droga-rok.json    – oś drogi (x co kilka pikseli wysokości),
                                      szerokość drogi i początki miesięcy

Oś drogi jest odczytywana z koloru drogi: piksele podobne do koloru drogi przy
górnej krawędzi, połączone z nią, a w każdym wierszu środek pasa najbliższego
środkowi z wiersza wyżej. Początki miesięcy (ułamki wysokości) ustawia się
ręcznie w konfiguracji, bo zależą od tego, co jest narysowane (śnieg, zboże…).
--podglad zapisuje obrazek z narysowaną osią i miesiącami do sprawdzenia.
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

COLOR_DIST = 42      # jak bardzo piksel może się różnić od koloru drogi
POINTS = 500         # tyle punktów osi zapisujemy (co h/POINTS px)
# Rozmiary poniżej są ułamkami szerokości panoramy (działa dla każdej rozdzielczości).
CLOSE = 0.016        # domknięcie maski (kreski na drodze)
WIDE = 0.28          # szerszy pas = poziomy odcinek
SHIFT = 0.02         # na poziomym odcinku środek przesuwa się najwyżej tyle na wiersz
SMOOTH = 0.032       # wygładzenie osi (wierszy w każdą stronę)


def road_mask(rgb: np.ndarray, ref: np.ndarray) -> np.ndarray:
    d = np.sqrt(((rgb - ref) ** 2).sum(axis=2))
    m = Image.fromarray(np.where(d < COLOR_DIST, 255, 0).astype(np.uint8))
    # domknięcie: wypełnia kreski i słoje narysowane na drodze
    r = max(1, round(rgb.shape[1] * CLOSE / 2)) * 2 + 1
    m = m.filter(ImageFilter.MaxFilter(r)).filter(ImageFilter.MinFilter(r))
    return np.asarray(m) > 0


def connected(mask: np.ndarray, seed) -> np.ndarray:
    img = Image.fromarray(np.where(mask, 255, 0).astype(np.uint8)).copy()
    ImageDraw.floodfill(img, seed, 128, thresh=0)
    return np.asarray(img) == 128


def runs(row: np.ndarray):
    xs = np.nonzero(row)[0]
    if not len(xs):
        return []
    out, s, p = [], xs[0], xs[0]
    for x in xs[1:]:
        if x != p + 1:
            out.append((s, p))
            s = x
        p = x
    out.append((s, p))
    return out


def centerline(mask: np.ndarray, x_start: float):
    h, w = mask.shape
    xs, widths = np.zeros(h), []
    prev = x_start
    for y in range(h):
        rs = runs(mask[y])
        if not rs:
            xs[y] = prev
            continue
        s, e = min(rs, key=lambda r: 0 if r[0] <= prev <= r[1] else min(abs(r[0] - prev), abs(r[1] - prev)))
        # na poziomym odcinku pas jest szeroki – środek przesuwamy płynnie
        c = (s + e) / 2
        xs[y] = prev = c if e - s < w * WIDE else prev + np.clip(c - prev, -w * SHIFT, w * SHIFT)
        widths.append(e - s + 1)
    k = max(1, round(w * SMOOTH))
    pad = np.concatenate([xs[-k:], xs, xs[:k]])          # panorama się zapętla
    smooth = np.convolve(pad, np.ones(2 * k + 1) / (2 * k + 1), mode='same')[k:-k]
    return smooth, float(np.median(widths))


def blend_seam(img: Image.Image, rows: int) -> Image.Image:
    """Dolne `rows` wierszy przechodzą płynnie w górny wiersz – szew przy zapętleniu znika."""
    a = np.asarray(img).astype(np.float32)
    h = a.shape[0]
    top = a[0:3].mean(axis=0)
    for i in range(rows):
        k = (i + 1) / rows
        k = k * k * (3 - 2 * k)
        a[h - rows + i] = a[h - rows + i] * (1 - k) + top * k
    return Image.fromarray(a.round().clip(0, 255).astype(np.uint8))


def main():
    cfg = json.loads((GROSZ / 'czesci.config.json').read_text())['droga_rok']
    src = Image.open(SRC / cfg['arkusz']).convert('RGB')
    w, h = src.size
    seam = round(h * cfg.get('szew', 0.03))
    img = blend_seam(src, seam)
    rgb = np.asarray(img).astype(np.float32)

    cx = w // 2
    ref = rgb[2:12, cx - 6:cx + 6].reshape(-1, 3).mean(axis=0)
    mask = connected(road_mask(rgb, ref), (cx, 2))
    xs, width = centerline(mask, cx)

    out_dir = GROSZ / 'droga'
    out_dir.mkdir(parents=True, exist_ok=True)
    img.save(out_dir / 'rok.jpg', 'JPEG', quality=84, optimize=True, progressive=True)
    step = h / POINTS
    data = {
        '_opis': 'Wygenerowane przez tools/droga_rok.py – nie edytuj ręcznie. y i x jako ułamki wysokości/szerokości panoramy.',
        'plik': 'droga/rok.jpg', 'w': w, 'h': h,
        'krok': 1 / POINTS,
        'srodek': [round(float(xs[min(h - 1, round(i * step))]) / w, 4) for i in range(POINTS)],
        'szerokosc': round(width / w, 4),
        'miesiace': cfg['miesiace'],
    }
    (GROSZ / 'droga-rok.json').write_text(json.dumps(data, ensure_ascii=False) + '\n')
    print(f'panorama {w}×{h}, droga szer. {width:.0f} px, oś: {len(data["srodek"])} punktów')

    if '--podglad' in sys.argv:
        path = sys.argv[sys.argv.index('--podglad') + 1]
        k = max(1, round(562 / w)) if w < 562 else 562 / w
        prev = img.resize((round(w * k), round(h * k)))
        d = ImageDraw.Draw(prev)
        d.line([(xs[y] * k, y * k) for y in range(h)], fill=(255, 0, 0), width=3)
        for m, f in cfg['miesiace'].items():
            if m.startswith('_'):
                continue
            y = f * h * k
            d.line([(0, y), (round(w * k), y)], fill=(0, 0, 255), width=2)
            d.text((6, y + 2), m, fill=(0, 0, 0))
        prev.save(path)


if __name__ == '__main__':
    main()

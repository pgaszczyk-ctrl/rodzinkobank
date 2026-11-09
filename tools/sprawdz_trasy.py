#!/usr/bin/env python3
"""Sprawdza sieć ścieżek Groszaków (assets/groszaki/trasy.json) na mapie.

Użycie:  python3 tools/sprawdz_trasy.py [podglad.png] [--poszerz]

--poszerz  automatycznie poszerza drogi tam, gdzie pozwala mapa, i zapisuje trasy.json.

Dla każdej krawędzi bada cały pas, po którym mogą chodzić Groszaki (oś drogi
i pasy boczne do s − margines), co 3 px:
  * piasek – drogi na mapie mają charakterystyczny, mało nasycony kolor;
    krawędzie łąki/pola (t: laka), schodów i mostków są z tego zwolnione,
  * woda – zakazana poza mostkami,
  * przesłony (stragany, domy…) – stopy Groszaka nie mogą wejść w ich obrys.
Wypisuje krawędzie z problemami i (opcjonalnie) zapisuje podgląd:
zielony pas = w porządku, czerwony = do poprawy.
Wymaga: Pillow, numpy.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
G = ROOT / 'assets' / 'groszaki'
MARGIN = 9          # jak EDGE_MARGIN w src/groszaki/trasy.js
SAND_MIN = 0.85     # wymagany udział piasku na krawędziach drogowych


def masks(map_path):
    im = Image.open(map_path).convert('RGB')
    hsv = np.asarray(im.convert('HSV')).astype(int)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    sand = (s >= 90) & (s <= 150) & (v >= 215) & (h >= 17) & (h <= 36)
    water = (h >= 105) & (h <= 135) & (s >= 40) & (s <= 140) & (v >= 140)
    f = lambda m: np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(5))) > 0
    return im, f(sand), f(water)


def inside(poly, x, y):
    c = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


FREE = {'schody', 'most', 'laka'}
MAX_S = {None: 34, 'laka': 18}   # najszersza droga przy automatycznym poszerzaniu


def edge_problems(A, B, sand, water, occ):
    H, W = sand.shape
    L = math.hypot(B['x'] - A['x'], B['y'] - A['y']) or 1
    nx, ny = -(B['y'] - A['y']) / L, (B['x'] - A['x']) / L
    exempt = A.get('t') in FREE or B.get('t') in FREE
    bridge = A.get('t') == 'most' or B.get('t') == 'most'
    tot = sandn = wat = 0
    hit = set()
    steps = max(2, int(L / 3))
    for i in range(steps + 1):
        k = i / steps
        x = A['x'] + (B['x'] - A['x']) * k
        y = A['y'] + (B['y'] - A['y']) * k
        s = max(0, A['s'] + (B['s'] - A['s']) * k - MARGIN)
        for lane in (-1, -0.5, 0, 0.5, 1):
            px, py = x + nx * s * lane, y + ny * s * lane
            ix, iy = int(round(px)), int(round(py))
            if not (0 <= ix < W and 0 <= iy < H):
                continue
            tot += 1
            sandn += sand[iy, ix]
            wat += water[iy, ix]
            for o in occ:
                if bridge and o['id'].startswith('most-'):
                    continue   # na mostku nóżki mają być za balustradą
                if inside(o['poly'], px, py):
                    hit.add(o['id'])
    frac = sandn / max(1, tot)
    problems = []
    if not exempt and frac < SAND_MIN:
        problems.append(f'piasek {frac:.0%}')
    if not bridge and wat > 0:
        problems.append(f'woda {wat} pr.')
    if hit:
        problems.append('przez: ' + ', '.join(sorted(hit)))
    return problems, (nx, ny)


def widen(data, sand, water, occ):
    """Poszerza drogi: każdy punkt (poza schodami i mostkami) dostaje największe s,
    przy którym wszystkie jego krawędzie przechodzą sprawdzenie."""
    nodes = {p['id']: p for p in data['punkty']}
    inc = {k: [] for k in nodes}
    for a, b in data['krawedzie']:
        inc[a].append(b)
        inc[b].append(a)
    for p in data['punkty']:
        if p.get('t') in ('schody', 'most'):
            continue
        cap = MAX_S.get(p.get('t'), 34)
        best = p['s']
        for s in range(int(p['s']) + 2, cap + 1, 2):
            p['s'] = s
            if all(not edge_problems(p, nodes[o], sand, water, occ)[0] for o in inc[p['id']]):
                best = s
            else:
                break
        p['s'] = best


def main():
    data = json.loads((G / 'trasy.json').read_text())
    occ = json.loads((G / 'przeslony.json').read_text())['przeslony']
    im, sand, water = masks(G / 'zrodla' / 'mapa-jesien.jpg')
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if '--poszerz' in sys.argv:
        widen(data, sand, water, occ)
        (G / 'trasy.json').write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n')
        print('poszerzono drogi i zapisano trasy.json')
    nodes = {p['id']: p for p in data['punkty']}
    bad = []
    ov = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    for a, b in data['krawedzie']:
        A, B = nodes[a], nodes[b]
        problems, (nx, ny) = edge_problems(A, B, sand, water, occ)
        ok = not problems
        if not ok:
            bad.append((a, b, problems))
        sA, sB = max(1, A['s'] - MARGIN), max(1, B['s'] - MARGIN)
        poly = [(A['x'] + nx * sA, A['y'] + ny * sA), (B['x'] + nx * sB, B['y'] + ny * sB),
                (B['x'] - nx * sB, B['y'] - ny * sB), (A['x'] - nx * sA, A['y'] - ny * sA)]
        d.polygon(poly, fill=(40, 200, 60, 110) if ok else (230, 30, 30, 140))
        d.line([(A['x'], A['y']), (B['x'], B['y'])], fill=(255, 255, 255, 200), width=1)
    for p in data['punkty']:
        d.ellipse([p['x'] - 2, p['y'] - 2, p['x'] + 2, p['y'] + 2], fill=(20, 20, 20, 255))
    for o in occ:
        d.line([tuple(q) for q in o['poly'] + [o['poly'][0]]], fill=(0, 90, 255, 220), width=1)
    for a, b, pr in bad:
        print(f'{a} – {b}: ' + '; '.join(pr))
    print(f'{len(data["krawedzie"]) - len(bad)}/{len(data["krawedzie"])} krawędzi w porządku')
    if args:
        out = Image.alpha_composite(im.convert('RGBA'), ov).convert('RGB')
        out.save(args[0])
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())

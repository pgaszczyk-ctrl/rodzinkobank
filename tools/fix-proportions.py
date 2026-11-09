"""Some scene SVGs stretch their painted image unevenly (e.g. the shaft head was
squeezed to 0.85 × 0.56). This gives listed objects one uniform scale (area kept),
then updates their size and pivot in assets/scene/scena.json so each object stays
anchored at the same point of the scene. Textures (beams, rails, rock) are left alone.
Usage: python3 tools/fix-proportions.py"""
import json, math, pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent / 'assets' / 'scene'
# kopalnia/szyb-nadszybie was fixed by hand keeping its full width (scale 0.8547 on both axes).
OBJECTS = ['kopalnia/latarnia', 'kopalnia/brylki-zlota', 'kopalnia/wiadro',
           'kopalnia/klatka-windy', 'pory-roku/zima/dekoracja', 'pory-roku/wiosna/drzewo', 'pory-roku/lato/drzewo',
           'pory-roku/jesien/drzewo', 'pory-roku/zima/drzewo', 'wspolne/chmura']
scene = json.loads((root / 'scena.json').read_text())
for key in OBJECTS:
    f = root / (key + '.svg')
    s = f.read_text()
    m = re.search(r'transform="scale\(([\d.]+) ([\d.]+)\)', s)
    a, b = float(m.group(1)), float(m.group(2))
    if abs(a / b - 1) < 0.01:
        continue
    k = math.sqrt(a * b)
    w, h = scene['assets'][key]['size']
    nw, nh = round(w / a * k, 2), round(h / b * k, 2)
    s = s.replace(m.group(0), f'transform="scale({k} {k})', 1)
    s = re.sub(r'<svg([^>]*?) width="[\d.]+" height="[\d.]+" viewBox="[^"]*"', f'<svg\\1 width="{nw}" height="{nh}" viewBox="0 0 {nw} {nh}"', s, count=1)
    f.write_text(s)
    asset = scene['assets'][key]
    asset['size'] = [nw, nh]
    if 'pivot' in asset:
        px, py = asset['pivot']
        asset['pivot'] = [round(px / a * k, 2), round(py / b * k, 2)]
    print(f'{key}: {a:.3f}×{b:.3f} -> {k:.3f}  size {w}×{h} -> {nw}×{nh}')
(root / 'scena.json').write_text(json.dumps(scene, ensure_ascii=False, indent=1))

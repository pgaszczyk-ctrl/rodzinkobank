"""Shrink the illustrator's scene files (assets/scene): PNG data embedded in the
SVGs and the miner frames are re-encoded as WebP (with alpha). Safe to re-run.
Usage: python3 tools/optimize-scene.py"""
import base64, io, pathlib, re
from PIL import Image

root = pathlib.Path(__file__).resolve().parent.parent / 'assets' / 'scene'
PNG = re.compile(r'data:image/png;base64,([A-Za-z0-9+/=]+)')

def webp(data, q):
    im = Image.open(io.BytesIO(data))
    out = io.BytesIO()
    im.save(out, 'WEBP', quality=q, method=6)
    return out.getvalue()

before = after = 0
for svg in root.rglob('*.svg'):
    s = svg.read_text()
    before += len(s)
    def repl(m):
        raw = base64.b64decode(m.group(1))
        w = webp(raw, 88)
        return 'data:image/webp;base64,' + base64.b64encode(w).decode() if len(w) < len(raw) else m.group(0)
    s2 = PNG.sub(repl, s)
    after += len(s2)
    if s2 != s:
        svg.write_text(s2)
for png in (root / 'gornicy' / 'klatki').glob('*.png'):
    raw = png.read_bytes(); before += len(raw)
    w = webp(raw, 90); after += len(w)
    png.with_suffix('.webp').write_bytes(w)
    png.unlink()
print(f'{before/1e6:.2f} MB -> {after/1e6:.2f} MB')

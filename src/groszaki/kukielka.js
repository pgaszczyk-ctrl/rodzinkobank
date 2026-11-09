// Groszak jako „papierowa kukiełka”: korpus, buzia, dwie rączki, dwie nóżki,
// opcjonalnie okruszek, plecak, bąbelki snu. Rysowanie na <canvas> 2D.
//
// Wszystkie wymiary postaci są w jednostkach średnicy korpusu (D = 1).
// Początek układu: środek korpusu; oś y w dół. Kąt kończyny 0 = zwisa w dół,
// dodatni = odchylenie na zewnątrz (od środka postaci).

const TAU = Math.PI * 2;

// Proporcje według arkusz-postaci.jpg
const RIG = {
  arm: { w: 0.12, len: 0.36, rest: { x: 0.43, y: 0.08 }, raised: { x: 0.40, y: -0.20 }, raisedLen: 0.46 },
  leg: { w: 0.13, len: 0.36, hip: { x: 0.16, y: 0.36 } },
  crumb: { size: 0.4, y: -0.64 },
  pack: { size: 0.62, x: -0.36, y: 0.02 },
  bubbles: { size: 0.42, x: 0.42, y: -0.72 },
};

// ---------------------------------------------------------------------------
//  Wczytywanie materiałów
// ---------------------------------------------------------------------------

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Nie mogę wczytać ' + src));
    img.src = src;
  });
}

/** Mipmapy: zmniejszone kopie, żeby małe postacie rysowały się ostro i szybko. */
class Sprite {
  constructor(img) {
    this.levels = [img];
    this.w = img.naturalWidth || img.width;
    this.h = img.naturalHeight || img.height;
  }
  /** Najmniejszy poziom nie węższy niż `px` pikseli. */
  forWidth(px) {
    let lvl = 0;
    while ((this.w >> (lvl + 1)) >= px && (this.w >> (lvl + 1)) >= 8) lvl++;
    while (this.levels.length <= lvl) {
      const prev = this.levels[this.levels.length - 1];
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round((prev.width || prev.naturalWidth) / 2));
      c.height = Math.max(1, Math.round((prev.height || prev.naturalHeight) / 2));
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(prev, 0, 0, c.width, c.height);
      this.levels.push(c);
    }
    return this.levels[lvl];
  }
}

/**
 * Wczytuje materiał monety z manifestu czesci.json.
 * base – adres katalogu assets/groszaki/ (z ukośnikiem na końcu).
 */
export async function loadMaterial(base, manifest, id) {
  const m = manifest.materialy[id];
  if (!m) throw new Error('Brak materiału ' + id);
  const parts = {};
  const faces = {};
  await Promise.all([
    ...Object.entries(m.czesci).map(async ([k, v]) => {
      parts[k] = { sprite: new Sprite(await loadImage(base + v.plik)), w: v.w, h: v.h, pivot: v.pivot };
    }),
    ...Object.entries(m.buzie).map(async ([k, v]) => {
      faces[k] = { sprite: new Sprite(await loadImage(base + v.plik)), w: v.w, h: v.h };
    }),
  ]);
  return { id, name: m.nazwa, parts, faces, faceOn: m.buziaNaKorpusie };
}

// ---------------------------------------------------------------------------
//  Stan postaci
// ---------------------------------------------------------------------------

/**
 * Tworzy Groszaka. Pola, które zmienia logika miasteczka:
 *   x, y     – położenie stóp na mapie
 *   size     – średnica korpusu w pikselach mapy
 *   dir      – kierunek marszu: -1 w lewo, 1 w prawo
 *   action   – 'idle' | 'walk' | 'wave' | 'sleep'
 *   carry    – niesie okruszek nad głową
 *   pack     – ma plecak (wyrusza po marzenie)
 *   speed    – tempo kroku (1 = normalne)
 */
export function createGroszak(material, opts = {}) {
  return {
    material,
    x: 0, y: 0, size: 24, dir: 1,
    action: 'idle', carry: false, pack: false, speed: 1,
    waveUntil: 0,
    seed: Math.random() * 1000,
    nextBlink: 0, blinkUntil: 0,
    ...opts,
  };
}

/** Zaczyna machanie na `ms` milisekund (np. gdy dziecko dotknie Groszaka). */
export function wave(g, now, ms = 1800) {
  g.waveUntil = now + ms;
}

// ---------------------------------------------------------------------------
//  Pozy
// ---------------------------------------------------------------------------

const lerp = (a, b, k) => a + (b - a) * k;

/** Wylicza pozę na chwilę `now` (ms). `still` – bez ruchu (prefers-reduced-motion). */
export function poseAt(g, now, still = false) {
  const t = now / 1000 + g.seed;
  const p = {
    legL: 0, legR: 0, liftL: 0, liftR: 0,
    armL: 0.32, armR: 0.32, raiseL: 0, raiseR: 0,
    bob: 0, tilt: 0, sx: 1, sy: 1, faceShift: 0,
    face: 'usmiech', crumb: g.carry, bubbles: false, pack: g.pack, sitting: 0,
  };

  // mruganie co kilka sekund
  if (!still) {
    if (now > g.nextBlink) {
      g.blinkUntil = now + 130;
      g.nextBlink = now + 2500 + Math.random() * 3500;
    }
  }
  const blinking = now < g.blinkUntil;

  if (g.action === 'sleep') {
    // drzemka na siedząco: nóżki rozłożone, rączki oparte, głowa lekko się kiwa
    p.sitting = 1;
    p.face = 'spiaca';
    p.bubbles = true;
    const breath = still ? 0 : Math.sin(t * 1.6);
    const nod = still ? 0 : Math.sin(t * 0.8);
    p.sy = 1 + breath * 0.012;
    p.tilt = 0.14 + nod * 0.05;
    p.legL = p.legR = 1.2;
    p.armL = 0.6 + breath * 0.03;
    p.armR = 0.5 + breath * 0.03;
    return p;
  }

  if (g.action === 'walk' && !still) {
    const ph = t * TAU * 1.9 * g.speed;
    const s = Math.sin(ph);
    p.legL = 0.42 * s;
    p.legR = -0.42 * s;
    p.liftL = Math.max(0, s) * 0.05;
    p.liftR = Math.max(0, -s) * 0.05;
    p.armL = 0.32 - 0.38 * s;
    p.armR = 0.32 + 0.38 * s;
    p.bob = -Math.abs(Math.cos(ph)) * 0.05;
    p.tilt = g.dir * 0.09 + 0.05 * s;
    p.sx = 0.94;                 // lekki obrót w stronę marszu
    p.faceShift = g.dir * 0.06;
  } else if (!still) {
    // spokojny oddech na stojąco
    p.bob = Math.sin(t * 2.1) * 0.008;
    p.armL = 0.3 + Math.sin(t * 2.1) * 0.03;
    p.armR = 0.3 + Math.sin(t * 2.1 + 0.4) * 0.03;
  }

  if (g.carry) {
    // obie rączki w górze, okruszek nad głową, buzia szczęśliwa
    p.raiseL = p.raiseR = 1;
    const wob = still ? 0 : Math.sin(t * TAU * 1.9 * g.speed) * 0.06;
    p.armL = 2.9 + wob;
    p.armR = 2.9 - wob;
    p.face = 'szczesliwa';
  } else if (g.action === 'wave' || now < g.waveUntil) {
    p.raiseR = 1;
    p.armR = 2.45 + (still ? 0 : Math.sin(t * TAU * 2.4) * 0.38);
    p.face = 'radosna';
  }

  if (blinking && (p.face === 'usmiech' || p.face === 'radosna')) p.face = 'szczesliwa';
  return p;
}

// ---------------------------------------------------------------------------
//  Rysowanie
// ---------------------------------------------------------------------------

function drawPart(ctx, part, x, y, w, h, scale) {
  const img = part.sprite.forWidth(Math.abs(w * scale));
  ctx.drawImage(img, x, y, w, h);
}

function drawLimb(ctx, part, side, px, py, angle, w, len, scale, lift = 0) {
  // part.pivot – punkt obrotu w pikselach obrazka (środek zaokrąglonego końca)
  const sx = w / part.w;
  const sy = len / part.h;
  ctx.save();
  ctx.translate(px * side, py - lift);
  ctx.scale(side, 1);              // lewa strona = lustrzane odbicie
  ctx.rotate(-angle);              // dodatni kąt = na zewnątrz
  drawPart(ctx, part, -part.pivot[0] * sx, -part.pivot[1] * sy, w, len, scale);
  ctx.restore();
}

/**
 * Rysuje Groszaka. `scale` – ile pikseli ekranu przypada na piksel mapy
 * (do wyboru mipmapy), `still` – bez ruchu.
 */
export function drawGroszak(ctx, g, now, scale = 1, still = false) {
  const m = g.material;
  const P = m.parts;
  const p = poseAt(g, now, still);
  const D = g.size;
  const legLenPx = RIG.leg.len;
  const footBottom = RIG.leg.hip.y + legLenPx * (1 - P.nozka.pivot[1] / P.nozka.h);
  const s = D * scale;

  ctx.save();
  ctx.translate(g.x, g.y);
  ctx.scale(D, D);

  // cień
  ctx.fillStyle = 'rgba(70, 40, 20, 0.18)';
  ctx.beginPath();
  ctx.ellipse(0, 0, p.sitting ? 0.52 : 0.4, p.sitting ? 0.11 : 0.09, 0, 0, TAU);
  ctx.fill();

  if (p.sitting) {
    // siedzi: dół korpusu na ziemi, przechył wokół punktu podparcia
    ctx.rotate(p.tilt);
    ctx.translate(0, -0.52);
  } else {
    ctx.translate(0, -footBottom);
    ctx.translate(0, p.bob);
    ctx.rotate(p.tilt);
  }

  // plecak za korpusem, wystaje z boku przeciwnego do kierunku marszu
  if (p.pack) {
    const ps = RIG.pack.size;
    const ph = ps * P.plecak.h / P.plecak.w;
    ctx.save();
    ctx.scale(g.dir, 1);
    drawPart(ctx, P.plecak, RIG.pack.x - ps / 2, RIG.pack.y - ph / 2, ps, ph, s);
    ctx.restore();
  }

  // nóżki (pod korpusem)
  const { w: lw, len: ll } = RIG.leg;
  const hip = p.sitting ? { x: 0.2, y: 0.40 } : RIG.leg.hip;
  drawLimb(ctx, P.nozka, -1, hip.x, hip.y, p.legL, lw, ll, s, p.liftL);
  drawLimb(ctx, P.nozka, 1, hip.x, hip.y, p.legR, lw, ll, s, p.liftR);

  // rączki (pod korpusem); przy podniesieniu ramię przesuwa się wyżej i wydłuża
  const A = RIG.arm;
  for (const [side, ang, raise] of [[-1, p.armL, p.raiseL], [1, p.armR, p.raiseR]]) {
    drawLimb(ctx, P.raczka, side,
      lerp(A.rest.x, A.raised.x, raise), lerp(A.rest.y, A.raised.y, raise),
      ang, A.w, lerp(A.len, A.raisedLen, raise), s);
  }

  // korpus i buzia
  ctx.save();
  ctx.translate(0, 0.5);           // oddech skaluje korpus od dołu
  ctx.scale(p.sx, p.sy);
  ctx.translate(0, -0.5);
  drawPart(ctx, P.korpus, -0.5, -0.5, 1, 1, s);
  ctx.restore();
  const f = m.faces[p.face];
  const fw = m.faceOn.szerokosc;
  const fh = fw * f.h / f.w;
  drawPart(ctx, f, (m.faceOn.x - 0.5) + p.faceShift - fw / 2, (m.faceOn.y - 0.5) - fh / 2, fw, fh, s);

  // okruszek nad głową
  if (p.crumb) {
    const cs = RIG.crumb.size;
    drawPart(ctx, P.okruszek, -cs / 2, RIG.crumb.y - cs / 2, cs, cs * P.okruszek.h / P.okruszek.w, s);
  }

  // bąbelki snu unoszą się nad głową
  if (p.bubbles) {
    const t = now / 1000 + g.seed;
    const bz = RIG.bubbles.size;
    const rise = still ? 0 : (t * 0.35) % 1;
    ctx.globalAlpha = still ? 0.9 : Math.min(1, rise * 5) * (1 - rise * 0.6);
    drawPart(ctx, P.babelki, RIG.bubbles.x - bz / 2, RIG.bubbles.y - bz / 2 - rise * 0.3,
      bz, bz * P.babelki.h / P.babelki.w, s);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** Prostokąt trafienia (do dotknięcia) w pikselach mapy. */
export function hitTest(g, x, y) {
  const D = g.size;
  return Math.abs(x - g.x) < D * 0.6 && y < g.y + D * 0.1 && y > g.y - D * 1.5;
}

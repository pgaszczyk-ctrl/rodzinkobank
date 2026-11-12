import { buildGraph, findPath, makeRoute, routePosition } from './trasy.js';
import { prepareOccluders, drawGroszakiWithDepth } from './przeslony.js';
import { TownSim } from './symulacja.js';
import { TICK_MS, zl } from './finanse.js';

const canvas = document.querySelector('#town');
const context = canvas.getContext('2d');
const play = document.querySelector('#play');
const view = document.querySelector('#view');
const status = document.querySelector('#status');
const delivery = document.querySelector('#delivery');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const root = new URL('../../assets/groszaki/', import.meta.url);

const cameras = {
  panorama: [0, 0, 2000, 1116],
  market: [365, 425, 675, 465],
  mill: [105, 175, 485, 740],
  vault: [790, 135, 445, 540],
  farm: [1445, 370, 555, 540],
  bridges: [1120, 380, 565, 565],
};

const people = [
  [[188, 355], [171, 354], [164, 356], [147, 351]],
  [[185, 359], [177, 358], [163, 359], [155, 357]],
  [[178, 316], [170, 315], [165, 316], [155, 316]],
];
const trades = [
  [[188, 358], [170, 358], [168, 358], [150, 358]],
  [[188, 360], [175, 361], [169, 359], [164, 360]],
  [[186, 342], [175, 344], [164, 342], [156, 343]],
];
const coins = [
  [[220, 375], [221, 377], [221, 376], [222, 377]],
  [[196, 363], [193, 361], [196, 363], [198, 365]],
];
const sellerAnchors = [[[252, 650], [252, 650], [252, 650], [253, 650]]];

const sprites = {
  baker: ['people', people, 0, 0.132],
  shopper: ['people', people, 1, 0.125],
  carrier: ['people', people, 2, 0.114],
  farmer: ['trades', trades, 0, 0.130],
  miller: ['trades', trades, 1, 0.128],
  keeper: ['trades', trades, 2, 0.134],
  coin: ['coins', coins, 0, 0.087],
  repair: ['coins', coins, 1, 0.089],
  seller: ['seller', sellerAnchors, 0, 0.071],
};

const journeys = [
  ['baker', 'piekarnia', 'stragan-a', 1600, 29, 0.34],
  ['shopper', 'stragan-b', 'r5', 4200, 24, 0.72],
  ['shopper', 'p2', 'stragan-c', 7600, 23, 0.54],
  ['miller', 'mlyn', 'stragan-b', 2900, 26, 0.61],
  ['keeper', 'drzwi', 's0', 5100, 31, 0.42],
  ['farmer', 'dynie', 'podworze', 2000, 24, 0.51],
  ['farmer', 'stodola', 'dynie', 8300, 25, 0.70],
];

const windmillWalk = [[288, 271], [318, 285], [290, 306], [255, 324], [246, 339], [272, 356], [317, 365]];

function loadImage(file) {
  const image = new Image();
  image.src = new URL(file, root).href;
  return image.decode().then(() => image);
}

function sharpenArtwork(image) {
  const plate = document.createElement('canvas');
  plate.width = image.width;
  plate.height = image.height;
  const ctx = plate.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, plate.width, plate.height);
  const original = pixels.data.slice();
  const pitch = plate.width * 4;
  for (let y = 1; y < plate.height - 1; y++) {
    for (let x = 1; x < plate.width - 1; x++) {
      const i = y * pitch + x * 4;
      for (let c = i; c < i + 3; c++) {
        const edge = 4 * original[c] - original[c - 4] - original[c + 4]
          - original[c - pitch] - original[c + pitch];
        const correction = Math.sign(edge) * Math.max(0, Math.abs(edge) - 12) * 0.23;
        pixels.data[c] = original[c] + Math.max(-20, Math.min(20, correction));
      }
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return plate;
}

function readJson(file) {
  return fetch(new URL(file, root)).then(response => {
    if (!response.ok) throw new Error(file);
    return response.json();
  });
}

function makeJourney(kind, points, graph, phase, speed, lane) {
  const outward = makeRoute(graph, points);
  const inward = makeRoute(graph, [...points].reverse());
  return { kind, outward, inward, phase, speed, lane, duration: 1000 * outward.length / speed };
}

function walk(actor, time) {
  const pause = 1700;
  const span = actor.duration + pause;
  const elapsed = (time + actor.phase) % (2 * span);
  const returning = elapsed >= span;
  const route = returning ? actor.inward : actor.outward;
  const leg = elapsed % span;
  const progress = Math.min(1, leg / actor.duration);
  const ramp = Math.min(0.15, 14 / route.length);
  const eased = progress < ramp ? progress * progress / (2 * ramp * (1 - ramp))
    : progress > 1 - ramp ? 1 - (1 - progress) ** 2 / (2 * ramp * (1 - ramp))
    : (progress - ramp / 2) / (1 - ramp);
  const distance = route.length * eased;
  const position = routePosition(route, distance, actor.lane * Math.min(1, 12 * progress, 12 * (1 - progress)));
  const pose = progress === 1 ? 1 : Math.floor(distance / (actor.kind === 'carrier' ? 6 : 7)) % 4;
  const ahead = routePosition(route, distance + 10);
  const behind = routePosition(route, distance - 10);
  const dx = ahead.x - behind.x;
  if (Math.abs(dx) > 3) actor.left = dx < 0;
  return { ...position, kind: actor.kind, pose, left: actor.left };
}

function drawable(actor, images) {
  const [atlas, anchors, row, baseScale] = sprites[actor.kind];
  const scale = baseScale * (atlas === 'coins' || actor.kind === 'carrier' ? 1.23 : 1.40);
  const img = images[atlas];
  const [ax, ay] = anchors[row][actor.pose];
  const left = Math.round(actor.pose * img.width / 4);
  const top = Math.round(row * img.height / anchors.length);
  const w = Math.round((actor.pose + 1) * img.width / 4) - left;
  const h = Math.round((row + 1) * img.height / anchors.length) - top;
  return {
    ...actor, size: h * scale,
    draw(ctx) {
      ctx.save();
      ctx.translate(actor.x, actor.y);
      ctx.fillStyle = '#733e232a';
      ctx.beginPath();
      ctx.ellipse(0, -1, h * scale * 0.22, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      if (actor.left) ctx.scale(-1, 1);
      ctx.drawImage(img, left, top, w, h, -ax * scale, -ay * scale, w * scale, h * scale);
      if (actor.carry) crumb(ctx, 8, -14, 4.6);
      ctx.restore();
    },
  };
}

function crumb(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  ctx.fillStyle = '#ffc65c';
  ctx.strokeStyle = '#814720';
  ctx.lineWidth = 0.23;
  ctx.beginPath();
  ctx.moveTo(-1, -0.05);
  ctx.lineTo(-0.55, -0.85);
  ctx.lineTo(0.55, -1);
  ctx.lineTo(1, -0.45);
  ctx.lineTo(0.9, 0.55);
  ctx.lineTo(0.1, 0.92);
  ctx.lineTo(-0.8, 0.65);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function showDeposits(effects, elapsed) {
  for (const effect of effects) {
    const t = (elapsed - effect.t0) / effect.dur;
    if (t < 0 || t >= 1) continue;
    if (effect.type === 'crumb') {
      crumb(context, effect.x0 + (effect.x1 - effect.x0) * t,
        effect.y0 + (effect.y1 - effect.y0) * t - 14 * Math.sin(Math.PI * t), 4.4);
    } else if (effect.type === 'sparkle') {
      context.save();
      context.globalAlpha = 1 - t;
      crumb(context, effect.x, effect.y, 5 + 9 * t);
      context.restore();
    }
  }
}

try {
  const art = 'design/rynek/v8/';
  const [artwork, peopleImage, tradesImage, coinImage, sellerImage, data, occ, geometry] = await Promise.all([
    loadImage(art + 'miasteczko-jesien.png'), loadImage(art + 'mieszkancy.png'),
    loadImage(art + 'mieszkancy-miasteczka.png'), loadImage(art + 'groszak.png'),
    loadImage(art + 'sprzedawczyni.png'), readJson('trasy.json'), readJson('przeslony.json'), readJson(art + 'miasteczko-jesien-geometria.json'),
  ]);
  const images = { people: peopleImage, trades: tradesImage, coins: coinImage, seller: sellerImage };
  // Existing graph coordinates stay in the 2000 × 1116 world. Artwork-specific
  // corrections are recorded in native illustration pixels.
  const sx = 2000 / artwork.width;
  const sy = 1116 / artwork.height;
  const plate = sharpenArtwork(artwork);
  const map = [{ img: plate, alpha: 1, sourceScaleX: 1 / sx, sourceScaleY: 1 / sy }];
  const graph = buildGraph({ ...data, punkty: data.punkty.map(node => {
    const point = geometry.nodes[node.id];
    return point ? { ...node, x: point[0] * sx, y: point[1] * sy } : node;
  }) });
  const occluders = prepareOccluders(occ.przeslony.map(mask => {
    const correction = geometry.masks[mask.id];
    return correction ? { ...mask, base: correction.base * sy,
      poly: correction.poly.map(([x, y]) => [x * sx, y * sy]) } : mask;
  }));
  const actors = journeys.map(([kind, from, to, phase, speed, lane]) => {
    const path = findPath(graph, from, to, () => 0, 0);
    if (!path || path.length < 2) throw new Error(from + ' → ' + to);
    return makeJourney(kind, path, graph, phase, speed, lane);
  });
  const north = windmillWalk.map(([x, y]) => ({ x, y, s: 11 }));
  actors.push(makeJourney('miller', north, graph, 1500, 20, 0));
  let seed = 125;
  const rand = () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 2 ** 32);
  const sim = new TownSim({ graph, rand, makePuppet: options => ({ ...options }) });
  sim.setBalance(zl(100), zl(60), 0, 'init');
  sim.update(0, 0);
  const positions = new WeakMap();
  let nextDeposit = TICK_MS;
  let deposited = 0;
  let lastCounter = '';

  function helpers(dt) {
    return sim.entities.map(e => {
      const g = e.g;
      const moving = g.action === 'walk';
      const pos = positions.get(g) || { x: g.x, y: g.y, left: g.dir < 0, stride: 0 };
      const follow = dt === 0 ? 0 : 1 - Math.exp(-dt * 15);
      const dx = (g.x - pos.x) * follow;
      const dy = (g.y - pos.y) * follow;
      pos.x += dx;
      pos.y += dy;
      if (moving) {
        pos.stride += Math.hypot(dx, dy);
        if (Math.abs(g.x - pos.x) > 1.4) pos.left = g.x < pos.x;
      }
      positions.set(g, pos);
      const working = e.state === 'working';
      const repair = working && g.job?.action === 'hammer';
      const carry = g.carry && (e.state === 'toVault' || e.state === 'queue');
      const pose = moving ? Math.floor(pos.stride / 6) % 4
        : repair ? Math.floor((elapsed + e.id * 90) / 220) % 4
        : working ? 1 + Math.floor((elapsed + e.id * 200) / 420) % 2 : 1;
      return { ...pos, pose, carry, kind: repair ? 'repair' : working && g.job?.action === 'sack' ? 'carrier' : 'coin' };
    });
  }
  let elapsed = 0;
  let previous;
  let request = null;

  function draw(dt = 0) {
    const [x, y, w, h] = cameras[view.value];
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const outputWidth = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const outputHeight = Math.round(outputWidth * h / w);
    if (canvas.width !== outputWidth || canvas.height !== outputHeight) {
      canvas.width = outputWidth;
      canvas.height = outputHeight;
    }
    context.setTransform(outputWidth / w, 0, 0, outputHeight / h, -x * outputWidth / w, -y * outputHeight / h);
    context.imageSmoothingQuality = 'high';
    context.drawImage(plate, 0, 0, 2000, 1116);
    const phase = elapsed % 4800;
    const working = [
      { x: 660, y: 763, kind: 'seller', pose: phase < 1500 ? 0 : phase < 2050 ? 1 : phase < 2530 ? 2 : 3 },
    ];
    const visible = [...actors.map(actor => walk(actor, elapsed)), ...helpers(dt), ...working]
      .filter(a => a.x >= x - 55 && a.x <= x + w + 55 && a.y >= y && a.y <= y + h + 65)
      .map(actor => drawable(actor, images));
    drawGroszakiWithDepth(context, map, [], occluders, elapsed, 1, false, visible);
    showDeposits(sim.effects, elapsed);
    const carrying = sim.entities.filter(e => e.g.carry).length;
    const counter = 'Z okruszkiem: ' + carrying + ' · Oddane do Skarbca: ' + deposited;
    if (counter !== lastCounter) {
      delivery.textContent = counter;
      lastCounter = counter;
    }
  }

  function stop() {
    if (request !== null) cancelAnimationFrame(request);
    request = null;
    previous = undefined;
    play.textContent = 'Odtwórz';
  }

  function tick(now) {
    previous ??= now;
    const dt = Math.min(0.1, (now - previous) / 1000);
    elapsed += dt * 1000;
    previous = now;
    sim.update(elapsed, dt);
    if (elapsed >= nextDeposit) {
      deposited += sim.tick(elapsed);
      nextDeposit += TICK_MS;
    }
    draw(dt);
    request = requestAnimationFrame(tick);
  }

  function preferenceChanged() {
    if (reduced.matches) stop();
    play.disabled = reduced.matches;
    status.textContent = reduced.matches ? 'Ruch ograniczony zgodnie z ustawieniami systemu.' : '';
  }

  play.addEventListener('click', () => {
    if (request !== null) return stop();
    play.textContent = 'Zatrzymaj';
    request = requestAnimationFrame(tick);
  });
  view.addEventListener('change', () => draw());
  new ResizeObserver(() => draw()).observe(canvas.parentElement);
  reduced.addEventListener('change', preferenceChanged);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  preferenceChanged();
  draw();
} catch (error) {
  status.textContent = 'Nie udało się wczytać podglądu miasteczka.';
  console.error(error);
}

import { buildGraph, findPath, makeRoute, routePosition } from './trasy.js';
import { prepareOccluders, drawGroszakiWithDepth } from './przeslony.js';

const canvas = document.querySelector('#town');
const context = canvas.getContext('2d');
const play = document.querySelector('#play');
const view = document.querySelector('#view');
const status = document.querySelector('#status');
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
  ['carrier', 'piekarnia', 'stragan-c', 3600, 33, 0.64],
  ['carrier', 'mlyn', 'srodek', 10500, 30, 0.73],
  ['carrier', 'podworze', 'l2', 12700, 34, 0.59],
  ['carrier', 'stodola', 'h2', 15300, 36, 0.63],
  ['carrier', 'dynie', 'fi2', 6700, 32, 0.58],
  ['coin', 's0', 'drzwi', 8300, 34, 0.62],
  ['coin', 'p3', 'e6', 6800, 33, 0.48],
];

const windmillWalk = [[288, 271], [318, 285], [290, 306], [255, 324], [246, 339], [272, 356], [317, 365]];

function loadImage(file) {
  const image = new Image();
  image.src = new URL(file, root).href;
  return image.decode().then(() => image);
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
  const distance = route.length * progress;
  const position = routePosition(route, distance, actor.lane * Math.min(1, 12 * progress, 12 * (1 - progress)));
  const pose = progress === 1 ? 1 : Math.floor(distance / (actor.kind === 'carrier' ? 6 : 7)) % 4;
  return { ...position, kind: actor.kind, pose, left: position.dirX < 0 };
}

function drawable(actor, images) {
  const [atlas, anchors, row, scale] = sprites[actor.kind];
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
      ctx.restore();
    },
  };
}

try {
  const art = 'design/rynek/v8/';
  const [map, peopleImage, tradesImage, coinImage, sellerImage, data, occ] = await Promise.all([
    loadImage('zrodla/mapa-jesien.jpg'), loadImage(art + 'mieszkancy.png'),
    loadImage(art + 'mieszkancy-miasteczka.png'), loadImage(art + 'groszak.png'),
    loadImage(art + 'sprzedawczyni.png'), readJson('trasy.json'), readJson('przeslony.json'),
  ]);
  const images = { people: peopleImage, trades: tradesImage, coins: coinImage, seller: sellerImage };
  const graph = buildGraph(data);
  const occluders = prepareOccluders(occ.przeslony);
  const actors = journeys.map(([kind, from, to, phase, speed, lane]) => {
    const path = findPath(graph, from, to, () => 0, 0);
    if (!path || path.length < 2) throw new Error(from + ' → ' + to);
    return makeJourney(kind, path, graph, phase, speed, lane);
  });
  const north = windmillWalk.map(([x, y]) => ({ x, y, s: 11 }));
  actors.push(makeJourney('miller', north, graph, 1500, 20, 0));
  actors.push(makeJourney('carrier', north, graph, 5600, 21, 0));
  let elapsed = 0;
  let previous;
  let request = null;

  function draw() {
    const [x, y, w, h] = cameras[view.value];
    const outputWidth = Math.min(2000, w * 2);
    const outputHeight = Math.round(outputWidth * h / w);
    if (canvas.width !== outputWidth || canvas.height !== outputHeight) {
      canvas.width = outputWidth;
      canvas.height = outputHeight;
    }
    context.setTransform(outputWidth / w, 0, 0, outputHeight / h, -x * outputWidth / w, -y * outputHeight / h);
    context.drawImage(map, 0, 0);
    const phase = elapsed % 4800;
    const working = [
      { x: 678, y: 739, kind: 'seller', pose: phase < 1500 ? 0 : phase < 2050 ? 1 : phase < 2530 ? 2 : 3 },
      { x: 742, y: 739, kind: 'repair', pose: phase < 1900 ? 0 : phase < 2310 ? 1 : phase < 2420 ? 2 : phase < 2800 ? 3 : 0 },
    ];
    const visible = [...actors.map(actor => walk(actor, elapsed)), ...working]
      .filter(a => a.x >= x - 55 && a.x <= x + w + 55 && a.y >= y && a.y <= y + h + 65)
      .map(actor => drawable(actor, images));
    drawGroszakiWithDepth(context, [{ img: map, alpha: 1 }], [], occluders, elapsed, 1, false, visible);
  }

  function stop() {
    if (request !== null) cancelAnimationFrame(request);
    request = null;
    previous = undefined;
    play.textContent = 'Odtwórz';
  }

  function tick(now) {
    previous ??= now;
    elapsed += Math.min(100, now - previous);
    previous = now;
    draw();
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
  view.addEventListener('change', draw);
  reduced.addEventListener('change', preferenceChanged);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  preferenceChanged();
  draw();
} catch (error) {
  status.textContent = 'Nie udało się wczytać podglądu miasteczka.';
  console.error(error);
}

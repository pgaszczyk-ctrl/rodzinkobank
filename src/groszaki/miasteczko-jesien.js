import { findPath, makeRoute, routePosition } from './trasy.js';

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
const neighbors = [
  [[184, 360], [178, 360], [178, 359], [177, 360]],
  [[184, 358], [178, 357], [179, 357], [178, 357]],
  [[182, 349], [180, 349], [182, 349], [181, 348]],
];
const coins = [
  [[220, 375], [221, 377], [221, 376], [222, 377]],
  [[196, 363], [193, 361], [196, 363], [198, 365]],
];
const sellerAnchors = [[[252, 650], [252, 650], [252, 650], [253, 650]]];

const sprites = {
  florist: ['neighbors', neighbors, 0, 0.126],
  grower: ['neighbors', neighbors, 1, 0.128],
  apprentice: ['neighbors', neighbors, 2, 0.132],
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
  ['shopper', 'w2', 'r5', 4200, 24, 0.25],
  ['florist', 'p2', 'stragan-c', 7600, 23, 0.54],
  ['miller', 'mlyn', 'stragan-b', 2900, 26, 0.61],
  ['keeper', 'drzwi', 's0', 5100, 31, 0.42],
  ['farmer', 'dynie', 'podworze', 2000, 24, 0.51],
  ['grower', 'stodola', 'dynie', 8300, 25, 0.70],
];

const windmillWalk = [[288, 271], [318, 285], [290, 306], [255, 324], [246, 339], [272, 356], [317, 365]];

function loadImage(file, root) {
  const image = new Image();
  image.src = new URL(file, root).href;
  return image.decode().then(() => image);
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

export function drawable(actor, images) {
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

export function crumb(ctx, x, y, size) {
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

export async function loadTownSprites(root) {
  const art = 'design/rynek/v8/';
  const files = {
    people: 'mieszkancy.png', trades: 'mieszkancy-miasteczka.png',
    neighbors: 'mieszkancy-rozni.png', coins: 'groszak.png', seller: 'sprzedawczyni.png',
  };
  return Object.fromEntries(await Promise.all(Object.entries(files).map(async ([kind, file]) =>
    [kind, await loadImage(art + file, root)])));
}

export function townResidents(graph) {
  const actors = journeys.map(([kind, from, to, phase, speed, lane]) => {
    const path = findPath(graph, from, to, () => 0, 0);
    if (!path || path.length < 2) throw new Error(from + ' → ' + to);
    return makeJourney(kind, path, graph, phase, speed, lane);
  });
  const north = windmillWalk.map(([x, y]) => ({ x, y, s: 11 }));
  actors.push(makeJourney('apprentice', north, graph, 1500, 20, 0));
  return actors;
}

export function autumnGeometry(data, masks, geometry, image) {
  const sx = 2000 / image.width, sy = 1116 / image.height;
  return {
    routes: { ...data, punkty: data.punkty.map(node => {
      const point = geometry.nodes[node.id];
      return point ? { ...node, x: point[0] * sx, y: point[1] * sy } : node;
    }) },
    masks: masks.map(mask => {
      const correction = geometry.masks[mask.id];
      return correction ? { ...mask, base: correction.base * sy,
        front: correction.front?.map(([x, y]) => [x * sx, y * sy]),
        poly: correction.poly.map(([x, y]) => [x * sx, y * sy]) } : mask;
    }),
  };
}

export function autumnResidents(actors, time, still) {
  const phase = time % 4800;
  return [...actors.map(actor => walk(actor, still ? 0 : time)),
    { x: 660, y: 763, kind: 'seller',
      pose: still || phase < 1500 ? 0 : phase < 2050 ? 1 : phase < 2530 ? 2 : 3 }];
}

export function autumnHelper(entity, time, still, distance) {
  const g = entity.g;
  const working = entity.state === 'working';
  const repair = working && g.job?.action === 'hammer';
  const kind = repair ? 'repair' : working && g.job?.action === 'sack' ? 'carrier' : 'coin';
  const pose = still ? 1 : g.action === 'walk' ? Math.floor(distance / 6) % 4
    : repair ? Math.floor((time + entity.id * 90) / 220) % 4 : 1;
  return { x: g.x, y: g.y, left: g.dir < 0, carry: g.carry, kind, pose };
}

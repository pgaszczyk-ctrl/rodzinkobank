import { drawAutumnLandscape, loadAutumnRotor } from './wiatr.js';
import { autumnGeometry, autumnResidents, crumb, drawable, loadTownSprites, townResidents } from './miasteczko-jesien.js';
import { buildGraph } from './trasy.js';
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
  mill: [105, 48, 535, 740],
  vault: [790, 135, 445, 540],
  farm: [1445, 370, 555, 540],
  bridges: [1120, 380, 565, 565],
};

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
  const [artwork, images, rotor, data, occ, geometry] = await Promise.all([
    loadImage(art + 'miasteczko-jesien-tlo.png'), loadTownSprites(root), loadAutumnRotor(root),
    readJson('trasy.json'), readJson('przeslony.json'), readJson(art + 'miasteczko-jesien-geometria.json'),
  ]);
  const plate = sharpenArtwork(artwork);
  const map = [{ img: plate, alpha: 1, sourceScaleX: artwork.width / 2000, sourceScaleY: artwork.height / 1116 }];
  const adjusted = autumnGeometry(data, occ.przeslony, geometry, artwork);
  const graph = buildGraph(adjusted.routes);
  const occluders = prepareOccluders(adjusted.masks);
  const actors = townResidents(graph);
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
    drawAutumnLandscape(context, rotor, elapsed, reduced.matches);
    const visible = [...autumnResidents(actors, elapsed, false), ...helpers(dt)]
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
    if (reduced.matches) {
      stop();
      draw();
    }
    play.disabled = reduced.matches;
    status.textContent = reduced.matches ? 'Ruch ograniczony zgodnie z ustawieniami systemu.' : '';
  }

  function start() {
    play.textContent = 'Zatrzymaj';
    request = requestAnimationFrame(tick);
  }

  play.addEventListener('click', () => request === null ? start() : stop());
  view.addEventListener('change', () => draw());
  new ResizeObserver(() => draw()).observe(canvas.parentElement);
  reduced.addEventListener('change', preferenceChanged);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  preferenceChanged();
  draw();
  if (!reduced.matches && !document.hidden) start();
} catch (error) {
  status.textContent = 'Nie udało się wczytać podglądu miasteczka.';
  console.error(error);
}

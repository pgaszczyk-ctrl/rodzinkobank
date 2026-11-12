const canvas = document.querySelector('#scene');
const still = document.querySelector('#view img');
const play = document.querySelector('#play');
const status = document.querySelector('#status');
const context = canvas.getContext('2d');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const assets = new URL('../../assets/groszaki/design/rynek/v8/', import.meta.url);

async function loadImage(name) {
  const image = new Image();
  image.src = new URL(name, assets);
  await image.decode();
  return image;
}

function shadow(x, y, width, height) {
  context.fillStyle = 'rgba(121, 61, 31, 0.16)';
  context.beginPath();
  context.ellipse(x, y, width, height, 0, 0, Math.PI * 2);
  context.fill();
}

function frame(image, columns, rows, index, anchor, scale, x, y) {
  const column = index % columns;
  const row = Math.floor(index / columns);
  const left = Math.round(column * image.width / columns);
  const top = Math.round(row * image.height / rows);
  const width = Math.round((column + 1) * image.width / columns) - left;
  const height = Math.round((row + 1) * image.height / rows) - top;
  context.drawImage(image, left, top,
    width, height, x - anchor[0] * scale, y - anchor[1] * scale, width * scale, height * scale);
}

function clippedImage(image, polygon, dx = 0, dy = 0) {
  context.save();
  context.translate(dx, dy);
  context.beginPath();
  polygon.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
  context.closePath();
  context.clip();
  context.drawImage(image, 0, 0);
  context.restore();
}

const apple = [[637, 426], [639, 415], [648, 405], [661, 402], [657, 393],
  [661, 382], [670, 382], [677, 397], [688, 393], [699, 400], [698, 407],
  [686, 414], [686, 429], [680, 440], [671, 446], [657, 445], [654, 433]];
const crateFront = [[440, 858], [537, 899], [691, 856], [691, 954], [534, 997], [440, 946]];

const cycle = 19200;
const routes = [
  { row: 0, scale: 1.13, phase: 0, path: [[136, 387], [368, 489], [419, 542]] },
  { row: 1, scale: 1.10, phase: 2400, path: [[1250, 641], [1090, 662], [954, 633]] },
  { row: 2, scale: 1.00, phase: 5600, path: [[1060, 802], [866, 758], [789, 724]] },
  { row: 2, scale: 1.00, phase: 11600, path: [[236, 679], [354, 625], [411, 601]] },
];
const stops = [0, 4800, 6900, 9400, 11500, 16300, cycle];

const travelerAnchors = [
  [[188, 354], [170, 354], [163, 357], [148, 354]],
  [[185, 358], [178, 359], [163, 361], [158, 359]],
  [[178, 316], [170, 316], [164, 316], [152, 316]],
];
const sellerAnchors = [[252, 650], [251, 650], [250, 650], [252, 650]];
const coinWalkScale = 0.78;
const coinRepairScale = 0.80;
const repairAnchors = [
  [220, 375], [221, 377], [221, 376], [222, 377],
  [196, 363], [196, 363], [196, 363], [196, 363],
];

function easeOut(t) {
  return t + t * t * (1 - t);
}

function easeIn(t) {
  return 1 - easeOut(1 - t);
}

function smoothStep(t) {
  return t * t * (3 - 2 * t);
}

function traveler(route, time, atlas) {
  const local = (time + route.phase) % cycle;
  const end = stops.findIndex(at => at > local);
  const path = [route.path[0], route.path[1], route.path[2], route.path[2],
    route.path[1], route.path[0], route.path[0]];
  const [x0, y0] = path[end - 1];
  const [x1, y1] = path[end];
  const elapsed = local - stops[end - 1];
  const t = elapsed / (stops[end] - stops[end - 1]);
  const progress = end === 1 || end === 4 ? easeIn(t) : easeOut(t);
  const x = x0 + (x1 - x0) * progress;
  const y = y0 + (y1 - y0) * progress;
  const moving = x0 !== x1 || y0 !== y1;
  const segment = Math.hypot(x1 - x0, y1 - y0);
  const previous = end === 2 || end === 5
    ? Math.hypot(path[end - 1][0] - path[end - 2][0], path[end - 1][1] - path[end - 2][1]) : 0;
  const stride = 15 * route.scale;
  const pose = moving ? (1 + Math.floor((previous + segment * progress) / stride)) % 4 : 1;
  const facingLeft = moving ? x1 < x0 : end === 3
    ? route.path[2][0] < route.path[1][0] : route.path[0][0] < route.path[1][0];
  const anchor = travelerAnchors[route.row][pose];
  return { y, paint() {
    shadow(x, y - 2, 50 * route.scale, 13 * route.scale);
    context.save();
    if (facingLeft) {
      context.translate(x * 2, 0);
      context.scale(-1, 1);
    }
    frame(atlas, 4, 3, route.row * 4 + pose, anchor, route.scale, x, y);
    context.restore();
  } };
}
try {
  const [plate, coin, seller, residents] = await Promise.all([
    loadImage('tlo.png'), loadImage('groszak.png'), loadImage('sprzedawczyni.png'), loadImage('mieszkancy.png'),
  ]);
  let request = null;
  let started;

  function draw(elapsed) {
    const time = elapsed % 6400;
    context.drawImage(plate, 0, 0);
    const actors = routes.map(route => traveler(route, elapsed, residents));
    actors.push({ y: 657, paint: drawSeller });

    function drawSeller() {
      const pose = time < 3300 ? 0 : time < 3770 ? 1 : time < 4060 ? 2 : 3;
      shadow(565, 645, 70, 15);
      frame(seller, 4, 1, pose, sellerAnchors[pose], 0.625, 553, 656);
      if (time >= 3770) {
        const fall = Math.min(1, (time - 3770) / 250);
        clippedImage(still, apple, 33 + 5 * fall, 6 + 26 * fall * fall);
      }
    }

    const approach = smoothStep(Math.min(1, time / 2200));
    const retreat = smoothStep(Math.max(0, (time - 4560) / 1840));
    const moving = approach < 1 || retreat > 0;
    const x = 248 + 151 * approach - 151 * retreat;
    const y = 835 + 47 * approach - 47 * retreat;
    actors.push({ y, paint: drawRepair });

    function drawRepair() {
      shadow(x, y - 3, 60, 12);
      context.save();
      if (retreat > 0) {
        context.translate(2 * x, 0);
        context.scale(-1, 1);
      }
      const pose = moving ? (1 + Math.floor(151 * (retreat > 0 ? retreat : approach) / 14)) % 4
        : time < 2780 ? 4 : time < 3120 ? 5 : time < 3230 ? 6 : time < 3490 ? 7 : 4;
      frame(coin, 4, 2, pose, repairAnchors[pose], moving ? coinWalkScale : coinRepairScale, x, y);
      context.restore();
    }

    actors.push({ y: 950, paint: () => clippedImage(plate, crateFront) });
    actors.sort((a, b) => a.y - b.y).forEach(actor => actor.paint());
  }

  function stop() {
    if (request !== null) cancelAnimationFrame(request);
    request = null;
    still.hidden = false;
    canvas.hidden = true;
    play.textContent = 'Odtwórz próbę';
  }

  function animate(now) {
    started ??= now;
    const time = now - started;
    if (time >= cycle) {
      stop();
      return;
    }
    draw(time);
    request = requestAnimationFrame(animate);
  }

  function updatePreference() {
    if (motion.matches) stop();
    play.disabled = motion.matches;
  }

  play.addEventListener('click', () => {
    if (request !== null) {
      stop();
      return;
    }
    started = undefined;
    draw(0);
    still.hidden = true;
    canvas.hidden = false;
    play.textContent = 'Zatrzymaj próbę';
    request = requestAnimationFrame(animate);
  });
  motion.addEventListener('change', updatePreference);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
  });
  updatePreference();
} catch (error) {
  status.textContent = 'Nie udało się wczytać materiałów animacji.';
  console.error(error);
}

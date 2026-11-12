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
  const width = image.width / columns;
  const height = image.height / rows;
  context.drawImage(image, index % columns * width, Math.floor(index / columns) * height,
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

try {
  const [plate, coin, seller] = await Promise.all([
    loadImage('tlo.png'), loadImage('groszak.png'), loadImage('sprzedawczyni.png'),
  ]);
  let request = null;
  let started;

  function draw(time) {
    context.drawImage(plate, 0, 0);
    const sellerPose = time < 3300 ? 0 : time < 3770 ? 1 : time < 4060 ? 2 : 3;
    shadow(565, 645, 70, 15);
    frame(seller, 4, 1, sellerPose, [249, 651], 0.625, 551, 657);
    if (time >= 3770) {
      const fall = Math.min(1, (time - 3770) / 250);
      clippedImage(still, apple, 33 + 5 * fall, 6 + 26 * fall * fall);
    }

    const approach = Math.min(1, time / 2200);
    const retreat = Math.max(0, (time - 4560) / 1840);
    const moving = approach < 1 || retreat > 0;
    const x = 248 + 151 * approach - 151 * retreat;
    const y = 835 + 47 * approach - 47 * retreat;
    shadow(x, y - 3, 60, 12);
    if (retreat > 0) {
      context.save();
      context.translate(2 * x, 0);
      context.scale(-1, 1);
    }
    const pose = moving ? Math.floor(time / 150) % 4
      : time < 2780 ? 4 : time < 3120 ? 5 : time < 3230 ? 6 : time < 3490 ? 7 : 4;
    frame(coin, 4, 2, pose, moving ? [221, 378] : [196, 362], 0.8, x, y);
    if (retreat > 0) context.restore();
    clippedImage(plate, crateFront);
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
    if (time >= 6400) {
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

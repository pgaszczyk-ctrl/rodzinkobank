// "Kopalnia Marzeń" – the illustrated scene ("Cztery pory roku", assets/scene),
// assembled from assets/scene/scena.json and animated with GSAP.
//
// * Above ground: the current season and the next two (500 units each). The
//   timeline maps every date onto that panorama, so each chest sits right under
//   its date (a season of ~91 days spans 500 units).
// * Below ground: the mine. A Groszak digs at the rock with the illustrator's four
//   pickaxe frames (timings from scena.json, sparks and dust on the impact frame),
//   the lift brings gold up the shaft exactly when the balance digits change.

import { SCENE } from './scenedata.js';
import { addMonths, wallParts, wallToInstant } from './calendar.js';
import { chestMarkup } from './chests.js';
import { t, fmtDate, money } from './i18n.js';

const W = SCENE.scene.width;          // 1500
const H = SCENE.scene.height;         // 720
const SLOT = SCENE.scene.seasonSlotWidth;
const AXIS_Y = 263;
const CHEST_Y = 288;
const LIFT_REST_Y = 580, LIFT_TOP_Y = 262;
const START_MONTH = { wiosna: 3, lato: 6, jesien: 9, zima: 12 };
const SPOT = {                        // where the illustrator placed the Groszaki
  A: { x: 1001, y: 675, s: 0.42 },    // at the rock face
  B: { x: 499, y: 675, s: 0.43 },
  C: { x: 755, y: 675, s: 0.43 },
};
const rnd = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- calendar → panorama ---------------- */
/** The current season, the next two, and where each one starts. */
export function seasonFrame(now, tz) {
  const p = wallParts(now, tz);
  const s0 = SCENE.seasonByMonth[p.m - 1];
  const sm = START_MONTH[s0];
  const start = wallToInstant(sm > p.m ? p.y - 1 : p.y, sm, 1, 0, 0, 0, 0, tz);
  const i = SCENE.seasonOrder.indexOf(s0);
  return {
    seasons: [0, 1, 2].map((k) => SCENE.seasonOrder[(i + k) % 4]),
    starts: [0, 1, 2, 3].map((k) => addMonths(start, 3 * k, tz)),
  };
}
export function xOfDate(ms, frame) {
  const s = frame.starts;
  if (ms <= s[0]) return 0;
  for (let k = 0; k < 3; k++) if (ms < s[k + 1]) return SLOT * k + (SLOT * (ms - s[k])) / (s[k + 1] - s[k]);
  return W;
}

/* ---------------- markup helpers ---------------- */
function place(key, l, cls = '', extra = '') {
  const a = SCENE.assets[key];
  const [w, h] = a.size;
  const [px, py] = a.pivot || [0, 0];
  const tf = `translate(${l.x} ${l.y})${l.rotation ? ` rotate(${l.rotation})` : ''} scale(${l.scale ?? 1})`;
  return `<g transform="${tf}" class="${cls}"${extra}><g class="a" data-px="${px}" data-py="${py}"><image href="${a.url}" x="${-px}" y="${-py}" width="${w}" height="${h}" preserveAspectRatio="none"/></g></g>`;
}
const pill = (x, y, text, { fill = '#fff8ea', stroke = '#7a4a2a', color = '#4a2c18', w = null } = {}) => {
  const width = w || Math.max(46, text.length * 7.6 + 20);
  return `<g transform="translate(${x} ${y})"><rect x="${-width / 2}" y="-12" width="${width}" height="24" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>
    <text x="0" y="5" text-anchor="middle" class="scene-pill" fill="${color}">${text}</text></g>`;
};
const FRAMES = SCENE.animationRigs.uderzenie.frames;

/** A Groszak at a spot: the four pickaxe frames stacked (only one visible), or one resting pose. */
function miner(spot, pose, idx) {
  const l = { x: spot.x, y: spot.y, scale: spot.s };
  if (pose === 'strike') {
    const imgs = FRAMES.map((f, i) => {
      const a = SCENE.assets[f.asset];
      return `<image class="f${i}" href="${a.url}" x="${-a.pivot[0]}" y="${-a.pivot[1]}" width="${a.size[0]}" height="${a.size[1]}" opacity="${i ? 0 : 1}"/>`;
    }).join('');
    return `<g transform="translate(${l.x} ${l.y}) scale(${l.scale})" class="m-strike" data-i="${idx}"><g class="a">${imgs}</g></g>`;
  }
  const key = pose === 'lie' ? 'gornicy/gornik-odpoczywa' : pose === 'sit' ? 'gornicy/gornik-ze-zlotem' : 'gornicy/kilof-01-gotowosc';
  return place(key, l, `m-idle m-${pose}`, ` data-i="${idx}"`);
}

/* ---------------- scene markup ---------------- */
function buildMarkup(o) {
  const { now, tz, chests, unlocked, miningActive, restPoses, hasDeposits } = o;
  const frame = seasonFrame(now, tz);
  const todayX = xOfDate(now, frame);

  // which Groszak stands where, doing what
  const roster = [];
  if (!hasDeposits) roster.push({ spot: 'C', pose: 'lie' });
  else if (miningActive) {
    const work = [{ spot: 'A', pose: 'strike' }, { spot: 'B', pose: 'sit' }, { spot: 'C', pose: 'strike' }];
    for (let i = 0; i < unlocked; i++) roster.push(work[i]);
  } else {
    const allowed = { A: ['stand', 'sit'], B: ['sit', 'lie', 'stand'], C: ['lie', 'stand', 'sit'] };
    const want = { wave: 'stand', sit: 'sit', nap: 'lie' };
    ['A', 'B', 'C'].slice(0, unlocked).forEach((spot, i) => {
      const p = want[restPoses[i]] || 'stand';
      roster.push({ spot, pose: allowed[spot].includes(p) ? p : allowed[spot][0] });
    });
  }

  let s = '';
  let minersDone = false, inCart = false;
  for (const l of SCENE.layers) {
    let key = l.asset, cls = '';
    const role = l.role || '';
    if (key.startsWith('gornicy/')) {
      if (minersDone) continue;
      minersDone = true;
      roster.forEach((r, i) => {
        if (r.spot === 'C' && r.pose === 'strike') {   // the second digger breaks a lump of gold ore
          s += place('kopalnia/brylki-zlota', { x: SPOT.C.x + 92, y: 676, scale: 1.05 }, 'ore-lump');
          s += place('efekty/iskra', { x: SPOT.C.x + 88, y: 646, scale: 0.7 }, 'p-hit', ` data-for="${i}"`);
          s += place('efekty/pyl', { x: SPOT.C.x + 96, y: 652, scale: 0.9 }, 'p-dust', ` data-for="${i}"`);
        }
        s += miner(SPOT[r.spot], r.pose, i);
      });
      if (!hasDeposits) s += pill(SPOT.C.x + 10, 520, t('kid.wakeHint'), { fill: '#fff', stroke: '#db2777', color: '#be185d' });
      continue;
    }
    if (role.startsWith('season:')) {
      const [, slot, name] = role.split(':');
      key = `pory-roku/${frame.seasons[slot]}/${name}`;
      cls = { czastka: `p-part p-${frame.seasons[slot]}`, drzewo: 'p-tree', dekoracja: 'p-deco' }[name] || '';
    } else if (role === 'sun') cls = 'p-sun';
    else if (role === 'cloud') cls = 'p-cloud';
    else if (role.startsWith('carrot:')) cls = role.endsWith(':nac') ? 'p-leaves' : '';
    else if (role === 'glow') cls = 'p-glow';
    else if (key === 'kopalnia/latarnia') cls = 'p-lamp';
    else if (role === 'lift') { s += place(key, { ...l, y: LIFT_REST_Y }, 'p-lift'); continue; }
    else if (role === 'spark') cls = l.x > 1030 ? 'p-hit' : 'p-twinkle';
    else if (role === 'dust') cls = 'p-dust';
    // the cart: gold, body and wheels move together
    if (role === 'cart' || role === 'wheel') {
      if (!inCart) { s += `<g class="p-cartgroup">`; inCart = true; }
      if (role === 'cart' && key === 'kopalnia/brylki-zlota' && !hasDeposits) continue;
      s += place(key, l, role === 'wheel' ? 'p-wheel' : '');
      continue;
    }
    if (inCart) { s += '</g>'; inCart = false; }
    const extra = (cls === 'p-hit' || cls === 'p-dust') ? ' data-for="0"' : '';
    s += place(key, l, cls, extra);
  }
  if (inCart) s += '</g>';

  // timeline along the surface: today, months, chest dates
  s += `<path d="M${todayX} ${AXIS_Y} H${W - 10}" stroke="#fff4dc" stroke-width="4" stroke-linecap="round" opacity=".92"/>
    <path d="M${todayX} ${AXIS_Y + 2.5} H${W - 10}" stroke="#7a4a2a" stroke-width="1.2" opacity=".5"/>`;
  const p0 = wallParts(now, tz);
  for (let k = 1; k <= 9; k++) {
    const ms = addMonths(wallToInstant(p0.y, p0.m, 1, 0, 0, 0, 0, tz), k, tz);
    const x = xOfDate(ms, frame);
    if (x >= W - 30) break;
    const label = wallParts(ms, tz).m === 1 ? fmtDate(ms, tz, 'monthYear') : fmtDate(ms, tz, 'month');
    s += `<path d="M${x} ${AXIS_Y - 5} V${AXIS_Y + 5}" stroke="#fff4dc" stroke-width="3" stroke-linecap="round"/><text x="${x + 6}" y="${AXIS_Y + 18}" class="scene-month">${label}</text>`;
  }
  let prevX = -999, row = 0;
  const datePills = [];
  chests.forEach((c, i) => {
    const x = Math.max(xOfDate(c.at, frame), todayX + 40);
    row = x - prevX < 70 ? 1 - row : 0;
    prevX = x;
    const sc = row ? 0.52 : 0.62;
    s += `<g class="chest-marker" data-chest="${i}">
      <path d="M${x} ${AXIS_Y + 10} V${CHEST_Y + 4}" stroke="#fff4dc" stroke-width="2" stroke-dasharray="3 4" opacity=".85"/>
      <g transform="translate(${x - 53 * sc} ${CHEST_Y + row * 6}) scale(${sc})">${chestMarkup(c.skin)}</g>
      ${pill(x, CHEST_Y + 66 + row * 2, money(c.amount, { sign: true }), { fill: '#fff3cf', stroke: '#b45309', color: '#7c3a0a' })}
    </g>`;
    datePills.push(pill(x, AXIS_Y, fmtDate(c.at, tz, 'short'), { w: 64 }));
  });
  s += pill(todayX, AXIS_Y, t('scene.today'), { fill: '#fff', stroke: '#db2777', color: '#be185d', w: 58 });
  s += datePills.join('');

  return { markup: `<svg viewBox="0 0 ${W} ${H}" class="scene-svg" role="img" aria-labelledby="sceneTitle sceneDesc">${s}</svg>`, todayX };
}

/* ---------------- animation (GSAP) ---------------- */
function animate(root, o) {
  const gsap = window.gsap;
  const q = (sel) => [...root.querySelectorAll(sel)];
  const origin = (el) => `${el.dataset.px || 0}px ${el.dataset.py || 0}px`;
  const R = (a, b) => a + Math.random() * (b - a);

  q('.p-cloud > .a').forEach((el, i) => gsap.to(el, { x: R(-36, 36), duration: R(16, 26), ease: 'sine.inOut', yoyo: true, repeat: -1, delay: -i * 3 }));
  q('.p-sun > .a').forEach((el) => {
    gsap.to(el, { rotation: 5, transformOrigin: origin(el), duration: 6, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    gsap.to(el, { scale: 1.035, transformOrigin: origin(el), duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  });
  q('.p-tree > .a, .p-deco > .a').forEach((el, i) => gsap.fromTo(el, { rotation: -1.2 }, { rotation: 1.2, transformOrigin: origin(el), duration: R(2.8, 4.2), ease: 'sine.inOut', yoyo: true, repeat: -1, delay: -i }));
  q('.p-leaves > .a').forEach((el, i) => gsap.fromTo(el, { rotation: -6 }, { rotation: 6, transformOrigin: origin(el), duration: R(1.5, 2.3), ease: 'sine.inOut', yoyo: true, repeat: -1, delay: -i * 0.4 }));
  q('.p-lamp > .a').forEach((el, i) => gsap.fromTo(el, { rotation: -1.8 }, { rotation: 1.8, transformOrigin: origin(el), duration: R(2.6, 3.4), ease: 'sine.inOut', yoyo: true, repeat: -1, delay: -i }));
  q('.p-glow > .a').forEach((el) => gsap.to(el, { opacity: 'random(0.72, 1)', scale: 'random(0.95, 1.05)', transformOrigin: origin(el), duration: 'random(0.18, 0.45)', ease: 'sine.inOut', repeat: -1, repeatRefresh: true }));
  q('.p-twinkle > .a').forEach((el) => {
    gsap.set(el, { scale: 0, transformOrigin: origin(el) });
    gsap.timeline({ repeat: -1, repeatDelay: R(1.2, 3.5), delay: R(0, 3) }).to(el, { scale: 1, rotation: 45, duration: 0.45, ease: 'back.out(2)' }).to(el, { scale: 0, rotation: 90, duration: 0.5, ease: 'power1.in' });
  });
  // season particles: leaves fall, snow drifts, petals float, summer sparkles twinkle
  q('.p-part > .a').forEach((el) => {
    const season = el.parentNode.getAttribute('class').match(/p-(\w+)$/)[1];
    gsap.set(el, { transformOrigin: origin(el) });
    if (season === 'lato') {
      gsap.timeline({ repeat: -1, delay: R(0, 2) }).fromTo(el, { scale: 0.4, opacity: 0.2 }, { scale: 1.2, opacity: 1, duration: 1.2, ease: 'sine.inOut', yoyo: true, repeat: 1 });
      return;
    }
    const fall = season === 'zima' ? 90 : season === 'jesien' ? 110 : 70;
    gsap.fromTo(el, { y: -30, x: 0, opacity: 0, rotation: 0 }, {
      keyframes: { opacity: [0, 1, 1, 0], ease: 'none' }, y: fall, x: season === 'zima' ? R(-14, 14) : R(18, 40),
      rotation: season === 'zima' ? 0 : R(180, 420), duration: R(5, 8), ease: 'sine.inOut', repeat: -1, delay: -R(0, 6),
    });
  });

  // Groszaki
  q('.m-strike').forEach((m) => {
    const imgs = [...m.querySelectorAll('image')];
    const i = m.dataset.i;
    const hits = q(`.p-hit[data-for="${i}"] > .a`), dust = q(`.p-dust[data-for="${i}"] > .a`);
    hits.forEach((h) => gsap.set(h, { scale: 0, transformOrigin: origin(h) }));
    dust.forEach((d) => gsap.set(d, { opacity: 0, transformOrigin: origin(d) }));
    const tl = gsap.timeline({ repeat: -1 });
    let at = 0;
    FRAMES.forEach((f, k) => {
      tl.set(imgs, { opacity: 0 }, at).set(imgs[k], { opacity: 1 }, at);
      if (k === SCENE.animationRigs.uderzenie.impactFrameIndex) {
        hits.forEach((h, j) => tl.fromTo(h, { scale: 0, rotation: 0 }, { scale: 1.25 - j * 0.15, rotation: 60, duration: 0.18, ease: 'back.out(3)', immediateRender: false }, at + j * 0.03)
          .to(h, { scale: 0, duration: 0.3, ease: 'power1.in' }, at + 0.2 + j * 0.03));
        dust.forEach((d) => tl.fromTo(d, { opacity: 0.9, scale: 0.6, x: 0, y: 0 }, { opacity: 0, scale: 1.35, x: -10, y: -14, duration: 0.7, ease: 'power2.out', immediateRender: false }, at));
      }
      at += f.durationMs / 1000;
    });
    tl.set({}, {}, at);
    tl.progress(i * 0.37 % 1);
  });
  q('.m-idle > .a').forEach((el, i) => gsap.to(el, { scaleY: 1.014, transformOrigin: origin(el), duration: R(1.6, 2.2), ease: 'sine.inOut', yoyo: true, repeat: -1, delay: -i }));
  // dozing Groszak: floating "z"
  q('.m-lie').forEach((m) => {
    const g = m.querySelector('.a');
    const ns = 'http://www.w3.org/2000/svg';
    for (let k = 0; k < 3; k++) {
      const z = document.createElementNS(ns, 'text');
      z.setAttribute('x', -120 + k * 14); z.setAttribute('y', -230); z.setAttribute('class', 'scene-z');
      z.textContent = 'z';
      g.appendChild(z);
      gsap.fromTo(z, { y: 0, opacity: 0 }, { y: -90, x: 30, opacity: 1, duration: 2.6, ease: 'sine.out', repeat: -1, delay: k * 0.85, keyframes: { opacity: [0, 1, 0] } });
    }
  });
  // the cart rocks gently while the Groszaki work
  if (o.miningActive) {
    const cart = q('.p-cartgroup')[0];
    if (cart) {
      gsap.to(cart, { x: 6, duration: 1.3, ease: 'sine.inOut', yoyo: true, repeat: -1 });
      q('.p-wheel > .a').forEach((w) => gsap.to(w, { rotation: 26, transformOrigin: origin(w), duration: 1.3, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    }
  }
}

/** Lift run: gold goes up the shaft and arrives exactly at `landInMs`. */
function liftRun(root, landInMs) {
  const gsap = window.gsap;
  const lift = root.querySelector('.p-lift > .a');
  if (!lift) return;
  const scale = SCENE.layers.find((l) => l.role === 'lift').scale || 1;
  const top = (LIFT_TOP_Y - LIFT_REST_Y) / scale;
  const upS = 2.2;
  const tl = gsap.timeline({ delay: Math.max(0, landInMs / 1000 - upS) });
  tl.to(lift, { y: top, duration: Math.min(upS, landInMs / 1000), ease: 'power2.inOut' })
    .call(() => burst(root))
    .to(lift, { y: 0, duration: 2.4, ease: 'power1.inOut' }, '+=0.35');
}
function burst(root) {
  const gsap = window.gsap;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = root.querySelector('svg');
  const spark = SCENE.assets['efekty/iskra'];
  for (let k = 0; k < 6; k++) {
    const img = document.createElementNS(ns, 'image');
    img.setAttribute('href', spark.url); img.setAttribute('width', 30); img.setAttribute('height', 30);
    img.setAttribute('x', 136 - 15); img.setAttribute('y', 236 - 15);
    svg.appendChild(img);
    const a = (k / 6) * Math.PI * 2;
    gsap.fromTo(img, { scale: 0.3, opacity: 1, transformOrigin: '15px 15px' }, {
      x: Math.cos(a) * 46, y: Math.sin(a) * 30 - 20, scale: 0.9, opacity: 0, rotation: 90, duration: 0.8, ease: 'power2.out', onComplete: () => img.remove(),
    });
  }
}

/* ---------------- controller ---------------- */
export function createScene(container, scroller) {
  let sig = '';
  let gctx = null;
  let visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => {
      visible = es[0].isIntersecting;
      if (window.gsap) (visible ? window.gsap.globalTimeline.resume() : window.gsap.globalTimeline.pause());
    }).observe(container);
  }
  return {
    update(o) {
      const key = JSON.stringify([o.chests.map((c) => [c.at, c.amount, c.skin]), o.unlocked, o.miningActive, o.hasDeposits, o.restPoses, Math.floor(o.now / 3600_000), o.lang]);
      const width = Math.max(scroller.clientWidth || 360, 980);
      container.style.width = width + 'px';
      container.style.height = Math.round((width * H) / W) + 'px';
      if (key === sig) return;
      sig = key;
      if (gctx) gctx.revert();
      const { markup, todayX } = buildMarkup(o);
      container.innerHTML = markup;
      if (window.gsap && !reduceMotion()) gctx = window.gsap.context(() => animate(container, o), container);
      else gctx = null;
      if (scroller.scrollWidth > scroller.clientWidth) scroller.scrollLeft = Math.max(0, (todayX / W) * width - 80);
    },
    deliver(landAt, now) {
      if (!gctx || reduceMotion() || !visible) return;
      gctx.add(() => liftRun(container, landAt - now));
    },
  };
}

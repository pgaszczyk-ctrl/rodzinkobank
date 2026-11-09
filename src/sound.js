// Gentle "ka-ching" sounds synthesised with the Web Audio API (no audio files).
// Browsers allow sound only after the first tap or click, so the audio context
// is created lazily and resumed on the first user gesture.

const KEY = 'groszaki.sound';
let ctx = null;
let master = null;
let enabled = true;
try { enabled = localStorage.getItem(KEY) !== 'off'; } catch { /* private mode */ }

function audio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.22;           // overall volume: quiet on purpose
  master.connect(ctx.destination);
  return ctx;
}

// Unlock audio on the first gesture (autoplay policy).
['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
  window.addEventListener(ev, () => { const c = audio(); if (c && c.state === 'suspended') c.resume(); }, { once: true, passive: true }));

export const soundOn = () => enabled;
export function setSound(on) {
  enabled = !!on;
  try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch { /* ignore */ }
  if (enabled) { const c = audio(); if (c && c.state === 'suspended') c.resume(); }
}

function bell(c, t, freq, dur, vol) {
  // a bright bell: fundamental + inharmonic partials, fast attack, exponential decay
  [[1, 1], [2.76, 0.35], [5.4, 0.12]].forEach(([mul, amp]) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.value = freq * mul;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * amp, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur / mul ** 0.3);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  });
}

function click(c, t, vol) {
  // the "ka": a short filtered noise burst, like the coin hitting the drawer
  const len = Math.floor(c.sampleRate * 0.04);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 1.2;
  const g = c.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
}

function ready() {
  if (!enabled || document.visibilityState !== 'visible') return null;
  const c = audio();
  if (!c || c.state !== 'running') return null;
  return c;
}

/** Soft ka-ching when a microgrosz lands. */
export function kaching() {
  const c = ready(); if (!c) return;
  const t = c.currentTime + 0.01;
  click(c, t, 0.35);
  bell(c, t + 0.07, 2093, 0.55, 0.28);   // C7
  bell(c, t + 0.15, 2637, 0.7, 0.22);    // E7
}

/** Brighter ka-ching for a full grosz. */
export function kachingGrosz() {
  const c = ready(); if (!c) return;
  const t = c.currentTime + 0.01;
  click(c, t, 0.4);
  bell(c, t + 0.07, 2093, 0.6, 0.3);
  bell(c, t + 0.15, 2637, 0.7, 0.26);
  bell(c, t + 0.23, 3136, 0.9, 0.22);    // G7
}

/** Festive jingle when a chest opens. */
export function chestFanfare() {
  const c = ready(); if (!c) return;
  const t = c.currentTime + 0.05;
  [1047, 1319, 1568, 2093, 2637].forEach((f, i) => bell(c, t + i * 0.11, f, 1.1, 0.26));
  for (let i = 0; i < 6; i++) click(c, t + 0.6 + i * 0.07, 0.25);
}

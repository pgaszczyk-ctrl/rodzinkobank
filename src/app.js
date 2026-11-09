// Groszaki – child view, live counter, scene and app bootstrap.

import { derive, upcomingChests, chestsBetween, allocateWithdrawal, forecastReach, STEP_MS, MAX_GROSZAKI } from './engine.js';
import { DEFAULT_TZ, dayKey } from './calendar.js';
import { parseZl, floorToGrosz, MICRO_PER_GROSZ } from './money.js';
import { t, setLang, getLang, detectLang, LOCALES, hasKey, money, moneyParts, moneyMicro, fmtDate, duration } from './i18n.js';
import { minerPortrait, chestSvg, chestIcon, logoMark, dreamImage } from './art.js';
import { createMine } from './mine.js';
import { LocalBackend, CloudBackend, AppError, normalizeOp, newId, DEFAULT_DREAMS } from './backend.js';
import { initParentZone } from './parent.js';
import { kaching, kachingGrosz, chestFanfare, soundOn, setSound } from './sound.js';

/* ------------------------------------------------------------------ */
/*  Configuration of the shared family database (Supabase).            */
/*  The publishable key is public; the database functions enforce      */
/*  every permission (see supabase/schema.sql).                        */
/* ------------------------------------------------------------------ */
const SUPABASE_URL = 'https://kjvwvgvwsdtlfogliizz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_1PE_924lLY417qyhUExM3w_NJAzfloC';
const cloudReady = !!(window.supabase && SUPABASE_KEY && !SUPABASE_KEY.startsWith('WKLEJ'));
const sb = cloudReady ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch { /* private mode */ } };
const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DAY = 86400_000;
const DELIVERY_MS = 2900; // lift travel time in the mine scene

/* ------------------------------------------------------------------ */
/*  Shared context (also used by the parent zone)                       */
/* ------------------------------------------------------------------ */
const ctx = {
  mode: 'local',          // 'local' | 'parent' | 'kid'
  backend: null,
  family: null,
  kidId: null,
  snap: null,
  ops: [],
  tz: DEFAULT_TZ,
  offset: 0,
  rev: 0,
  userEmail: '',
  restPoses: ['wave', 'sit', 'nap'].map(() => ['wave', 'sit', 'nap'][Math.floor(Math.random() * 3)]),
  nowMs: () => Date.now() + ctx.offset,
  esc, $,
};
window.__groszaki = ctx; // handy for debugging and end-to-end tests

/* ------------------------------------------------------------------ */
/*  Messages, errors, busy guard                                        */
/* ------------------------------------------------------------------ */
let toastTimer = null;
function toast(msg, kind = 'info') {
  const el = $('toast');
  (document.querySelector('dialog[open]') || document.body).appendChild(el);
  el.textContent = msg;
  el.hidden = false;
  el.className = 'toast-in fixed bottom-5 left-1/2 z-[60] max-w-[calc(100vw-32px)] px-5 py-3 rounded-2xl font-bold shadow-lg ' +
    (kind === 'error' ? 'bg-berry-100 text-berry-700' : 'bg-mint-100 text-mint-700');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4200);
}
const errMsg = (e) => {
  const code = e && (e.code || e.message);
  return code && hasKey('err.' + code) ? t('err.' + code) : t('err.generic');
};
let busy = false;
async function run(fn) {
  if (busy) return undefined;
  busy = true; document.body.style.cursor = 'progress';
  try { return await fn(); }
  catch (e) {
    console.error(e);
    toast(errMsg(e), 'error');
    if (e && (e.code === 'stale_state' || e.code === 'plan_changed')) await reload().catch(() => {});
    return undefined;
  } finally { busy = false; document.body.style.cursor = ''; }
}
Object.assign(ctx, { toast, run, errMsg });

/* ------------------------------------------------------------------ */
/*  Static texts                                                       */
/* ------------------------------------------------------------------ */
function applyStatic() {
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  const brand = t('brand.name');
  const cut = brand.length - 3;
  $('brand').innerHTML = `${esc(brand.slice(0, cut))}<span class="text-berry-500">${esc(brand.slice(cut))}</span>`;
  $('welcomeBrand').innerHTML = $('brand').innerHTML;
  document.title = brand;
  $('logoMark').innerHTML = logoMark('w-11 h-11 sm:w-12 sm:h-12');
  $('welcomeArt').innerHTML = minerPortrait({ title: brand });
  $('kidTabs').setAttribute('aria-label', t('nav.kids'));
  $('langSwitch').innerHTML = Object.keys(LOCALES).map((l) =>
    `<button data-lang="${l}" class="${l === getLang() ? 'text-ink/70' : 'underline hover:text-berry-500'}" ${l === getLang() ? 'aria-current="true"' : ''}>${esc(t('lang.' + l))}</button>`).join('<span aria-hidden="true">/</span>');
  $('langSwitch').querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => {
    lsSet('groszaki.lang', b.dataset.lang); setLang(b.dataset.lang); applyStatic(); renderAll(true); parent.refresh();
  }));
}

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */
function setSnapshot(snap) {
  ctx.snap = snap;
  ctx.ops = (snap.ops || []).map(normalizeOp);
  ctx.tz = snap.tz || DEFAULT_TZ;
  ctx.offset = Number(snap.server_now) - Date.now();
  ctx.rev = Number(snap.rev);
  ctx.dreams = [0, 1, 2].map((i) => {
    const d = (snap.dreams || []).find((x) => Number(x.slot) === i) || DEFAULT_DREAMS[i];
    return { slot: i, name: d.name, price: Number(d.price), img: d.img || null };
  });
  ctx.requests = (snap.requests || []).map((r) => ({ ...r, amount: Number(r.amount), created_at: Number(r.created_at), decided_at: r.decided_at ? Number(r.decided_at) : null }));
  ctx.plan = snap.plan;
  ctx.schedule = snap.schedule ? { ...snap.schedule, amount: Number(snap.schedule.amount) } : null;
  ctx.settings = snap.settings || { bonusPct: 20 };
  forecastCache.clear();
}
ctx.setSnapshot = (snap) => { setSnapshot(snap); renderAll(true); parent.refresh(); };

async function reload(fromPoll = false) {
  const before = ctx.snap ? derive(ctx.ops, { at: ctx.nowMs(), tz: ctx.tz }) : null;
  const beforeIds = new Set(ctx.ops.map((o) => o.id));
  const snap = await ctx.backend.load(ctx.kidId);
  if (!snap) throw new AppError('no_access');
  setSnapshot(snap);
  renderAll(true);
  parent.refresh();
  if (fromPoll && before) {
    const fresh = ctx.ops.filter((o) => !beforeIds.has(o.id) && o.kind === 'deposit');
    const added = fresh.reduce((s, o) => s + o.vault, 0);
    if (added > 0) toast(t('toast.newDeposit', { amount: money(added) }));
  }
}
ctx.reload = reload;

const stateAt = (at) => derive(ctx.ops, { at, tz: ctx.tz });
ctx.stateAt = stateAt;

/* ------------------------------------------------------------------ */
/*  Kid view                                                            */
/* ------------------------------------------------------------------ */
const live = { st: null, up: [], nextAt: null, prevAt: null, delivering: false, lastMicro: null, lastGrosz: null, sceneSig: '' };

function renderSoundBtn() {
  const on = soundOn();
  const b = $('soundBtn');
  b.setAttribute('aria-pressed', String(on));
  b.setAttribute('aria-label', t(on ? 'sound.off' : 'sound.on'));
  b.title = t(on ? 'sound.off' : 'sound.on');
  b.innerHTML = `<svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/>${on ? '<path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>' : '<path d="M17 9l5 6M22 9l-5 6"/>'}</svg>`;
}
$('soundBtn').addEventListener('click', () => { setSound(!soundOn()); renderSoundBtn(); if (soundOn()) kaching(); });

function renderHeader() {
  renderSoundBtn();
  const name = ctx.snap ? ctx.snap.kid.name : '';
  $('greeting').textContent = name ? t('kid.greeting', { name }) : t('brand.tagline');
  const kids = ctx.mode !== 'kid' && ctx.family ? ctx.family.kids : [];
  $('kidTabs').innerHTML = kids.length > 1 ? kids.map((k) =>
    `<button data-kid="${esc(k.id)}" class="px-3 py-1.5 rounded-2xl font-display font-extrabold text-sm ${k.id === ctx.kidId ? 'bg-white shadow-brickSm text-ink' : 'text-ink/50 hover:bg-white/60'}" ${k.id === ctx.kidId ? 'aria-current="true"' : ''}>${esc(k.name)}</button>`).join('') : '';
  $('kidTabs').querySelectorAll('[data-kid]').forEach((b) => b.addEventListener('click', () => switchKid(b.dataset.kid)));

  let bar = '';
  if (ctx.mode === 'local') bar = `<span class="text-xs font-bold text-ink/50 bg-white/70 rounded-full px-3 py-1">${esc(t('mode.local'))}${cloudReady ? ` · <button id="modeLogin" class="underline text-grape-600">${esc(t('auth.login'))}</button>` : ''}</span>`;
  else if (ctx.mode === 'parent') bar = `<span class="text-xs font-bold text-mint-700 bg-mint-100 rounded-full px-3 py-1">${esc(t('mode.parent'))}</span>`;
  $('modeBar').innerHTML = bar;
  const ml = $('modeLogin'); if (ml) ml.addEventListener('click', () => openAuth('login'));
  $('unlinkBtn').hidden = ctx.mode !== 'kid';
  $('footerText').textContent = t(ctx.mode === 'local' ? 'footer.local' : 'footer.cloud', { brand: t('brand.name') });
}

async function switchKid(id) {
  ctx.kidId = id;
  if (ctx.mode === 'local') lsSet('groszaki.localKid', id); else lsSet('groszaki.kidId', id);
  await run(() => reload());
  live.sceneSig = '';
}
ctx.switchKid = switchKid;

function balanceHtml(m, prevMicro) {
  const p = moneyParts(m);
  const digits = p.micro.split('').map((d, i) => (prevMicro && prevMicro[i] !== d ? `<span class="digit-new">${d}</span>` : d)).join('');
  return `<span class="balance-main" id="balMain">${esc(p.main)}</span><span class="balance-micro ${prevMicro ? 'micro-flash' : ''}" id="balMicro" tabindex="0" role="button" aria-describedby="microTip" aria-label="${esc(t('kid.microAria', { n: Number(p.micro) }))}">${digits}<span class="micro-tip" id="microTip" role="tooltip">${esc(t('kid.microTip'))}</span></span><span class="balance-tail">${esc(p.tail)}</span>`;
}

function renderBalance(st, { flash = false } = {}) {
  const p = moneyParts(st.vault);
  const el = $('balance');
  const showTip = $('balMicro') && $('balMicro').classList.contains('show-tip');
  el.innerHTML = balanceHtml(st.vault, flash && !reduceMotion() ? live.lastMicro : null);
  if (showTip) $('balMicro').classList.add('show-tip');
  el.setAttribute('aria-label', p.label);
  const grosz = Math.floor(st.vault / MICRO_PER_GROSZ);
  const crossed = flash && live.lastGrosz != null && grosz > live.lastGrosz;
  if (crossed && !reduceMotion()) {
    const main = $('balMain'); main.classList.remove('grosz-glow'); void main.offsetWidth; main.classList.add('grosz-glow');
  }
  if (flash && live.lastMicro != null && p.micro !== live.lastMicro) (crossed ? kachingGrosz : kaching)();
  live.lastMicro = p.micro;
  live.lastGrosz = grosz;
}

function hasDeposits() { return ctx.ops.some((o) => o.kind === 'deposit' && o.vault > 0); }

function vaultStatus(st) {
  if (!hasDeposits()) return 'first';
  if (st.vault === 0) return 'empty';
  if (!st.miningActive && !live.up.length) return 'done';
  if (!st.miningActive) return 'resting';
  return 'mining';
}

function renderTick(st) {
  const now = ctx.nowMs();
  const status = vaultStatus(st);
  const row = $('tickRow');
  if (st.nextIncrementAt) {
    row.hidden = false;
    const left = Math.max(0, st.nextIncrementAt - now);
    $('tickText').textContent = t('kid.nextMicro', { time: duration(left) });
    const span = Math.max(STEP_MS, st.nextIncrementAt - (live.prevAt ?? st.nextIncrementAt - estimateInterval(st)));
    const pct = Math.min(100, Math.max(0, 100 - (left / span) * 100));
    $('tickFill').style.width = pct.toFixed(1) + '%';
  } else {
    row.hidden = false;
    $('tickText').textContent = t('kid.tick.' + status);
    $('tickFill').style.width = '0%';
  }
}
const estimateInterval = (st) => STEP_MS * Math.max(1, Math.ceil(1 / Math.max(1e-9, st.microPerStep)));

function renderNextChest() {
  const c = live.up[0];
  $('nextChest').innerHTML = c
    ? `${chestIcon(c.skin, 'w-12 h-11 shrink-0')}<div class="min-w-0"><p class="text-xs font-extrabold uppercase tracking-wide text-sun-700">${esc(t('kid.nextChest'))}</p>
       <p class="font-display font-extrabold text-2xl leading-tight text-mint-600 num">${esc(money(c.amount, { sign: true }))}</p>
       <p class="font-bold text-ink/70 text-sm">${esc(fmtDate(c.at, ctx.tz, 'long'))} <span class="text-ink/45">· ${esc(t('kid.chestIn', { time: duration(c.at - ctx.nowMs()) }))}</span></p></div>`
    : `${chestIcon('wood', 'w-12 h-11 shrink-0 opacity-40')}<div><p class="text-xs font-extrabold uppercase tracking-wide text-sun-700">${esc(t('kid.nextChest'))}</p>
       <p class="font-bold text-ink/60 text-sm">${esc(t('kid.noChest'))}</p></div>`;
}

function renderNow(st) {
  const show = st.nowEver || st.now !== 0;
  $('nowBox').hidden = !show;
  if (show) {
    $('nowBox').innerHTML = `<p class="text-xs font-extrabold uppercase tracking-wide text-sky-700">${esc(t('kid.nowTitle'))}</p>
      <p class="font-display font-extrabold text-2xl leading-tight num">${esc(money(st.now))}</p>
      <p class="text-xs font-bold text-ink/50">${esc(t('kid.nowSub'))}</p>`;
  }
}

function renderVaultNote(st) {
  const status = vaultStatus(st);
  const el = $('vaultNote');
  const msg = { first: 'kid.note.first', empty: 'kid.note.empty', done: 'kid.note.done' }[status];
  el.hidden = !msg;
  if (msg) el.innerHTML = `<p class="rounded-2xl bg-berry-50 text-berry-700 font-bold p-3 text-sm sm:text-base">${esc(t(msg))}</p>`;
}

function pendingRequest() { return ctx.requests.find((r) => r.status === 'pending'); }

function renderRequestBox(st) {
  const el = $('requestBox');
  const pend = pendingRequest();
  const now = ctx.nowMs();
  if (pend) {
    const readyAt = pend.created_at + DAY;
    el.innerHTML = `<div class="rounded-3xl bg-grape-50 ring-2 ring-grape-100 p-4 flex flex-wrap items-center justify-between gap-3">
      <div><p class="font-display font-extrabold text-lg">${esc(t('kid.req.pending', { amount: money(pend.amount) }))}</p>
      <p class="text-sm font-bold text-ink/60">${esc(now < readyAt ? t('kid.req.waitUntil', { date: fmtDate(readyAt, ctx.tz, 'dateTime') }) : t('kid.req.ready'))}</p></div>
      <button id="reqCancel" class="btn bg-white text-grape-700 hover:bg-grape-100">${esc(t('kid.req.cancel'))}</button></div>`;
    $('reqCancel').addEventListener('click', () => run(async () => {
      ctx.setSnapshot(await ctx.backend.cancelWithdrawal(ctx.kidId, { id: pend.id }));
      toast(t('toast.reqCancelled'));
    }));
    return;
  }
  const recent = ctx.requests.find((r) => r.decided_at && now - r.decided_at < 3 * DAY && (r.status === 'approved' || r.status === 'rejected'));
  const recentHtml = recent ? `<p class="text-sm font-bold ${recent.status === 'approved' ? 'text-mint-700' : 'text-ink/60'}">${esc(t('kid.req.' + recent.status, { amount: money(recent.amount) }))}</p>` : '';
  el.innerHTML = `<div class="flex flex-wrap items-center justify-between gap-3">${recentHtml || '<span></span>'}
    ${st.available > 0 ? `<button id="reqOpen" class="btn bg-white ring-2 ring-berry-200 text-berry-600 hover:bg-berry-50">${esc(t('kid.req.open'))}</button>` : ''}</div>`;
  const b = $('reqOpen'); if (b) b.addEventListener('click', () => openWithdraw());
}

let mine = null;
function renderScene(st) {
  const vw = $('sceneScroll').clientWidth || 360;
  if (!mine) mine = createMine($('scene'));
  mine.update({
    now: ctx.nowMs(), tz: ctx.tz, chests: live.up, unlocked: st.unlocked, miningActive: st.miningActive,
    restPoses: ctx.restPoses, hasDeposits: hasDeposits(), viewportWidth: vw, lang: getLang(),
  });
  const crewState = !hasDeposits() ? 'first' : st.miningActive ? 'working' : 'resting';
  $('crew').textContent = t('kid.crew', { n: st.unlocked, max: MAX_GROSZAKI }) + ' · ' + t('kid.crew.' + crewState);
  $('mineSub').textContent = t('kid.mineSub');
  $('sceneDesc').textContent = live.up.length
    ? t('scene.desc', { list: live.up.map((c) => `${money(c.amount, { sign: true })} – ${fmtDate(c.at, ctx.tz, 'long')}`).join('; ') })
    : t('kid.noChest');
}

const forecastCache = new Map();
function dreamForecast(price) {
  if (!ctx.schedule) return null;
  const key = `${price}|${dayKey(ctx.nowMs(), ctx.tz)}|${ctx.rev}`;
  if (!forecastCache.has(key)) {
    forecastCache.set(key, forecastReach(ctx.ops, { from: ctx.nowMs(), price, schedule: ctx.schedule, plan: ctx.plan, tz: ctx.tz }));
  }
  return forecastCache.get(key);
}

const DREAM_STYLE = [
  { key: 'easy', bg: 'bg-mint-50', stud: 'stud-mint', bar: 'from-mint-300 to-mint-500', chip: 'bg-mint-100 text-mint-700' },
  { key: 'medium', bg: 'bg-sky-50', stud: 'stud-sky', bar: 'from-sky-300 to-sky-500', chip: 'bg-sky-100 text-sky-700' },
  { key: 'awesome', bg: 'bg-grape-50', stud: 'stud-grape', bar: 'from-grape-300 to-grape-500', chip: 'bg-grape-100 text-grape-700' },
];

function renderDreams(st) {
  $('dreams').innerHTML = ctx.dreams.map((d, i) => {
    const s = DREAM_STYLE[i];
    const price = Math.round(d.price * 100) * MICRO_PER_GROSZ;
    const have = st.available;
    const pct = Math.min(100, (have / price) * 100);
    const can = have >= price;
    const left = Math.max(0, price - have);
    const fc = !can ? dreamForecast(price) : null;
    return `<article class="brick ${s.bg} p-5 pt-8 flex flex-col" aria-labelledby="dreamName${i}">
      <div class="studs ${s.stud}"><span></span><span></span><span></span></div>
      <div class="flex items-center justify-between gap-2">
        <span class="${s.chip} font-display font-extrabold text-sm px-3 py-1 rounded-full">${esc(t('dream.' + s.key))}</span>
        <button data-edit="${i}" class="text-xs font-bold text-ink/50 hover:text-ink underline">${esc(t('dream.edit'))}</button>
      </div>
      <div class="relative mt-4 aspect-[4/3] rounded-3xl overflow-hidden bg-white ring-4 ring-white">
        <img src="${esc(dreamImage(d.img, i))}" alt="" class="w-full h-full object-cover" data-slot="${i}" />
        ${can ? `<div class="absolute inset-x-3 bottom-3 bg-white/95 rounded-2xl px-3 py-2 font-display font-extrabold text-mint-700 text-center shadow pop-in">${esc(t('dream.can'))}</div>` : ''}
      </div>
      <h3 id="dreamName${i}" class="font-display font-extrabold text-xl mt-4 leading-tight">${esc(d.name)}</h3>
      <p class="font-bold text-ink/60">${esc(t('dream.price', { price: money(price) }))}</p>
      <div class="mt-3 h-5 bg-white rounded-full p-1 ring-2 ring-white" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(pct)}" aria-label="${esc(t('dream.progressAria', { name: d.name }))}">
        <div class="progress-fill h-full rounded-full bg-gradient-to-r ${s.bar}" style="width:${Math.max(3, pct).toFixed(1)}%"></div>
      </div>
      <div class="mt-2 flex justify-between gap-2 text-sm font-extrabold">
        <span class="text-ink/70">${esc(t('dream.pct', { n: Math.floor(pct) }))}</span>
        <span class="${can ? 'text-mint-600' : 'text-berry-600'} text-right">${esc(can ? t('dream.enough') : t('dream.missing', { amount: money(left) }))}</span>
      </div>
      ${fc ? `<p class="mt-2 text-xs font-bold text-ink/55"><span class="bg-white rounded-full px-2 py-0.5 mr-1 text-grape-600">${esc(t('dream.forecastTag'))}</span>${esc(t('dream.forecast', { date: fmtDate(fc, ctx.tz, 'longYear') }))}</p>` : ''}
      ${can && !pendingRequest() ? `<button data-buy="${i}" class="mt-4 self-start btn bg-mint-500 hover:bg-mint-600 text-white text-sm">${esc(t('dream.request'))}</button>` : ''}
    </article>`;
  }).join('');
  $('dreams').querySelectorAll('img[data-slot]').forEach((img) => img.addEventListener('error', () => {
    const i = Number(img.dataset.slot); const def = dreamImage(null, i); if (img.src !== def) img.src = def;
  }, { once: true }));
  $('dreams').querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => parent.open('goals', { slot: Number(b.dataset.edit) })));
  $('dreams').querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => {
    const d = ctx.dreams[Number(b.dataset.buy)];
    openWithdraw(Math.round(d.price * 100) * MICRO_PER_GROSZ);
  }));
}

function renderAll(force = false) {
  if (!ctx.snap) return;
  const now = ctx.nowMs();
  const st = stateAt(now);
  live.st = st;
  live.up = upcomingChests(ctx.ops, { from: now, tz: ctx.tz, limit: 3 });
  live.nextAt = st.nextIncrementAt;
  $('mascot').innerHTML = minerPortrait({ sleeping: !hasDeposits(), title: t('kid.mascotAlt') });
  renderHeader();
  renderBalance(st);
  renderTick(st);
  renderNextChest();
  renderNow(st);
  renderVaultNote(st);
  renderRequestBox(st);
  renderScene(st);
  renderDreams(st);
}

/* ------------------------------------------------------------------ */
/*  Live loop: digits change exactly when a microgrosz lands            */
/* ------------------------------------------------------------------ */
let lastSecond = 0;
function loop() {
  if (!ctx.snap) return;
  const now = ctx.nowMs();
  const st = live.st;
  if (!st) return;
  // start the delivery animation so the coin lands on the heap when the digits change
  if (live.nextAt && !live.delivering && now >= live.nextAt - DELIVERY_MS && now < live.nextAt && !reduceMotion() && document.visibilityState === 'visible') {
    live.delivering = true;
    if (mine) mine.deliver(live.nextAt, now);
  }
  const chestDue = live.up[0] && now >= live.up[0].at;
  if ((live.nextAt && now >= live.nextAt) || chestDue) {
    const prevNext = live.nextAt;
    const nst = stateAt(now);
    live.st = nst;
    live.prevAt = prevNext;
    live.nextAt = nst.nextIncrementAt;
    live.delivering = false;
    renderBalance(nst, { flash: true });
    if (chestDue) {
      live.up = upcomingChests(ctx.ops, { from: now, tz: ctx.tz, limit: 3 });
      checkCelebrations();
      renderAll(true);
    } else if (Math.floor(now / 1000) % 60 === 0) {
      renderDreams(nst);
    }
  }
  if (Math.floor(now / 1000) !== lastSecond) {
    lastSecond = Math.floor(now / 1000);
    renderTick(live.st);
    if (lastSecond % 30 === 0) { renderNextChest(); renderScene(live.st); renderRequestBox(live.st); }
  }
}

/* ------------------------------------------------------------------ */
/*  Chest celebrations (also once after coming back)                    */
/* ------------------------------------------------------------------ */
function seenKey() { return `groszaki.seen.${ctx.kidId}`; }
function seenUntil() {
  const local = Number(lsGet(seenKey()) || 0);
  if (ctx.mode === 'parent') return local || Number(ctx.snap.seen_until || 0);
  return Math.max(local, Number(ctx.snap.seen_until || 0));
}
function markSeen(until) {
  lsSet(seenKey(), String(until));
  if (ctx.mode !== 'parent') ctx.backend.markSeen(ctx.kidId, until);
}
let celebrating = false;
function checkCelebrations() {
  if (!ctx.snap || celebrating) return;
  const now = ctx.nowMs();
  const since = seenUntil();
  if (!since) { markSeen(now); return; }
  const c = chestsBetween(ctx.ops, { since, until: now, tz: ctx.tz });
  markSeen(now);
  if (!c) return;
  showCelebration(c, now - c.last > 60_000);
}
function showCelebration(c, away) {
  celebrating = true;
  const skin = c.stage >= 5 ? 'gold' : c.stage >= 3 ? 'silver' : 'wood';
  const coins = reduceMotion() ? '' : Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return `<span class="burst-coin" style="--bx:${Math.round(Math.cos(a) * 110)}px;--by:${Math.round(Math.sin(a) * 80 - 30)}px;animation-delay:${1 + i * 0.03}s"></span>`;
  }).join('');
  $('celArt').innerHTML = `<svg viewBox="-80 -90 160 110" class="w-full h-full celebrate-open"><g class="celebrate-rays">${Array.from({ length: 10 }, (_, i) => `<path d="M0 -30 L${Math.cos(i * 0.628) * 90} ${-30 + Math.sin(i * 0.628) * 90} L${Math.cos(i * 0.628 + 0.2) * 90} ${-30 + Math.sin(i * 0.628 + 0.2) * 90}Z" fill="#fde68a" opacity=".5"/>`).join('')}</g>
    <g class="celebrate-chest" transform="scale(1.5)">${chestSvg(skin)}</g></svg>${coins}`;
  $('celTitle').textContent = t(away ? 'cel.awayTitle' : 'cel.title');
  $('celText').textContent = away && c.count > 1 ? t('cel.awayMany', { n: c.count, amount: money(c.amount) }) : t('cel.text', { amount: money(c.amount) });
  $('celebrateDialog').showModal();
  chestFanfare();
}
$('celOk').addEventListener('click', () => $('celebrateDialog').close());
$('celebrateDialog').addEventListener('close', () => { celebrating = false; });

/* ------------------------------------------------------------------ */
/*  Child: withdrawal request                                           */
/* ------------------------------------------------------------------ */
let wdId = null;
function withdrawImpact(amount) {
  const now = ctx.nowMs();
  const at = now + DAY; // earliest approval
  const before = upcomingChests(ctx.ops, { from: at, tz: ctx.tz, limit: 1 })[0];
  const stAt = stateAt(at);
  const alloc = allocateWithdrawal(stAt, Math.min(amount, stAt.available));
  if (!alloc) return { before, after: before };
  const ops = ctx.ops.concat([{ id: 'preview-w', kind: 'withdrawal', ts: at, vault: -amount, alloc, seq: 1e12 }]);
  const after = upcomingChests(ops, { from: at, tz: ctx.tz, limit: 3 }).find((c) => before && dayKey(c.at, ctx.tz) === dayKey(before.at, ctx.tz));
  return { before, after };
}
function renderWithdrawPreview() {
  const amount = parseZl($('wdAmount').value);
  const st = stateAt(ctx.nowMs());
  const out = $('wdPreview');
  const ok = amount > 0 && amount <= st.available;
  $('wdSubmit').disabled = !ok;
  if (!(amount > 0)) { out.innerHTML = ''; return; }
  if (amount > st.available) { out.innerHTML = `<p class="text-berry-600 font-bold">${esc(t('wd.tooMuch', { amount: money(st.available) }))}</p>`; return; }
  const { before, after } = withdrawImpact(amount);
  let line;
  if (!before) line = t('wd.noChest');
  else if (!after) line = t('wd.chestGone', { date: fmtDate(before.at, ctx.tz, 'long'), amount: money(before.amount) });
  else if (after.amount === before.amount) line = t('wd.chestSame', { date: fmtDate(before.at, ctx.tz, 'long'), amount: money(before.amount) });
  else line = t('wd.chestLess', { date: fmtDate(before.at, ctx.tz, 'long'), from: money(before.amount), to: money(after.amount) });
  out.innerHTML = `<div class="rounded-2xl bg-sun-50 p-3 flex items-center gap-3">${before ? chestIcon(before.skin, 'w-10 h-9 shrink-0') : ''}<p class="font-bold text-sm">${esc(line)}</p></div>`;
}
function openWithdraw(prefill) {
  const st = stateAt(ctx.nowMs());
  if (pendingRequest()) { toast(t('err.request_pending'), 'error'); return; }
  wdId = newId();
  const readyAt = ctx.nowMs() + DAY;
  const pre = prefill && prefill <= st.available ? prefill : '';
  $('wdBody').innerHTML = `<p class="font-semibold text-ink/70">${esc(t('wd.available', { amount: money(st.available) }))}</p>
    <label class="block mt-3"><span class="text-sm font-bold text-ink/70">${esc(t('wd.amount'))}</span>
      <input id="wdAmount" inputmode="decimal" autocomplete="off" class="field mt-1 text-xl font-display" value="${pre ? esc((pre / 1e6).toFixed(2).replace('.', getLang() === 'pl' ? ',' : '.')) : ''}" /></label>
    <div id="wdPreview" class="mt-3"></div>
    <p class="text-sm font-bold text-ink/60 mt-3">${esc(t('wd.when', { date: fmtDate(readyAt, ctx.tz, 'dateTime') }))}</p>`;
  $('wdAmount').addEventListener('input', renderWithdrawPreview);
  renderWithdrawPreview();
  $('withdrawDialog').showModal();
  setTimeout(() => $('wdAmount').focus(), 50);
}
$('wdForm').addEventListener('submit', (e) => {
  if (e.submitter && e.submitter.value !== 'ok') return;
  e.preventDefault();
  const amount = parseZl($('wdAmount').value);
  run(async () => {
    ctx.setSnapshot(await ctx.backend.requestWithdrawal(ctx.kidId, { id: wdId, amount: floorToGrosz(amount) }));
    $('withdrawDialog').close();
    toast(t('toast.reqSent'));
  });
});
ctx.openWithdraw = openWithdraw;

$('balance').addEventListener('click', (e) => {
  const m = e.target.closest('#balMicro');
  if (m) m.classList.toggle('show-tip');
});

/* ------------------------------------------------------------------ */
/*  Parent zone                                                         */
/* ------------------------------------------------------------------ */
const parent = initParentZone(ctx, { cloudReady, openAuth: (m) => openAuth(m), logout: () => logout() });
$('parentBtn').addEventListener('click', () => parent.open());

/* ------------------------------------------------------------------ */
/*  Modes, accounts, sync                                              */
/* ------------------------------------------------------------------ */
let pollTimer = null;
function startPolling() {
  clearInterval(pollTimer);
  if (ctx.mode === 'local') return;
  pollTimer = setInterval(async () => {
    if (busy || document.visibilityState !== 'visible') return;
    try {
      const v = await ctx.backend.version(ctx.kidId);
      if (String(v) !== String(ctx.rev)) await reload(true);
    } catch { /* offline for a moment */ }
  }, 15000);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !ctx.snap) return;
  // Coming back: the balance includes the time the app was closed.
  if (ctx.mode === 'local') { renderAll(); checkCelebrations(); }
  else reload(true).then(checkCelebrations).catch(() => {});
});
window.addEventListener('resize', () => { if (live.st) renderScene(live.st); });

function showWelcome(err) {
  $('welcome').hidden = false;
  $('wError').hidden = !err;
  if (err) $('wError').textContent = err;
}
const hideWelcome = () => { $('welcome').hidden = true; };
$('wParent').addEventListener('click', () => openAuth('login'));
$('wKid').addEventListener('click', () => { $('wKidInfo').hidden = !$('wKidInfo').hidden; });
$('wLocal').addEventListener('click', () => { lsSet('groszaki.mode', 'local'); enterLocal(); });

async function enterLocal() {
  ctx.mode = 'local';
  ctx.backend = new LocalBackend();
  ctx.backend.onExternalChange(() => reload().catch(() => {}));
  ctx.family = ctx.backend.family();
  const saved = lsGet('groszaki.localKid');
  ctx.kidId = (ctx.family.kids.find((k) => k.id === saved) || ctx.family.kids[0]).id;
  hideWelcome();
  await reload();
  checkCelebrations();
}
ctx.refreshFamily = async () => {
  ctx.family = ctx.mode === 'local' ? ctx.backend.family() : await ctx.backend.family();
  renderHeader();
};

async function enterParent(session) {
  ctx.userEmail = (session && session.user && session.user.email) || '';
  ctx.mode = 'parent';
  ctx.backend = new CloudBackend(sb, { role: 'parent' });
  ctx.family = await ctx.backend.family();
  if (!ctx.family) { hideWelcome(); renderHeader(); $('onboardDialog').showModal(); return; }
  const saved = lsGet('groszaki.kidId');
  ctx.kidId = (ctx.family.kids.find((k) => k.id === saved) || ctx.family.kids[0]).id;
  await reload();
  hideWelcome(); startPolling(); checkCelebrations();
}

async function enterKid(token) {
  ctx.mode = 'kid';
  ctx.backend = new CloudBackend(sb, { role: 'kid', token });
  try {
    const snap = await ctx.backend.load(null);
    ctx.kidId = snap.kid.id;
    setSnapshot(snap);
    renderAll(true);
  } catch (e) {
    ctx.mode = 'local'; lsDel('groszaki.kidToken');
    showWelcome(errMsg(e));
    return;
  }
  hideWelcome(); startPolling(); checkCelebrations();
}

async function logout() {
  try { if (ctx.backend && ctx.backend.endSession) await ctx.backend.endSession(ctx.backend.session && ctx.backend.session.token); } catch { /* ignore */ }
  try { if (sb) await sb.auth.signOut(); } catch { /* ignore */ }
  lsDel('groszaki.kidId'); lsDel('groszaki.mode');
  location.reload();
}
$('obLogout').addEventListener('click', logout);
$('unlinkBtn').addEventListener('click', () => {
  if (!confirm(t('footer.unlinkConfirm'))) return;
  lsDel('groszaki.kidToken'); location.reload();
});

$('obCreate').addEventListener('submit', (e) => {
  e.preventDefault();
  run(async () => {
    await ctx.backend.rpc('create_family', { p_kid_name: $('obKid').value.trim().slice(0, 30) });
    $('onboardDialog').close();
    await enterParent((await sb.auth.getSession()).data.session);
    toast(t('toast.familyCreated'));
  });
});
$('obJoin').addEventListener('submit', (e) => {
  e.preventDefault();
  run(async () => {
    await ctx.backend.rpc('join_family', { p_code: $('obCode').value.trim() });
    $('onboardDialog').close();
    await enterParent((await sb.auth.getSession()).data.session);
    toast(t('toast.familyJoined'));
  });
});
$('onboardDialog').addEventListener('cancel', (e) => e.preventDefault());

let authMode = 'login';
function setAuthMode(m) {
  authMode = m;
  document.querySelectorAll('.authTab').forEach((b) => {
    b.className = 'authTab flex-1 py-2 rounded-xl font-bold ' + (b.dataset.auth === m ? 'bg-white shadow-brickSm text-ink' : 'text-ink/50');
  });
  $('authSubmit').textContent = t(m === 'login' ? 'auth.login' : 'auth.signup');
  $('authPass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  $('authForgot').classList.toggle('invisible', m !== 'login');
  authMsg('');
}
function authMsg(text, kind = 'error') {
  const el = $('authMsg');
  el.hidden = !text;
  el.textContent = text;
  el.className = 'mt-3 text-sm font-bold rounded-2xl p-3 ' + (kind === 'error' ? 'bg-berry-50 text-berry-600' : 'bg-mint-50 text-mint-700');
}
function openAuth(m) {
  if (!cloudReady) { toast(t('err.noCloud'), 'error'); return; }
  setAuthMode(m); $('authDialog').showModal(); setTimeout(() => $('authEmail').focus(), 50);
}
document.querySelectorAll('.authTab').forEach((b) => b.addEventListener('click', () => setAuthMode(b.dataset.auth)));
$('authClose').addEventListener('click', () => $('authDialog').close());
const authError = (m) => /invalid login/i.test(m) ? t('auth.err.invalid')
  : /not confirmed/i.test(m) ? t('auth.err.unconfirmed')
  : /already registered/i.test(m) ? t('auth.err.exists')
  : /password/i.test(m) && /6|8|weak|short/i.test(m) ? t('auth.err.weak')
  : /rate limit/i.test(m) ? t('auth.err.rate') : m;
$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('authEmail').value.trim(), password = $('authPass').value;
  $('authSubmit').disabled = true; authMsg('');
  try {
    if (authMode === 'login') {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      $('authDialog').close(); lsDel('groszaki.kidToken'); await enterParent(data.session);
    } else {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) throw error;
      if (data.session) { $('authDialog').close(); await enterParent(data.session); }
      else authMsg(t('auth.checkEmail'), 'ok');
    }
  } catch (err) { authMsg(authError(err.message || String(err))); }
  finally { $('authSubmit').disabled = false; }
});
$('authForgot').addEventListener('click', async () => {
  const email = $('authEmail').value.trim();
  if (!email) { authMsg(t('auth.err.emailFirst')); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  authMsg(error ? authError(error.message) : t('auth.resetSent'), error ? 'error' : 'ok');
});
if (sb) {
  sb.auth.onAuthStateChange((event) => {
    if (event !== 'PASSWORD_RECOVERY') return;
    setTimeout(async () => {
      const np = prompt(t('auth.newPassword'));
      if (!np) return;
      const { error } = await sb.auth.updateUser({ password: np });
      toast(error ? authError(error.message) : t('auth.passwordChanged'), error ? 'error' : 'info');
    }, 0);
  });
}

/* ------------------------------------------------------------------ */
/*  Start                                                              */
/* ------------------------------------------------------------------ */
setLang(detectLang(location.search, lsGet('groszaki.lang')));
applyStatic();

async function boot() {
  const params = new URLSearchParams(location.search);
  const token = params.get('dziecko') || params.get('kid');
  if (token) {
    lsSet('groszaki.kidToken', token);
    params.delete('dziecko'); params.delete('kid');
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash);
  }
  if (!cloudReady || params.get('local') === '1') { await enterLocal(); return; }
  const kidToken = token || lsGet('groszaki.kidToken') || lsGet('rb.kidToken');
  if (kidToken && /^[0-9a-f-]{36}$/i.test(kidToken)) { await enterKid(kidToken); return; }
  const { data } = await sb.auth.getSession();
  if (data && data.session) {
    try { await enterParent(data.session); } catch (e) { showWelcome(errMsg(e)); }
    return;
  }
  if (lsGet('groszaki.mode') === 'local' || lsGet('rb.mode') === 'local') { await enterLocal(); return; }
  showWelcome();
}
boot().catch((e) => { console.error(e); showWelcome(errMsg(e)); });
setInterval(loop, 200);

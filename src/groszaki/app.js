// Groszaki – aplikacja: widok dziecka, strefa rodzica, logowanie i tryby.

import { Store, uuid, isoToDay, dayToIso } from './dane.js';
import { Miasteczko, MIASTECZKO_CSS } from './miasteczko.js';
import { renderGoals, Ksiegowy, CELE_CSS } from './cele.js';
import { buildRoad } from './droga.js';
import { DrogaWidok, DROGA_CSS } from './drogaWidok.js';
import {
  balanceAt, tickTime, splitAmount, crossedFullGrosz, maxWithdrawal, ratesAt, history, simulate,
  depositCostPreview, DEFAULT_RATES, TICK_MS, MICRO_PER_GROSZ,
} from './finanse.js';
import { dayOf, dateOfDay, dayStart } from './czas.js';
import { t, TEKSTY } from './teksty.js';

const cfg = window.GROSZAKI_CONFIG || {};
const cloudReady = !!(window.supabase && cfg.supabaseKey);
const sb = cloudReady ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey) : null;
const BASE = './assets/groszaki/';

// ---------------------------------------------------------------- pomocnicze
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* prywatne okno */ } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch { /* prywatne okno */ } };

const fmt2 = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 });
const fmtPct = new Intl.NumberFormat('pl-PL', { style: 'percent', maximumFractionDigits: 2 });
const fmtInt = new Intl.NumberFormat('pl-PL');
/** Kwota w pełnych groszach (mikrogrosze ucinamy przy wyświetlaniu w strefie rodzica). */
const money = (micro) => fmt2.format(Math.trunc(micro / MICRO_PER_GROSZ) / 100);
const moneyRound = (micro) => {
  const z = micro / 1e6;
  return z >= 100 || Number.isInteger(z) ? fmt0.format(Math.round(z)) : fmt2.format(Math.round(z * 100) / 100);
};
const fmtDay = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const fmtDayY = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmtShort = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Europe/Warsaw' });
const formatDate = (day) => (dateOfDay(day).year === dateOfDay(dayOf(Date.now())).year ? fmtDay : fmtDayY).format(new Date(day * 86400000));
/** '12,50' → µg w pełnych groszach (albo NaN). */
const parseZl = (s) => {
  const v = Number(String(s).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(v) ? Math.round(v * 100) * MICRO_PER_GROSZ : NaN;
};

let toastTimer;
function toast(msg, kind = 'info') {
  const el = $('toast');
  (document.querySelector('dialog[open]') || document.body).appendChild(el);
  el.textContent = msg; el.className = kind; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4200);
}
const friendly = (e) => {
  const m = e?.message || String(e);
  if (/Could not find the function|does not exist/i.test(m)) return 'Baza danych nie jest jeszcze przygotowana do Groszaków (brak migracji).';
  if (/fetch|network|Failed to/i.test(m)) return t('app.brakSieci');
  return m;
};
let busy = false;
async function parentSessionForNewKid() {
  const hasPin = family.has_pin;
  const dialog = $('parentPinDialog');
  const input = $('parentPin');
  $('parentPinLabel').textContent = hasPin
    ? 'Wpisz PIN rodzica'
    : 'Ustaw PIN rodzica (4–8 cyfr)';
  dialog.returnValue = '';
  dialog.showModal();
  await new Promise(resolve => dialog.addEventListener('close', resolve, { once: true }));
  const pin = input.value;
  input.value = '';
  if (dialog.returnValue !== 'confirm') return null;
  const { data, error } = hasPin
    ? await sb.rpc('verify_pin', { p_pin: pin })
    : await sb.rpc('set_pin', { p_pin: pin, p_session: null });
  if (error) throw error;
  if (!hasPin) {
    family.has_pin = true;
    return data;
  }
  if (data?.ok && data.token) return data.token;
  throw new Error(data?.locked_until
    ? 'PIN jest chwilowo zablokowany. Spróbuj ponownie za kilka minut.'
    : 'Nieprawidłowy PIN rodzica.');
}

async function run(fn) {
  if (busy) return;
  busy = true; document.body.style.cursor = 'progress';
  try { await fn(); } catch (e) { console.error(e); toast(friendly(e), 'error'); }
  finally { busy = false; document.body.style.cursor = ''; }
}

function applyTexts(root = document) {
  root.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
  root.querySelectorAll('[data-t-label]').forEach((el) => { el.ariaLabel = el.title = t(el.dataset.tLabel); });
}

// ---------------------------------------------------------------- stan aplikacji
let mode = null;          // 'parent' | 'kid' | 'local'
let store = null;
let family = null;
let userEmail = '';
let town = null;
let ksiegowy = null;
let drogaWidok = null;
let shown = 0;
let tickTimer = null;
let pollTimer = null;

const S = () => store.state;
const now = () => Date.now();
const threshold = () => ratesAt(S().events, now()).threshold;

// ---------------------------------------------------------------- widok dziecka
function renderSaldo(b) {
  const s = splitAmount(Math.max(0, b));
  $('zl').textContent = fmtInt.format(s.zl);
  $('gr').textContent = s.gr;
  $('mic').textContent = s.micro;
  const c = town?.sim.crew;
  $('crew').textContent = !c ? '' : c.count
    ? t('app.groszakiIle', { n: c.count }) + (c.far ? t('app.groszakiFarma', { n: c.far }) : '') + (c.count >= 80 ? t('app.groszakiKazdy', { kwota: moneyRound(c.perGroszak) }) : '')
    : t('app.pustySkarbiec');
}

function roadNow() {
  const st = S();
  return buildRoad({
    events: st.events, now: now(), plans: st.plans,
    custom: st.calendar.map((c) => ({ id: c.id, nazwa: c.nazwa, day: c.day, ikona: c.ikona })),
    ferie: st.kid.ferie, goals: st.goals,
  });
}

function renderGoalsView() {
  const road = roadNow();
  renderGoals($('goals'), road, {
    formatMoney: moneyRound, formatDate, canEdit: true,
    onTap: (f) => { ksiegowy.say(f, road, formatDate); drogaWidok?.scrollToGoal(f.goal.id); },
    onAdd: ({ nazwa, kwotaZl, ikona }) => run(async () => {
      await store.saveGoal({ nazwa, kwota: Math.round(kwotaZl * 100) * MICRO_PER_GROSZ, ikona });
      renderGoalsView();
    }),
    onRemove: (g) => run(async () => { await store.deleteGoal(g.id); renderGoalsView(); }),
  });
  drogaWidok?.render(road, { formatMoney: moneyRound, formatDate, onGoal: (f) => ksiegowy.say(f, road, formatDate) });
}

function renderTop() {
  $('kidName').textContent = S().kid.name;
  document.title = `${S().kid.name} · ${t('app.tytul')}`;
  const tabs = $('kidTabs');
  tabs.innerHTML = mode === 'parent' && family && family.kids.length > 1
    ? family.kids.map((k) => `<button class="pill" data-kid="${esc(k.id)}" aria-pressed="${k.id === store.kidId}">${esc(k.name)}</button>`).join('')
    : '';
  tabs.querySelectorAll('[data-kid]').forEach((b) => b.addEventListener('click', () => run(() => switchKid(b.dataset.kid))));
  $('modeNote').innerHTML = mode === 'local'
    ? esc(t('app.trybProbny')) + (cloudReady ? ` <button type="button" class="btn" id="modeLogin">${esc(t('app.zaloguj'))}</button>` : '')
    : '';
  $('modeLogin')?.addEventListener('click', (e) => { e.preventDefault(); openAuth('login'); });
  $('parentBtn').hidden = mode === 'kid';
  $('unlinkBtn').hidden = mode !== 'kid';
}

function renderKidView(reason = 'tick') {
  const b = balanceAt(S().events, tickTime(now()));
  town.setBalance(b, threshold(), reason);
  shown = b;
  renderTop();
  renderSaldo(b);
  renderGoalsView();
}

/** Tyknięcie co 10 s (równo z zegarem): nowe małe cyfry + okruszki do Skarbca jednocześnie. */
function scheduleTick() {
  clearTimeout(tickTimer);
  tickTimer = setTimeout(() => {
    scheduleTick();
    if (store) {
      const b = balanceAt(S().events, tickTime(now()));
      if (crossedFullGrosz(shown, b) && b > shown) {
        const el = $('big'); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 900);
      }
      shown = b;
      town.tick();
      town.setBalance(b, threshold(), 'tick');
      renderSaldo(b);
    }
  }, TICK_MS - (now() % TICK_MS) + 5);
}

/** Po zmianie danych (zapis albo zmiana z innego urządzenia). */
function afterChange(prevBalance) {
  const b = balanceAt(S().events, now());
  const reason = b > prevBalance + MICRO_PER_GROSZ ? 'deposit' : b < prevBalance - MICRO_PER_GROSZ ? 'withdrawal' : 'tick';
  town.setBalance(b, threshold(), reason);
  shown = b;
  renderTop();
  renderSaldo(b);
  renderGoalsView();
  // Nie przerysowuj formularza w trakcie wpisywania (np. przy zmianie z innego urządzenia).
  if (pz.open && !FORM_VIEWS.includes(pz.view)) renderParent();
  return reason;
}

function startPolling() {
  clearInterval(pollTimer);
  if (mode === 'local') return;
  pollTimer = setInterval(async () => {
    if (busy || document.visibilityState !== 'visible') return;
    try {
      if (await store.changed()) {
        const prev = balanceAt(S().events, now());
        await store.load();
        if (afterChange(prev) === 'deposit') toast(t('app.nowaWplata'));
      }
    } catch { /* chwilowy brak sieci – spróbujemy za chwilę */ }
  }, 15000);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !store || mode === 'local') return;
  const prev = balanceAt(S().events, now());
  store.load().then(() => afterChange(prev)).catch(() => {});
});

async function ensureTown() {
  if (town) return;
  const style = document.createElement('style');
  style.textContent = MIASTECZKO_CSS + CELE_CSS + DROGA_CSS;
  const nextTown = new Miasteczko($('mapWrap'), { base: BASE, formatMoney: moneyRound });
  const roadData = fetch(BASE + 'droga-rok.json').then((r) => r.json()).catch(() => null);
  document.head.appendChild(style);
  try {
    await nextTown.load();
  } catch (error) {
    style.remove();
    throw error;
  }
  town = nextTown;
  ksiegowy = new Ksiegowy(BASE, town.manifest);
  const data = await roadData;
  if (data) drogaWidok = new DrogaWidok($('road'), { base: BASE, manifest: town.manifest, data, material: town.material });
  else $('roadTitle').hidden = true;
  town.start();
  scheduleTick();
}

async function showApp() {
  await ensureTown();
  $('welcome').hidden = true;
  $('app').hidden = false;
  town.resize(true);
  const b = balanceAt(S().events, tickTime(now()));
  town.setBalance(b, threshold(), 'init');
  shown = b;
  renderTop(); renderSaldo(b); renderGoalsView();
  startPolling();
}

async function switchKid(id) {
  store = new Store({ mode: 'parent', sb, kidId: id });
  await store.load();
  lsSet('gr.kidId', id);
  const b = balanceAt(S().events, now());
  town.setBalance(b, threshold(), 'init');
  shown = b;
  renderTop(); renderSaldo(b); renderGoalsView();
  if (pz.open) renderParent();
}

$('mic').addEventListener('click', () => {
  const tip = $('tip');
  tip.textContent = t('saldo.mikro'); tip.hidden = false;
  clearTimeout(tip.timer); tip.timer = setTimeout(() => { tip.hidden = true; }, 3500);
});
$('unlinkBtn').addEventListener('click', () => {
  if (!confirm(t('app.odlaczPytanie'))) return;
  lsDel('gr.kidToken'); location.reload();
});

// ---------------------------------------------------------------- strefa rodzica
// Ekran główny: dziecko, saldo, „Wpłata / Wypłata”, ostatnie operacje i lista ustawień.
// Każda rzadsza rzecz ma osobny widok z przyciskiem „wstecz”.
const pz = { open: false, view: 'home', kidBalances: null, sign: 1 };
const FORM_VIEWS = ['deposit', 'withdrawal', 'adjustment'];
const SETTINGS = ['oprocentowanie', 'regularne', 'kalendarz', 'rodzina'];

let gateAnswer = 0;
$('parentBtn').addEventListener('click', () => {
  if (mode === 'parent') { openParent(); return; }
  const a = 6 + Math.floor(Math.random() * 7), b = 6 + Math.floor(Math.random() * 7);
  gateAnswer = a * b;
  $('gateQ').textContent = t('gate.pytanie', { dzialanie: `${a} × ${b}` });
  $('gateA').value = ''; $('gateErr').hidden = true;
  $('gateDialog').showModal();
});
$('gateForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (Number($('gateA').value) === gateAnswer) { $('gateDialog').close(); openParent(); }
  else $('gateErr').hidden = false;
});
$('gateClose').addEventListener('click', () => $('gateDialog').close());
$('parentClose').addEventListener('click', () => $('parentDialog').close());
$('parentBack').addEventListener('click', () => goParent(pz.view === 'adjustment' ? 'historia' : 'home'));
$('parentDialog').addEventListener('close', () => { pz.open = false; });

/** Panel zawsze otwiera się na ekranie głównym – bez pamiętania ostatniej zakładki. */
function openParent() {
  pz.open = true;
  pz.view = 'home';
  pz.kidBalances = null;
  $('parentDialog').showModal();
  renderParent();
  if (mode === 'parent' && family.kids.length > 1) loadKidBalances();
}

function goParent(view) {
  pz.view = view;
  if (view === 'adjustment') pz.sign = 1;
  renderParent();
  $('parentDialog').scrollTop = 0;
}

async function loadKidBalances() {
  try {
    const states = await Promise.all(family.kids.map(async (k) => {
      const s = new Store({ mode: 'parent', sb, kidId: k.id });
      await s.load();
      return [k.id, balanceAt(s.state.events, now())];
    }));
    pz.kidBalances = Object.fromEntries(states);
    if (pz.open && pz.view === 'home') renderParent();
  } catch { /* przełącznik bez sald */ }
}

function viewTitle(v) {
  const imie = S().kid.name;
  if (v === 'home') return t('rz.tytul');
  if (v === 'rodzina') return t(mode === 'parent' ? 'rz.m.rodzina' : 'rz.m.konto');
  return t('rz.v.' + v, { imie });
}

function renderParent() {
  const v = pz.view;
  $('parentTitle').textContent = viewTitle(v);
  $('parentBack').hidden = v === 'home';
  const sec = $('psec');
  const perKid = ['oprocentowanie', 'regularne', 'kalendarz'].includes(v) && mode === 'parent' && family.kids.length > 1;
  sec.innerHTML = (perKid ? `<p class="note" style="margin:0 0 4px">${esc(t('rz.dotyczy', { imie: S().kid.name }))}</p>` : '') + VIEWS[v]();
  bindParent(sec);
}

const todayIso = () => dayToIso(dayOf(now()));
const fmtOpDay = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', timeZone: 'Europe/Warsaw' });
const fmtMonth = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric', timeZone: 'Europe/Warsaw' });
const signedMoney = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + money(Math.abs(v));

function opInfo(e) {
  if (e.type === 'rate') {
    return { icon: '%', cls: '', amount: '', title: t('op.rate'),
      sub: `${fmtPct.format(e.rates.low)} / ${fmtPct.format(e.rates.high)}, ${t('st.progKrotko')} ${moneyRound(e.rates.threshold)}` };
  }
  const v = e.type === 'withdrawal' ? -e.amount : e.amount;
  const label = t('op.' + e.type);
  return {
    icon: e.type === 'adjustment' ? '✎' : v > 0 ? '+' : '−',
    cls: v > 0 ? 'plus' : 'minus',
    amount: signedMoney(v),
    title: e.note || label,
    sub: e.note ? label.toLowerCase() : '',
  };
}

function opRow(e, tag = 'div') {
  const o = opInfo(e);
  const sub = [fmtOpDay.format(new Date(e.ts)), o.sub].filter(Boolean).join(' · ');
  return `<${tag} class="op"><span class="op-ico ${o.cls}" aria-hidden="true">${o.icon}</span>
    <span class="op-main"><b>${esc(o.title)}</b><small>${esc(sub)}</small></span>
    <span class="op-amt ${o.cls}">${esc(o.amount)}</span></${tag}>`;
}

function menuHint(k) {
  const st = S();
  if (k === 'oprocentowanie') {
    const r = ratesAt(st.events, now());
    return t('rz.h.stawki', { niska: fmtPct.format(r.low), prog: moneyRound(r.threshold), wysoka: fmtPct.format(r.high) });
  }
  if (k === 'regularne') return st.plans.length ? st.plans.map((p) => `${money(p.amount)} ${t('pl.' + p.every)}`).join(', ') : t('pl.brak');
  if (k === 'kalendarz') return t('rz.h.kalendarz', { n: st.calendar.length });
  return t(mode === 'parent' ? 'rz.h.rodzina' : 'rz.h.konto');
}

function viewHome() {
  const n = now();
  const sum = simulate(S().events, n);
  const recent = S().events.filter((e) => e.type !== 'rate' && e.ts <= n).sort((a, b) => b.ts - a.ts).slice(0, 4);
  const kids = mode === 'parent' ? family.kids : [];
  const kidSwitch = kids.length > 1 ? `<div class="kidswitch">${kids.map((k) => {
    const b = pz.kidBalances?.[k.id];
    return `<button class="pill" data-pick="${esc(k.id)}" aria-pressed="${k.id === store.kidId}">${esc(k.name)}${b === undefined ? '' : ` <span class="pill-bal">${esc(money(b))}</span>`}</button>`;
  }).join('')}</div>` : '';
  const facts = sum.deposited || sum.withdrawn || sum.adjusted ? [
    t('rz.wplacono', { kwota: money(sum.deposited) }),
    sum.withdrawn ? t('rz.wyplacono', { kwota: money(sum.withdrawn) }) : '',
    sum.adjusted ? t('rz.poprawki', { kwota: signedMoney(sum.adjusted) }) : '',
  ].filter(Boolean).map(esc).join(' · ') + `<b class="plus">${esc(t('rz.zarobily', { kwota: money(sum.interest) }))}</b>` : esc(t('pusty'));
  return `${kidSwitch}
    <section class="hero">
      <div class="hero-name">${esc(S().kid.name)}</div>
      <div class="hero-bal">${esc(money(sum.total))}</div>
      <div class="hero-sub">${facts}</div>
      <div class="hero-actions">
        <button class="btn big" data-go="deposit">${esc(t('rz.wplata'))}</button>
        <button class="btn big light" data-go="withdrawal">${esc(t('rz.wyplata'))}</button>
      </div>
    </section>
    <h4 class="lbl">${esc(t('rz.ostatnio'))}</h4>
    ${recent.length ? `<div class="ops">${recent.map((e) => opRow(e)).join('')}</div>
      <button class="link" data-go="historia">${esc(t('rz.calaHistoria'))}</button>` : `<p class="note">${esc(t('hist.brak'))}</p>`}
    <h4 class="lbl">${esc(t('rz.ustawienia'))}</h4>
    <div class="menu">${SETTINGS.map((k) => `<button class="menu-row" data-go="${k}">
      <span><b>${esc(t(k === 'rodzina' && mode !== 'parent' ? 'rz.m.konto' : 'rz.m.' + k))}</b><small>${esc(menuHint(k))}</small></span>
      <span class="chev" aria-hidden="true">›</span></button>`).join('')}</div>
    <div class="row foot">
      ${mode === 'parent' ? `<button class="btn light small" data-act="addKid">${esc(t('rz.dodajDziecko'))}</button>` : ''}
      <button class="btn light small" data-act="rename">${esc(t('rz.zmienImie'))}</button>
    </div>
    ${mode === 'parent' ? `<div class="row account">
      <span class="note">${esc(t('rd.zalogowano', { email: userEmail }))}</span>
      <button class="btn light small" data-act="logout">${esc(t('rd.wyloguj'))}</button></div>` : ''}`;
}

function viewMoney() {
  const ty = pz.view;
  const max = maxWithdrawal(S().events, now());
  const opisKey = { deposit: 'rz.opisWplaty', withdrawal: 'rz.opisWyplaty', adjustment: 'rz.opisKorekty' }[ty];
  return `<form id="moneyForm" class="moneyform">
    ${ty === 'adjustment' ? `<p class="note center">${esc(t('rz.korektaOpis'))}</p>
      <div class="tabs2">${[1, -1].map((s) => `<button type="button" data-sign="${s}" aria-pressed="${pz.sign === s}">${esc(t(s > 0 ? 'rz.dodaj' : 'rz.odejmij'))}</button>`).join('')}</div>` : ''}
    <label class="amount"><span class="sr">${esc(t('op.kwota'))}</span>
      <input name="kwota" inputmode="decimal" autocomplete="off" required placeholder="0"><span>zł</span></label>
    ${ty === 'adjustment' ? '' : `<div class="chips">${[5, 10, 20, 50].map((v) => `<button type="button" class="chip" data-add="${v}">+${v} zł</button>`).join('')}</div>`}
    <p class="note center" id="opHint">${ty === 'withdrawal' ? esc(t('op.maks', { kwota: money(max) })) : ''}</p>
    <label class="field"><span>${esc(t(opisKey))}</span><input name="opis" maxlength="80" ${ty === 'deposit' ? 'list="opisy"' : ''}></label>
    ${ty === 'deposit' ? `<datalist id="opisy">${t('rz.podpowiedzi').split('|').map((s) => `<option value="${esc(s)}">`).join('')}</datalist>` : ''}
    <div class="when"><span>${esc(t('op.data'))}:</span>
      <button type="button" class="link" data-act="pickDate">${esc(t('rz.dzis'))} ▾</button>
      <input name="data" type="date" value="${todayIso()}" max="${todayIso()}" required hidden></div>
    <button class="btn wide">${esc(t('rz.zapisz.' + ty))}</button>
  </form>`;
}

function viewHistoria() {
  const n = now();
  const all = history(S().events, n);
  const sum = simulate(S().events, n);
  const sinceLast = sum.interest - all.reduce((a, r) => a + r.interestSincePrev, 0);
  const futureRates = S().events.filter((e) => e.type === 'rate' && e.ts > n);
  const parts = [
    t('rz.h.wplacono', { kwota: money(sum.deposited) }),
    sum.withdrawn ? t('rz.h.wyplacono', { kwota: money(sum.withdrawn) }) : '',
    sum.adjusted ? t('rz.h.poprawki', { kwota: signedMoney(sum.adjusted) }) : '',
  ].filter(Boolean).map(esc).join(', ');
  let month = '';
  const rows = all.slice().reverse().map(({ event: e, balanceAfter, interestSincePrev }) => {
    const m = fmtMonth.format(new Date(e.ts));
    const head = m !== month ? `<h4 class="mhead">${esc(m)}</h4>` : '';
    month = m;
    return `${head}<details class="orow">${opRow(e, 'summary')}
      <div class="op-more">
        ${e.type === 'rate' ? '' : `<span>${esc(t('rz.przedOperacja'))} <b class="plus">+${esc(money(interestSincePrev))}</b></span>`}
        <span>${esc(t('rz.saldoPotem'))} <b>${esc(money(balanceAfter))}</b></span>
        <button class="btn light small" data-del="${esc(e.id)}">${esc(t('hist.usun'))}</button>
      </div></details>`;
  }).join('');
  return `<div class="hsum">
      <p>${parts}${parts ? ', ' : ''}<b class="plus">${esc(t('rz.h.zarobily', { kwota: money(sum.interest) }))}</b>.</p>
      <p class="hsum-total">${esc(t('rz.h.razem', { kwota: money(sum.total) }))}</p>
    </div>
    ${futureRates.length ? `<p class="note">${esc(t('st.zaplanowane'))}: ${futureRates.map((e) => esc(fmtShort.format(new Date(e.ts)))).join(', ')}</p>` : ''}
    ${all.length ? `<div class="orow op op-live"><span class="op-ico plus" aria-hidden="true">✦</span>
      <span class="op-main"><b>${esc(t('rz.odOstatniej'))}</b><small>${esc(t('rz.naBiezaco'))}</small></span>
      <span class="op-amt plus">+${esc(money(sinceLast))}</span></div>` : ''}
    <div class="ops">${rows || `<p class="note">${esc(t('hist.brak'))}</p>`}</div>
    <p class="note" style="margin-top:18px">${esc(t('rz.korektaPodpowiedz'))}
      <button class="link" data-go="adjustment">${esc(t('rz.poprawSaldo'))}</button></p>`;
}

function tabOprocentowanie() {
  const n = now();
  const r = ratesAt(S().events, n);
  const future = S().events.filter((e) => e.type === 'rate' && e.ts > n).sort((a, b) => a.ts - b.ts);
  const tomorrow = dayToIso(dayOf(n) + 1);
  return `<div class="card"><h4>${esc(t('st.obecne'))}</h4>
      <p style="margin:2px 0">${esc(t('st.dolnaCzesc', { prog: moneyRound(r.threshold), stawka: fmtPct.format(r.low) }))}</p>
      <p style="margin:2px 0">${esc(t('st.gornaCzesc', { prog: moneyRound(r.threshold), stawka: fmtPct.format(r.high) }))}</p></div>
    ${future.length ? `<div class="card"><h4>${esc(t('st.zaplanowane'))}</h4><div class="list">${future.map((e) => `<div class="item">
      <span>${esc(fmtShort.format(new Date(e.ts)))}: ${esc(opInfo(e).sub)}</span>
      <button class="btn light small" data-del="${esc(e.id)}">${esc(t('st.cofnij'))}</button></div>`).join('')}</div></div>` : ''}
    <div class="card"><h4>${esc(t('st.nowe'))}</h4>
      <form id="rateForm">
        <div class="row">
          <label class="field"><span>${esc(t('st.niska'))}</span><input name="low" inputmode="decimal" value="${(r.low * 100).toString().replace('.', ',')}" required></label>
          <label class="field"><span>${esc(t('st.wysoka'))}</span><input name="high" inputmode="decimal" value="${(r.high * 100).toString().replace('.', ',')}" required></label>
        </div>
        <div class="row">
          <label class="field"><span>${esc(t('st.prog'))}</span><input name="prog" inputmode="decimal" value="${r.threshold / 1e6}" required></label>
          <label class="field"><span>${esc(t('st.od'))}</span><input name="od" type="date" min="${tomorrow}" value="${tomorrow}" required></label>
        </div>
        <p class="note">${esc(t('st.podpowiedz'))}</p>
        <button class="btn">${esc(t('op.zapisz'))}</button>
      </form></div>`;
}

function tabRegularne() {
  const plans = S().plans;
  return `<p class="note">${esc(t('pl.opis'))}</p>
    <div class="list">${plans.length ? plans.map((p) => `<div class="item"><span><b>${esc(money(p.amount))}</b> ${esc(t('pl.' + p.every))} · ${esc(t('pl.od'))} ${esc(formatDate(p.startDay))}</span>
      <button class="x" data-delplan="${esc(p.id)}" aria-label="×">×</button></div>`).join('') : `<p class="note">${esc(t('pl.brak'))}</p>`}</div>
    <div class="card"><form id="planForm"><div class="row">
      <label class="field"><span>${esc(t('op.kwota'))}</span><input name="kwota" inputmode="decimal" required placeholder="10"></label>
      <label class="field"><span>&nbsp;</span><select name="every">${['week', '2weeks', 'month'].map((k) => `<option value="${k}">${esc(t('pl.' + k))}</option>`).join('')}</select></label>
      <label class="field"><span>${esc(t('pl.od'))}</span><input name="od" type="date" value="${todayIso()}" required></label>
      <button class="btn">${esc(t('pl.dodaj'))}</button></div></form></div>`;
}

function tabKalendarz() {
  const f = S().kid.ferie;
  const cal = [...S().calendar].sort((a, b) => a.day - b.day);
  const icons = ['🎂', '⛺', '🏖️', '🎄', '🎉', '✈️', '🎒', '⭐'];
  return `<div class="card"><h4>${esc(t('kal.ferie'))}</h4><form id="ferieForm" class="row">
      <label class="field"><span>${esc(t('kal.ferieOd'))}</span><input name="od" type="date" value="${f ? dayToIso(f.start) : ''}" required></label>
      <label class="field"><span>${esc(t('kal.ferieDo'))}</span><input name="do" type="date" value="${f ? dayToIso(f.end) : ''}" required></label>
      <button class="btn">${esc(t('op.zapisz'))}</button>
      ${f ? `<button type="button" class="btn light" data-act="hideFerie">${esc(t('kal.ferieUkryj'))}</button>` : ''}
    </form></div>
    <div class="card"><h4>${esc(t('kal.wlasne'))}</h4>
      <div class="list">${cal.length ? cal.map((c) => `<div class="item"><span>${esc(c.ikona)} <b>${esc(c.nazwa)}</b> · ${esc(formatDate(c.day))}</span>
        <button class="x" data-delcal="${esc(c.id)}" aria-label="×">×</button></div>`).join('') : `<p class="note">${esc(t('kal.brak'))}</p>`}</div>
      <form id="calForm" class="row" style="margin-top:8px">
        <label class="field"><span>${esc(t('kal.nazwa'))}</span><input name="nazwa" maxlength="40" required></label>
        <label class="field"><span>${esc(t('op.data'))}</span><input name="data" type="date" min="${todayIso()}" required></label>
        <label class="field" style="flex:0 0 80px"><span>&nbsp;</span><select name="ikona">${icons.map((i) => `<option>${i}</option>`).join('')}</select></label>
        <button class="btn">${esc(t('kal.dodaj'))}</button>
      </form></div>`;
}

const kidLink = (token) => `${location.origin}${location.pathname}?dziecko=${token}`;

function tabRodzina() {
  if (mode !== 'parent') {
    return `<div class="card"><p>${esc(t('rd.probnyOpis'))}</p><div class="row">
      ${cloudReady ? `<button class="btn" data-act="signup">${esc(t('rd.zalozKonto'))}</button>` : ''}
      <button class="btn light" data-act="reset">${esc(t('rd.reset'))}</button></div></div>`;
  }
  const kid = family.kids.find((k) => k.id === store.kidId) || family.kids[0];
  return `<div class="card"><h4>${esc(t('rd.link', { imie: kid.name }))}</h4>
      <p class="note">${esc(t('rd.linkOpis'))}</p>
      <div class="row" style="align-items:flex-start;flex-wrap:nowrap">
        <div class="qr" id="kidQr"></div>
        <div style="flex:1;min-width:0;display:grid;gap:8px">
          <input id="kidLinkInput" readonly value="${esc(kidLink(kid.view_token))}" style="width:100%;padding:8px;border:2px solid var(--line);border-radius:10px;font-size:12px">
          <div class="row"><button class="btn small" data-act="copyLink">${esc(t('rd.kopiuj'))}</button>
            <button class="btn light small" data-act="newLink">${esc(t('rd.nowyLink'))}</button></div>
        </div>
      </div></div>
    <div class="card"><p style="margin:0 0 6px">${esc(t('rd.drugiRodzic'))}</p><span class="code">${esc(family.join_code)}</span></div>
    <div class="row" style="justify-content:space-between;align-items:center">
      <span class="note">${esc(t('rd.zalogowano', { email: userEmail }))}</span>
      <button class="btn light small" data-act="logout">${esc(t('rd.wyloguj'))}</button></div>`;
}

const VIEWS = {
  home: viewHome, historia: viewHistoria, deposit: viewMoney, withdrawal: viewMoney, adjustment: viewMoney,
  oprocentowanie: tabOprocentowanie, regularne: tabRegularne, kalendarz: tabKalendarz, rodzina: tabRodzina,
};

function bindParent(sec) {
  sec.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
    if (mode !== 'parent') return;
    run(() => switchKid(b.dataset.pick));
  }));
  sec.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => goParent(b.dataset.go)));
  sec.querySelectorAll('[data-sign]').forEach((b) => b.addEventListener('click', () => {
    pz.sign = Number(b.dataset.sign);
    sec.querySelectorAll('[data-sign]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  sec.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
    if (!confirm(t('hist.usunPytanie'))) return;
    const prev = balanceAt(S().events, now());
    run(async () => { await store.deleteEvent(b.dataset.del); afterChange(prev); });
  }));
  sec.querySelectorAll('[data-delplan]').forEach((b) => b.addEventListener('click', () =>
    run(async () => { await store.deletePlan(b.dataset.delplan); afterChange(balanceAt(S().events, now())); })));
  sec.querySelectorAll('[data-delcal]').forEach((b) => b.addEventListener('click', () =>
    run(async () => { await store.deleteCalendar(b.dataset.delcal); afterChange(balanceAt(S().events, now())); })));

  const mf = sec.querySelector('#moneyForm');
  if (mf) {
    const ty = pz.view;
    const hint = sec.querySelector('#opHint');
    const update = () => {
      if (ty !== 'deposit') return;
      const a = parseZl(mf.kwota.value);
      hint.textContent = a > 0
        ? t('op.koszt', { kwota: moneyRound(depositCostPreview(S().events, now(), a, { plans: S().plans }).yearInterestFromDeposit) })
        : '';
    };
    // Pole kwoty rośnie razem z liczbą, żeby „zł” stało tuż obok.
    const fit = () => { mf.kwota.style.width = `${Math.max(1, mf.kwota.value.length) * 0.62 + 0.4}em`; };
    mf.kwota.addEventListener('input', () => { fit(); update(); });
    sec.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => {
      const cur = parseZl(mf.kwota.value);
      const sum = (Number.isFinite(cur) && cur > 0 ? cur : 0) + Number(b.dataset.add) * 1e6;
      mf.kwota.value = String(sum / 1e6).replace('.', ',');
      fit(); update();
    }));
    sec.querySelector('[data-act="pickDate"]').addEventListener('click', (e) => {
      e.currentTarget.hidden = true;
      mf.data.hidden = false;
      mf.data.focus();
      try { mf.data.showPicker(); } catch { /* starsze przeglądarki: samo pole */ }
    });
    if (matchMedia('(pointer: fine)').matches) mf.kwota.focus();
    mf.addEventListener('submit', (e) => {
      e.preventDefault();
      let amount = Math.abs(parseZl(mf.kwota.value));
      if (!Number.isFinite(amount) || amount === 0) { toast(t('rz.podajKwote'), 'error'); mf.kwota.focus(); return; }
      if (ty === 'adjustment') amount *= pz.sign;
      const day = isoToDay(mf.data.value);
      const ts = day >= dayOf(now()) ? now() : dayStart(day) + 12 * 3600000;
      const prev = balanceAt(S().events, now());
      run(async () => {
        await store.addMoney(ty, ts, amount, mf.opis.value.trim());
        pz.view = ty === 'adjustment' ? 'historia' : 'home';
        afterChange(prev);
        $('parentDialog').scrollTop = 0;
        toast(ty === 'deposit' ? t('op.zapisanoWplate') : t('op.zapisano'));
      });
    });
  }
  const rf = sec.querySelector('#rateForm');
  rf?.addEventListener('submit', (e) => {
    e.preventDefault();
    const low = Number(rf.low.value.replace(',', '.')) / 100;
    const high = Number(rf.high.value.replace(',', '.')) / 100;
    const thr = parseZl(rf.prog.value);
    run(async () => { await store.setRates(isoToDay(rf.od.value), low, high, thr); afterChange(balanceAt(S().events, now())); toast(t('op.zapisano')); });
  });
  const pf = sec.querySelector('#planForm');
  pf?.addEventListener('submit', (e) => {
    e.preventDefault();
    run(async () => {
      await store.savePlan({ amount: Math.abs(parseZl(pf.kwota.value)), every: pf.every.value, startDay: isoToDay(pf.od.value) });
      afterChange(balanceAt(S().events, now()));
    });
  });
  const ff = sec.querySelector('#ferieForm');
  ff?.addEventListener('submit', (e) => {
    e.preventDefault();
    run(async () => { await store.setFerie({ start: isoToDay(ff.od.value), end: isoToDay(ff.do.value) }); afterChange(balanceAt(S().events, now())); toast(t('op.zapisano')); });
  });
  const cf = sec.querySelector('#calForm');
  cf?.addEventListener('submit', (e) => {
    e.preventDefault();
    run(async () => { await store.saveCalendar({ nazwa: cf.nazwa.value, day: isoToDay(cf.data.value), ikona: cf.ikona.value }); afterChange(balanceAt(S().events, now())); });
  });

  const act = (name, fn) => sec.querySelectorAll(`[data-act="${name}"]`).forEach((b) => b.addEventListener('click', fn));
  act('hideFerie', () => run(async () => { await store.setFerie(null); afterChange(balanceAt(S().events, now())); }));
  act('rename', () => {
    const n = prompt(t('rz.imieDziecka'), S().kid.name);
    if (!n || !n.trim()) return;
    run(async () => {
      await store.renameKid(n.trim().slice(0, 30));
      if (mode === 'parent') family = await sb.rpc('my_family').then((r) => r.data);
      afterChange(balanceAt(S().events, now()));
    });
  });
  act('addKid', () => {
    const n = prompt(t('rz.imieDziecka'));
    if (!n || !n.trim()) return;
    run(async () => {
      const session = await parentSessionForNewKid();
      if (!session) return;
      const { data, error } = await sb.rpc('add_kid', { p_session: session, p_name: n.trim().slice(0, 30) });
      if (error) throw error;
      family = data;
      await switchKid(family.kids[family.kids.length - 1].id);
      loadKidBalances();
    });
  });
  act('copyLink', async () => {
    try { await navigator.clipboard.writeText($('kidLinkInput').value); toast(t('rd.skopiowano')); }
    catch { $('kidLinkInput').select(); }
  });
  act('newLink', () => {
    if (!confirm(t('rd.nowyLinkPytanie'))) return;
    run(async () => {
      const r = await sb.rpc('regenerate_kid_link', { p_kid: store.kidId });
      if (r.error) throw r.error;
      family = (await sb.rpc('my_family')).data;
      renderParent();
    });
  });
  act('logout', logout);
  act('signup', () => { $('parentDialog').close(); openAuth('signup'); });
  act('reset', () => {
    if (!confirm(t('rd.resetPytanie'))) return;
    store.resetLocal();
    const b = balanceAt(S().events, now());
    town.setBalance(b, threshold(), 'init'); shown = b;
    renderTop(); renderSaldo(b); renderGoalsView(); renderParent();
  });
  const qr = sec.querySelector('#kidQr');
  if (qr && window.QRCode) {
    try { new QRCode(qr, { text: $('kidLinkInput').value, width: 256, height: 256, colorDark: '#4a2c1a', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M }); }
    catch { /* kod QR jest tylko dodatkiem */ }
    qr.querySelectorAll('img, canvas').forEach((el) => { el.style.width = '100%'; el.style.height = 'auto'; });
  }
}

// ---------------------------------------------------------------- tryby i logowanie
function showWelcome(err) {
  $('app').hidden = true;
  $('welcome').hidden = false;
  $('wError').hidden = !err;
  if (err) $('wError').textContent = err;
}
$('wParent').addEventListener('click', () => openAuth('login'));
$('wKid').addEventListener('click', () => { $('wKidInfo').hidden = !$('wKidInfo').hidden; });
$('wLocal').addEventListener('click', () => { lsSet('gr.mode', 'local'); run(enterLocal); });

async function enterLocal() {
  mode = 'local';
  store = new Store({ mode: 'local' });
  await store.load();
  await showApp();
}

async function enterParent(session) {
  userEmail = session?.user?.email || '';
  mode = 'parent';
  const { data, error } = await sb.rpc('my_family');
  if (error) throw error;
  family = data;
  if (!family) { $('welcome').hidden = true; $('onboardDialog').showModal(); return; }
  const saved = lsGet('gr.kidId');
  const kid = family.kids.find((k) => k.id === saved) || family.kids[0];
  store = new Store({ mode: 'parent', sb, kidId: kid.id });
  await store.load();
  await showApp();
}

async function enterKid(token) {
  mode = 'kid';
  store = new Store({ mode: 'kid', sb, token });
  try { await store.load(); }
  catch (e) {
    lsDel('gr.kidToken');
    mode = null; store = null;
    showWelcome(friendly(e));
    return;
  }
  await showApp();
}

async function logout() {
  try { await sb?.auth.signOut(); } catch { /* i tak czyścimy */ }
  lsDel('gr.kidId'); lsDel('gr.mode');
  location.reload();
}
$('obLogout').addEventListener('click', logout);
$('onboardDialog').addEventListener('cancel', (e) => e.preventDefault());
$('obCreate').addEventListener('submit', (e) => {
  e.preventDefault();
  run(async () => {
    const r = await sb.rpc('create_family', { p_kid_name: $('obKid').value.trim().slice(0, 30) });
    if (r.error) throw r.error;
    $('onboardDialog').close();
    await enterParent((await sb.auth.getSession()).data.session);
  });
});
$('obJoin').addEventListener('submit', (e) => {
  e.preventDefault();
  run(async () => {
    const r = await sb.rpc('join_family', { p_code: $('obCode').value.trim() });
    if (r.error) throw r.error;
    $('onboardDialog').close();
    await enterParent((await sb.auth.getSession()).data.session);
  });
});

let authMode = 'login';
function setAuthMode(m) {
  authMode = m;
  document.querySelectorAll('.authTab').forEach((b) => b.setAttribute('aria-pressed', b.dataset.auth === m));
  $('authSubmit').textContent = t(m === 'login' ? 'auth.zaloguj' : 'auth.zaloz');
  $('authPass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  $('authForgot').hidden = m !== 'login';
  authMsg('');
}
function authMsg(text, kind = 'err') {
  const el = $('authMsg');
  el.hidden = !text; el.textContent = text; el.className = 'msg ' + kind;
}
function openAuth(m) {
  if (!cloudReady) { toast('Wspólna baza nie jest podłączona (brak klucza).', 'error'); return; }
  setAuthMode(m); $('authDialog').showModal(); setTimeout(() => $('authEmail').focus(), 50);
}
document.querySelectorAll('.authTab').forEach((b) => b.addEventListener('click', () => setAuthMode(b.dataset.auth)));
$('authClose').addEventListener('click', () => $('authDialog').close());
const plAuthError = (m) => /invalid login/i.test(m) ? 'Nieprawidłowy e-mail lub hasło.'
  : /not confirmed/i.test(m) ? 'Najpierw potwierdź e-mail – kliknij link w wiadomości od nas.'
  : /already registered/i.test(m) ? 'To konto już istnieje – zaloguj się.'
  : /password/i.test(m) && /6|8|weak|short/i.test(m) ? 'Hasło jest za słabe – użyj co najmniej 8 znaków.'
  : /rate limit/i.test(m) ? 'Za dużo prób. Odczekaj chwilę.' : m;

$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('authEmail').value.trim(), password = $('authPass').value;
  $('authSubmit').disabled = true; authMsg('');
  try {
    if (authMode === 'login') {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      $('authDialog').close(); lsDel('gr.mode'); await enterParent(data.session);
    } else {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) throw error;
      if (data.session) { $('authDialog').close(); lsDel('gr.mode'); await enterParent(data.session); }
      else authMsg('Prawie gotowe! Wysłaliśmy e-mail – kliknij w nim link, a potem zaloguj się tutaj.', 'ok');
    }
  } catch (err) { authMsg(plAuthError(friendly(err))); }
  finally { $('authSubmit').disabled = false; }
});
$('authForgot').addEventListener('click', async () => {
  const email = $('authEmail').value.trim();
  if (!email) { authMsg('Wpisz najpierw swój e-mail.'); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  authMsg(error ? plAuthError(error.message) : 'Wysłaliśmy link do ustawienia nowego hasła.', error ? 'err' : 'ok');
});
sb?.auth.onAuthStateChange((event) => {
  if (event !== 'PASSWORD_RECOVERY') return;
  setTimeout(async () => {
    const np = prompt('Wpisz nowe hasło (min. 8 znaków):');
    if (!np) return;
    const { error } = await sb.auth.updateUser({ password: np });
    toast(error ? plAuthError(error.message) : 'Hasło zmienione!', error ? 'error' : 'info');
  }, 0);
});

// ---------------------------------------------------------------- start
async function boot() {
  applyTexts();
  fetch(BASE + 'czesci.json').then((r) => r.json()).then((m) => {
    const p = m.postacie?.ksiegowy?.wskazuje;
    if (p) $('welcomeImg').src = BASE + p.plik;
  }).catch(() => {});
  const params = new URLSearchParams(location.search);
  const tok = params.get('dziecko');
  if (tok) {
    lsSet('gr.kidToken', tok);
    params.delete('dziecko');
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash);
  }
  if (params.has('probny') || !cloudReady) { await enterLocal(); return; }
  const token = tok || lsGet('gr.kidToken') || lsGet('rb.kidToken');
  if (token && /^[0-9a-f-]{36}$/i.test(token)) { await enterKid(token); return; }
  const { data } = await sb.auth.getSession();
  if (data?.session) {
    try { await enterParent(data.session); } catch (e) { showWelcome(friendly(e)); }
    return;
  }
  if (lsGet('gr.mode') === 'local' || lsGet('rb.mode') === 'local') { await enterLocal(); return; }
  showWelcome();
}
boot().catch((e) => { console.error(e); showWelcome(friendly(e)); });
window.groszaki = { get store() { return store; }, get town() { return town; }, TEKSTY };

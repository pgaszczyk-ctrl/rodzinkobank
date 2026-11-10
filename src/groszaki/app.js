// Groszaki – aplikacja: widok dziecka, strefa rodzica, logowanie i tryby.

import { Store, uuid, isoToDay, dayToIso } from './dane.js';
import { Miasteczko, MIASTECZKO_CSS } from './miasteczko.js';
import { renderGoals, Ksiegowy, CELE_CSS } from './cele.js';
import { buildRoad } from './droga.js';
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
async function run(fn) {
  if (busy) return;
  busy = true; document.body.style.cursor = 'progress';
  try { await fn(); } catch (e) { console.error(e); toast(friendly(e), 'error'); }
  finally { busy = false; document.body.style.cursor = ''; }
}

function applyTexts(root = document) {
  root.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
}

// ---------------------------------------------------------------- stan aplikacji
let mode = null;          // 'parent' | 'kid' | 'local'
let store = null;
let family = null;
let userEmail = '';
let town = null;
let ksiegowy = null;
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
    onTap: (f) => ksiegowy.say(f, road, formatDate),
    onAdd: ({ nazwa, kwotaZl, ikona }) => run(async () => {
      await store.saveGoal({ nazwa, kwota: Math.round(kwotaZl * 100) * MICRO_PER_GROSZ, ikona });
      renderGoalsView();
    }),
    onRemove: (g) => run(async () => { await store.deleteGoal(g.id); renderGoalsView(); }),
  });
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
    ? esc(t('app.trybProbny')) + (cloudReady ? ` · <a href="#" id="modeLogin">${esc(t('app.zaloguj'))}</a>` : '')
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
    scheduleTick();
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
  if (pz.open) renderParent();
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
  style.textContent = MIASTECZKO_CSS + CELE_CSS;
  document.head.appendChild(style);
  town = new Miasteczko($('mapWrap'), { base: BASE, formatMoney: moneyRound });
  await town.load();
  ksiegowy = new Ksiegowy(BASE, town.manifest);
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
const pz = { open: false, tab: 'operacje', type: 'deposit', kidBalances: null };
const TABS = ['dzieci', 'operacje', 'historia', 'oprocentowanie', 'regularne', 'kalendarz', 'rodzina'];

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
$('parentDialog').addEventListener('close', () => { pz.open = false; });

function openParent() {
  pz.open = true;
  pz.kidBalances = null;
  $('parentDialog').showModal();
  renderParent();
  if (mode === 'parent') loadKidBalances();
}

async function loadKidBalances() {
  try {
    const states = await Promise.all(family.kids.map(async (k) => {
      const s = new Store({ mode: 'parent', sb, kidId: k.id });
      await s.load();
      return [k.id, balanceAt(s.state.events, now())];
    }));
    pz.kidBalances = Object.fromEntries(states);
    if (pz.open && pz.tab === 'dzieci') renderParent();
  } catch { /* lista bez sald */ }
}

function renderParent() {
  const tabs = $('ptabs');
  tabs.innerHTML = TABS.map((k) => `<button class="pill" data-tab="${k}" aria-pressed="${k === pz.tab}">${esc(t('rz.' + k))}</button>`).join('');
  tabs.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { pz.tab = b.dataset.tab; renderParent(); }));
  const sec = $('psec');
  const kidHead = `<p class="note" style="margin:0 0 6px">${esc(t('app.skarbiecDziecka', { imie: S().kid.name }))} · ${esc(money(balanceAt(S().events, now())))}</p>`;
  sec.innerHTML = (pz.tab === 'dzieci' || pz.tab === 'rodzina' ? '' : kidHead) + ({
    dzieci: tabDzieci, operacje: tabOperacje, historia: tabHistoria, oprocentowanie: tabOprocentowanie,
    regularne: tabRegularne, kalendarz: tabKalendarz, rodzina: tabRodzina,
  }[pz.tab])();
  bindParent(sec);
}

const todayIso = () => dayToIso(dayOf(now()));

function tabDzieci() {
  const kids = mode === 'parent' ? family.kids : [{ id: 'local', name: S().kid.name }];
  const bal = (k) => (mode === 'parent' ? pz.kidBalances?.[k.id] : balanceAt(S().events, now()));
  return `<div class="kidlist">${kids.map((k) => `<button class="kidcard" data-pick="${esc(k.id)}" aria-pressed="${mode !== 'parent' || k.id === store.kidId}">
      <b>${esc(k.name)}</b><span class="note">${bal(k) === undefined ? '…' : esc(money(bal(k)))}</span></button>`).join('')}
    </div>
    <div class="row" style="margin-top:10px">
      ${mode === 'parent' ? `<button class="btn light small" data-act="addKid">${esc(t('rz.dodajDziecko'))}</button>` : ''}
      <button class="btn light small" data-act="rename">${esc(t('rz.zmienImie'))}</button>
    </div>`;
}

function tabOperacje() {
  const ty = pz.type;
  const max = maxWithdrawal(S().events, now());
  return `<div class="card">
    <div class="row" style="gap:6px;margin-bottom:6px">${['deposit', 'withdrawal', 'adjustment'].map((k) =>
      `<button class="pill" data-type="${k}" aria-pressed="${k === ty}">${esc(t('op.' + k))}</button>`).join('')}</div>
    <form id="moneyForm">
      <div class="row">
        <label class="field"><span>${esc(t(ty === 'adjustment' ? 'op.korektaKwota' : 'op.kwota'))}</span>
          <input name="kwota" inputmode="decimal" autocomplete="off" required placeholder="${ty === 'adjustment' ? '-1,50' : '10'}"></label>
        <label class="field"><span>${esc(t('op.data'))}</span><input name="data" type="date" value="${todayIso()}" max="${todayIso()}" required></label>
      </div>
      <label class="field"><span>${esc(t('op.opis'))}</span><input name="opis" maxlength="80"></label>
      <p class="note" id="opHint">${ty === 'withdrawal' ? esc(t('op.maks', { kwota: money(max) })) : ''}</p>
      <button class="btn">${esc(t('op.zapisz'))}</button>
    </form></div>`;
}

function opLabel(e) {
  if (e.type === 'rate') {
    return `${t('op.rate')}: ${fmtPct.format(e.rates.low)} / ${fmtPct.format(e.rates.high)}, ${t('st.progKrotko')} ${moneyRound(e.rates.threshold)}`;
  }
  return t('op.' + e.type) + (e.note ? ` – ${e.note}` : '');
}

function tabHistoria() {
  const n = now();
  const rows = history(S().events, n).reverse();
  const futureRates = S().events.filter((e) => e.type === 'rate' && e.ts > n);
  const sum = simulate(S().events, n);
  const sign = (e) => (e.type === 'withdrawal' ? -e.amount : e.amount);
  const body = rows.map(({ event: e, balanceAfter, interestSincePrev }) => `<tr>
      <td>${esc(fmtShort.format(new Date(e.ts)))}</td>
      <td>${esc(opLabel(e))}</td>
      <td class="n ${e.type === 'rate' ? '' : sign(e) > 0 ? 'plus' : 'minus'}">${e.type === 'rate' ? '' : (sign(e) > 0 ? '+' : '−') + esc(money(Math.abs(sign(e))))}</td>
      <td class="n" data-l="${esc(t('hist.odsetki'))}:">${e.type === 'rate' ? '' : '+' + esc(money(interestSincePrev))}</td>
      <td class="n" data-l="${esc(t('hist.saldoPo'))}:">${esc(money(balanceAfter))}</td>
      <td class="n"><button class="x" data-del="${esc(e.id)}" title="${esc(t('hist.usun'))}" aria-label="${esc(t('hist.usun'))}">×</button></td>
    </tr>`).join('');
  return `<div class="summary">
      <div>${esc(t('hist.wplacono'))}<b>${esc(money(sum.deposited))}</b></div>
      <div>${esc(t('hist.wyplacono'))}<b>${esc(money(sum.withdrawn))}</b></div>
      <div>${esc(t('hist.korekty'))}<b>${esc(money(sum.adjusted))}</b></div>
      <div>${esc(t('hist.odsetkiRazem'))}<b class="plus">${esc(money(sum.interest))}</b></div>
      <div>${esc(t('hist.teraz'))}<b>${esc(money(sum.total))}</b></div>
    </div>
    ${futureRates.length ? `<p class="note">${esc(t('st.zaplanowane'))}: ${futureRates.map((e) => esc(fmtShort.format(new Date(e.ts)))).join(', ')}</p>` : ''}
    <div class="tablewrap card" style="padding:4px 6px"><table class="hist">
      <thead><tr><th>${esc(t('hist.data'))}</th><th>${esc(t('hist.operacja'))}</th><th class="n">${esc(t('hist.kwota'))}</th>
        <th class="n">${esc(t('hist.odsetki'))}</th><th class="n">${esc(t('hist.saldoPo'))}</th><th></th></tr></thead>
      <tbody>${body || `<tr><td colspan="6" class="note">${esc(t('hist.brak'))}</td></tr>`}</tbody></table></div>`;
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
      <span>${esc(fmtShort.format(new Date(e.ts)))}: ${esc(opLabel(e))}</span>
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

function bindParent(sec) {
  sec.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
    if (mode !== 'parent') return;
    run(async () => { await switchKid(b.dataset.pick); pz.tab = 'operacje'; renderParent(); });
  }));
  sec.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => { pz.type = b.dataset.type; renderParent(); }));
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
    const hint = sec.querySelector('#opHint');
    const update = () => {
      const a = parseZl(mf.kwota.value);
      if (pz.type === 'deposit' && a > 0) {
        const c = depositCostPreview(S().events, now(), a, { plans: S().plans });
        hint.textContent = t('op.koszt', { kwota: moneyRound(c.yearInterestFromDeposit) });
      } else if (pz.type === 'deposit') hint.textContent = '';
    };
    mf.kwota.addEventListener('input', update);
    mf.addEventListener('submit', (e) => {
      e.preventDefault();
      let amount = parseZl(mf.kwota.value);
      if (!Number.isFinite(amount) || amount === 0) { toast(t('op.kwota') + '?', 'error'); return; }
      if (pz.type !== 'adjustment') amount = Math.abs(amount);
      const day = isoToDay(mf.data.value);
      const ts = day >= dayOf(now()) ? now() : dayStart(day) + 12 * 3600000;
      const prev = balanceAt(S().events, now());
      run(async () => {
        await store.addMoney(pz.type, ts, amount, mf.opis.value.trim());
        afterChange(prev);
        toast(pz.type === 'deposit' ? t('op.zapisanoWplate') : t('op.zapisano'));
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
      const { data, error } = await sb.rpc('add_kid', { p_name: n.trim().slice(0, 30) });
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

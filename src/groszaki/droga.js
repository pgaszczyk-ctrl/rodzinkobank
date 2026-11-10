// Droga przez rok i cele: czyste funkcje (bez DOM).
//
// Droga zaczyna się od „Dziś” i obejmuje 14 miesięcy. Przy każdym drogowskazie
// stoi prognoza salda „jeśli nic nie wydasz” (z procentem i regularnymi
// wpłatami). Każdy cel dostaje flagę w dniu, w którym saldo go osiągnie.

import { DEFAULT_TZ, dayOf, dateOfDay, dayNumberOf } from './czas.js';
import { standardWaypoints, seasonOfDay } from './kalendarz.js';
import { dailyForecast, reachDay, balanceAt } from './finanse.js';

export const ROAD_MONTHS = 14;
export const NIGHTS_LIMIT = 14;

/** Numer dnia „za n miesięcy” (ten sam dzień miesiąca, przycięty do końca miesiąca). */
export function addMonths(day, n) {
  const d = dateOfDay(day);
  const y = d.year + Math.floor((d.month - 1 + n) / 12);
  const m = ((d.month - 1 + n) % 12 + 12) % 12 + 1;
  const last = dateOfDay(dayNumberOf(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1) - 1).day;
  return dayNumberOf(y, m, Math.min(d.day, last));
}

/**
 * Buduje Drogę przez rok.
 *  events  – dziennik operacji (finanse.js)
 *  now     – chwila (ms)
 *  plans   – regularne wpłaty (podstawa prognoz)
 *  custom  – wydarzenia rodzica: [{ id, nazwa, day, ikona? }]
 *  ferie   – { start: day, end: day } albo null (ukryte)
 *  goals   – cele: [{ id, nazwa, kwota (µg), ikona }]
 */
export function buildRoad({ events, now, tz = DEFAULT_TZ, plans = [], custom = [], ferie = null, goals = [], months = ROAD_MONTHS }) {
  const today = dayOf(now, tz);
  const end = addMonths(today, months);
  const forecast = dailyForecast(events, now, end - today, { plans, tz });
  const at = (day) => forecast[Math.max(0, Math.min(forecast.length - 1, day - today))].total;
  const balanceNow = balanceAt(events, now, { tz });
  const nights = (day) => (day - today < NIGHTS_LIMIT && day >= today ? day - today : null);

  const waypoints = standardWaypoints(today + 1, end).map((w) => ({ ...w, kind: 'stale' }));
  if (ferie && ferie.start > today && ferie.start <= end) waypoints.push({ key: 'ferie', day: ferie.start, endDay: ferie.end, kind: 'ferie' });
  for (const c of custom) {
    if (c.day > today && c.day <= end) waypoints.push({ key: 'wlasne', id: c.id, nazwa: c.nazwa, ikona: c.ikona, day: c.day, kind: 'wlasne' });
  }
  waypoints.sort((a, b) => a.day - b.day);
  for (const w of waypoints) { w.amount = at(w.day); w.nights = nights(w.day); }

  const goalFlags = goals.map((g) => {
    const reachedNow = balanceNow >= g.kwota;
    const day = reachedNow ? today : reachDay(forecast, g.kwota);
    return {
      goal: g,
      reachedNow,
      day,
      beyond: day === null,             // dalej niż 14 miesięcy – koniec drogi, „za ponad rok”
      nights: day === null ? null : nights(day),
      missing: Math.max(0, g.kwota - balanceNow),
      progress: g.kwota > 0 ? Math.min(1, balanceNow / g.kwota) : 1,
    };
  });

  const traces = events
    .filter((e) => e.type === 'deposit' && e.ts <= now && !e.synthetic)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 6)
    .reverse()
    .map((e) => ({ id: e.id, day: dayOf(e.ts, tz), amount: e.amount, note: e.note || '' }));

  // odcinki pór roku (do tła drogi), od dziś do końca
  const seasons = [];
  for (let d = today; d <= end; d++) {
    const s = seasonOfDay(d);
    if (!seasons.length || seasons.at(-1).season !== s) seasons.push({ season: s, from: d, to: d });
    else seasons.at(-1).to = d;
  }

  return { today, end, balanceNow, waypoints, goals: goalFlags, traces, seasons, forecastAt: at };
}

// Nazwy wydarzeń w narzędniku („przed wakacjami”) – do zdań Księgowego.
const BEFORE = {
  mikolajki: 'Mikołajkami', wigilia: 'Wigilią', wielkanoc: 'Wielkanocą', dzienDziecka: 'Dniem Dziecka',
  koniecRoku: 'końcem roku szkolnego', wakacje: 'wakacjami', poczatekRoku: '1 września', ferie: 'feriami',
};

/**
 * Co mówi Groszak Księgowy o celu. Zwraca { key, params } do teksty.js.
 * Prognozę zawsze oznaczamy jako prognozę (dopisek w tekście).
 */
export function accountantLine(flag, road) {
  const nazwa = flag.goal.nazwa;
  if (flag.reachedNow) return { key: 'ksiegowy.juz', params: { nazwa } };
  if (flag.beyond) return { key: 'ksiegowy.ponadRok', params: { nazwa } };
  if (flag.nights !== null) return { key: 'ksiegowy.noce', params: { nazwa, noce: flag.nights } };
  const next = road.waypoints.find((w) => w.day >= flag.day);
  if (next && next.kind === 'wlasne') return { key: 'ksiegowy.przedWlasnym', params: { nazwa, wydarzenie: next.nazwa, dzien: flag.day } };
  if (next) return { key: 'ksiegowy.przed', params: { nazwa, wydarzenie: BEFORE[next.key] || next.key, dzien: flag.day } };
  return { key: 'ksiegowy.dnia', params: { nazwa, dzien: flag.day } };
}

// ------------------------------------------------------------------ panorama roku
// Pionowa panorama (assets/groszaki/droga-rok.json) to jeden zapętlony rok:
// pod dolną krawędzią znowu jest górna. Położenie w pionie mierzymy
// w wysokościach panoramy (1 = cały obrazek), poziomo – w ułamkach szerokości.

/** Początki miesięcy jako rosnący ciąg: u[1] (styczeń) … u[13] (następny styczeń = u[1] + 1). */
function monthStarts(months) {
  const u = [];
  u[1] = months[1];
  for (let m = 2; m <= 13; m++) {
    let v = months[m === 13 ? 1 : m];
    while (v <= u[m - 1]) v += 1;
    u[m] = v;
  }
  if (Math.abs(u[13] - u[1] - 1) > 1e-9) throw new Error('Początki miesięcy w droga-rok.json nie obiegają panoramy dokładnie raz');
  return u;
}

/** Położenie dnia na rozwiniętej panoramie (każdy rok to +1). */
export function yearPos(day, months) {
  const u = monthStarts(months);
  const d = dateOfDay(day);
  const first = dayNumberOf(d.year, d.month, 1);
  const next = d.month === 12 ? dayNumberOf(d.year + 1, 1, 1) : dayNumberOf(d.year, d.month + 1, 1);
  return (d.year - 2000) + u[d.month] + (day - first) / (next - first) * (u[d.month + 1] - u[d.month]);
}

/** Oś drogi (x jako ułamek szerokości) na wysokości y (dowolne y – panorama się powtarza). */
export function roadXAt(data, y) {
  const pts = data.srodek;
  const f = ((y % 1) + 1) % 1 / data.krok;
  const i = Math.floor(f);
  const a = pts[i % pts.length], b = pts[(i + 1) % pts.length];
  return a + (b - a) * (f - i);
}

// Pudełko celu (drogaWidok.js): wysokość / szerokość.
export const GOAL_RATIO = 1.0;

// Mapowanie drogowskazów na obiekty z arkusza (manifest.obiekty.droga).
// Wydarzenia bez obrazka (koniec roku szkolnego, wakacje) na razie pomijamy.
const DECOR = {
  mikolajki: 'mikolajki', wigilia: 'wigilia', ferie: 'ferie', wielkanoc: 'wielkanoc',
  dzienDziecka: 'dzienDziecka', poczatekRoku: 'poczatekRoku',
};
// Dekoracje większe niż pozostałe (mnożnik szerokości), np. bramka urodzinowa to cała scenka.
export const DECOR_SCALE = { urodziny: 1.9 };

export function decorOf(w) {
  if (w.kind === 'wlasne') return w.ikona === '🎂' ? 'urodziny' : 'inne';
  return DECOR[w.key] || null;
}

/**
 * Układa Drogę przez rok na panoramie.
 *  data   – droga-rok.json
 *  sizes  – { obiekt: [szerokość, wysokość] } w px obrazka (manifest)
 *  objW   – szerokość obiektu wydarzenia (ułamek szerokości drogi), goalW – znacznika celu
 * Zwraca y0/y1 (wycinek panoramy), y dziś i końca oraz obiekty z x, y (punkt na ziemi) i w, h.
 */
export function layoutRoad(road, data, { sizes = {}, objW = 0.15, goalW = 0.13, pre = 0.012 } = {}) {
  const aspect = data.h / data.w;
  const base = Math.floor(yearPos(road.today, data.miesiace));
  const yOf = (day) => yearPos(day, data.miesiace) - base;
  const yToday = yOf(road.today), yEnd = yOf(road.end);
  const half = data.szerokosc / 2;
  const items = [];
  for (const w of road.waypoints) {
    const decor = decorOf(w);
    if (!decor) continue;
    const [iw, ih] = sizes[decor] || [1, 1];
    const wFrac = objW * (DECOR_SCALE[decor] || 1);
    items.push({ type: 'wp', w, decor, y: yOf(w.day), wFrac, h: wFrac * ih / iw / aspect });
  }
  for (const g of road.goals) {
    if (g.beyond) continue;
    items.push({ type: 'goal', flag: g, y: yOf(g.day), wFrac: goalW, h: goalW * GOAL_RATIO / aspect });
  }
  items.sort((a, b) => a.y - b.y);

  // obiekt staje po stronie drogi z większą ilością miejsca (na całej swojej wysokości,
  // bo droga pod obrazkiem może skręcać); gdy tam jest zajęte – po drugiej
  const gap = 0.02;
  const last = { L: -1e9, R: -1e9 };
  const spot = (it, side) => {
    let lo = 1, hi = 0;
    for (let k = 0; k <= 8; k++) {
      const rx = roadXAt(data, it.y - it.h * k / 8);
      lo = Math.min(lo, rx); hi = Math.max(hi, rx);
    }
    const x = side === 'R' ? hi + half + gap + it.wFrac / 2 : lo - half - gap - it.wFrac / 2;
    const fits = side === 'R' ? x + it.wFrac / 2 <= 1 : x - it.wFrac / 2 >= 0;
    return { x: Math.min(1 - it.wFrac / 2, Math.max(it.wFrac / 2, x)), fits, room: side === 'R' ? 1 - hi : lo };
  };
  for (const it of items) {
    const R = spot(it, 'R'), Lf = spot(it, 'L');
    const pref = R.room >= Lf.room ? 'R' : 'L';
    const other = pref === 'R' ? 'L' : 'R';
    const free = (s) => it.y - it.h * 0.85 > last[s];
    const fitsOther = (other === 'R' ? R : Lf).fits;
    let side = pref;
    if (!free(pref) && free(other) && fitsOther) side = other;
    if (!free(side)) it.y = last[side] + it.h * 0.85;      // oba boki zajęte – trochę niżej
    last[side] = it.y;
    it.side = side;
    it.x = spot(it, side).x;
  }

  const beyond = road.goals.filter((g) => g.beyond);
  const tail = beyond.length ? goalW * GOAL_RATIO * 1.2 / aspect + 0.02 : 0.02;
  const y1 = Math.max(yEnd, ...items.map((i) => i.y)) + tail;
  beyond.forEach((g, i) => {
    const n = beyond.length;
    const x = Math.min(1 - goalW / 2, Math.max(goalW / 2, 0.5 + (i - (n - 1) / 2) * (goalW + 0.03)));
    items.push({ type: 'goal', flag: g, beyond: true, y: y1 - 0.012, x, wFrac: goalW, h: goalW * GOAL_RATIO / aspect });
  });
  // u góry tyle miejsca, żeby obiekty stojące przy „dziś” nie były ucięte
  const y0 = Math.min(yToday - pre, ...items.map((i) => i.y - i.h - 0.004));
  return { y0, y1, yToday, yEnd, aspect, items };
}

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

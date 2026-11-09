// Kalendarz Drogi przez rok: pory roku, Wielkanoc, daty szkolne.
// Czyste funkcje na numerach dni (patrz czas.js).

import { dayNumberOf, dateOfDay } from './czas.js';

/** Pora roku dla miesiąca 1–12: grudzień–luty zima, marzec–maj wiosna, czerwiec–sierpień lato, wrzesień–listopad jesień. */
export function seasonOfMonth(month) {
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'autumn';
}

export function seasonOfDay(n) {
  return seasonOfMonth(dateOfDay(n).month);
}

/** Niedziela Wielkanocna (kalendarz gregoriański, algorytm Meeusa/Jonesa/Butchera). */
export function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

/** Koniec roku szkolnego: najbliższy piątek po 20 czerwca. */
export function schoolYearEnd(year) {
  const d20 = dayNumberOf(year, 6, 20);
  const wd = dateOfDay(d20).weekday;           // 0 = niedziela, 5 = piątek
  const add = ((5 - wd + 7) % 7) || 7;
  return d20 + add;
}

/** Początek roku szkolnego: 1 września, a gdy wypada w piątek lub sobotę – najbliższy poniedziałek.
 *  (W niedzielę 1 września zajęcia zaczynają się w poniedziałek 2 września). */
export function schoolYearStart(year) {
  const d1 = dayNumberOf(year, 9, 1);
  const wd = dateOfDay(d1).weekday;
  if (wd === 5) return d1 + 3;
  if (wd === 6) return d1 + 2;
  if (wd === 0) return d1 + 1;
  return d1;
}

/**
 * Stałe drogowskazy w przedziale dni [fromDay, toDay].
 * Zwraca { key, day } – nazwy tłumaczy warstwa tekstów.
 */
export function standardWaypoints(fromDay, toDay) {
  const y0 = dateOfDay(fromDay).year;
  const y1 = dateOfDay(toDay).year;
  const out = [];
  for (let y = y0; y <= y1; y++) {
    const e = easter(y);
    out.push(
      { key: 'mikolajki', day: dayNumberOf(y, 12, 6) },
      { key: 'wigilia', day: dayNumberOf(y, 12, 24) },
      { key: 'wielkanoc', day: dayNumberOf(y, e.month, e.day) },
      { key: 'dzienDziecka', day: dayNumberOf(y, 6, 1) },
      { key: 'koniecRoku', day: schoolYearEnd(y) },
      { key: 'wakacje', day: schoolYearEnd(y) + 1 },
      { key: 'poczatekRoku', day: schoolYearStart(y) },
    );
  }
  return out.filter((w) => w.day >= fromDay && w.day <= toDay).sort((a, b) => a.day - b.day);
}

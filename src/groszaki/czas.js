// Dni kalendarzowe w strefie czasowej rodziny (domyślnie Europe/Warsaw).
// Dzień jest identyfikowany liczbą całkowitą: liczbą dni od 1970-01-01
// według lokalnej daty. Dzięki temu każde urządzenie liczy te same doby,
// także przy zmianie czasu (doba ma wtedy 23 albo 25 godzin).

export const DEFAULT_TZ = 'Europe/Warsaw';
const DAY_MS = 86400000;

const fmtCache = new Map();
function partsFormatter(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Lokalne składowe daty dla chwili `ts` (ms). */
export function localParts(ts, tz = DEFAULT_TZ) {
  const out = {};
  for (const p of partsFormatter(tz).formatToParts(new Date(ts))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return { year: out.year, month: out.month, day: out.day, hour: out.hour % 24, minute: out.minute, second: out.second };
}

/** Przesunięcie strefy w ms (czas lokalny − UTC) w chwili `ts`. */
function offsetAt(ts, tz) {
  const p = localParts(ts, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** Numer dnia dla lokalnej daty (rok, miesiąc 1–12, dzień). */
export function dayNumberOf(year, month, day) {
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

/** Lokalna data dla numeru dnia. */
export function dateOfDay(n) {
  const d = new Date(n * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), weekday: d.getUTCDay() };
}

/** Numer dnia, w którym wypada chwila `ts`. */
export function dayOf(ts, tz = DEFAULT_TZ) {
  const p = localParts(ts, tz);
  return dayNumberOf(p.year, p.month, p.day);
}

const startCache = new Map();
/** Chwila (ms) lokalnej północy rozpoczynającej dzień `n`. */
export function dayStart(n, tz = DEFAULT_TZ) {
  const key = tz + '|' + n;
  let v = startCache.get(key);
  if (v !== undefined) return v;
  const wall = n * DAY_MS;
  v = wall - offsetAt(wall, tz);
  v = wall - offsetAt(v, tz);            // druga iteracja na wypadek zmiany czasu
  if (startCache.size > 20000) startCache.clear();
  startCache.set(key, v);
  return v;
}

/** Ile nocy dzieli dzień chwili `fromTs` od dnia `toDay` (np. „jeszcze 9 nocy”). */
export function nightsUntil(fromTs, toDay, tz = DEFAULT_TZ) {
  return toDay - dayOf(fromTs, tz);
}

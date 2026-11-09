// Calendar helpers that work in a fixed time zone, so every device (and the
// server) agrees on which day a chest opens. No dependencies: Intl only.

export const DEFAULT_TZ = 'Europe/Warsaw';

const dtfCache = new Map();
function dtf(tz) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

/** Wall-clock parts of an instant in a time zone. month is 1–12. */
export function wallParts(ms, tz = DEFAULT_TZ) {
  const out = {};
  for (const p of dtf(tz).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  if (out.hour === 24) out.hour = 0;
  return { y: out.year, m: out.month, d: out.day, h: out.hour, mi: out.minute, s: out.second };
}

const floorDiv = (a, b) => Math.floor(a / b);
const msOfSecond = (ms) => ms - floorDiv(ms, 1000) * 1000;

/** Offset of the zone from UTC at an instant, in ms. */
function offsetAt(ms, tz) {
  const p = wallParts(ms, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return asUtc - (ms - msOfSecond(ms));
}

/** Instant for a wall-clock time in a zone. */
export function wallToInstant(y, m, d, h = 0, mi = 0, s = 0, msec = 0, tz = DEFAULT_TZ) {
  const guess = Date.UTC(y, m - 1, d, h, mi, s, msec);
  const off1 = offsetAt(guess, tz);
  let t = guess - off1;
  const off2 = offsetAt(t, tz);
  if (off2 !== off1) t = guess - off2;
  return t;
}

export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * Add calendar months, keeping the wall-clock time. A day that does not exist
 * in the target month is clamped to its last day (31 Jan + 1 month = 28/29 Feb),
 * the same rule PostgreSQL uses for `timestamp + interval 'n months'`.
 */
export function addMonths(ms, k, tz = DEFAULT_TZ) {
  const p = wallParts(ms, tz);
  let mIdx = p.m - 1 + k;
  const y = p.y + floorDiv(mIdx, 12);
  mIdx = ((mIdx % 12) + 12) % 12;
  const d = Math.min(p.d, daysInMonth(y, mIdx + 1));
  return wallToInstant(y, mIdx + 1, d, p.h, p.mi, p.s, msOfSecond(ms), tz);
}

/** Key of the local calendar day, e.g. "2027-01-15". */
export function dayKey(ms, tz = DEFAULT_TZ) {
  const p = wallParts(ms, tz);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** Start of the local day containing `ms`. */
export function startOfDay(ms, tz = DEFAULT_TZ) {
  const p = wallParts(ms, tz);
  return wallToInstant(p.y, p.m, p.d, 0, 0, 0, 0, tz);
}

/** Fractional day-of-year (0 = 1 Jan 00:00) in the zone; used by the season art. */
export function dayOfYear(ms, tz = DEFAULT_TZ) {
  const p = wallParts(ms, tz);
  const start = Date.UTC(p.y, 0, 1);
  const here = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return (here - start) / 86400000;
}

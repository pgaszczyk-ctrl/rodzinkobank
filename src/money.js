// Money is stored as whole microgrosze (µg): 1 zł = 100 gr, 1 gr = 10 000 µg.

export const MICRO_PER_GROSZ = 10_000;
export const MICRO_PER_ZL = 1_000_000;

export const zlToMicro = (zl) => Math.round(Number(zl) * 100) * MICRO_PER_GROSZ;
export const groszToMicro = (gr) => Math.round(gr) * MICRO_PER_GROSZ;
export const microToZl = (m) => m / MICRO_PER_ZL;

/** Whole grosze part of an amount (what can actually be paid out). */
export const floorToGrosz = (m) => Math.floor(m / MICRO_PER_GROSZ) * MICRO_PER_GROSZ;

/** Parse a user-typed amount ("12,5", "12.50") into µg rounded to whole grosze. */
export function parseZl(text) {
  if (text == null) return NaN;
  const s = String(text).trim().replace(/\s| /g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return NaN;
  const [i, f = ''] = s.split('.');
  return (Number(i) * 100 + Number((f + '00').slice(0, 2))) * MICRO_PER_GROSZ;
}

/** Split µg into display parts: whole złote, two grosz digits, four micro digits. */
export function splitMicro(m) {
  const neg = m < 0;
  const a = Math.abs(Math.trunc(m));
  const zl = Math.floor(a / MICRO_PER_ZL);
  const gr = Math.floor((a % MICRO_PER_ZL) / MICRO_PER_GROSZ);
  const micro = a % MICRO_PER_GROSZ;
  return { neg, zl, gr: String(gr).padStart(2, '0'), micro: String(micro).padStart(4, '0') };
}

// Ile Groszaków pokazać w miasteczku i gdzie pracują. Czyste funkcje.

import { zl } from './finanse.js';

export const MICRO_PER_GROSZAK = zl(10);
export const MAX_GROSZAKI = 80;

/**
 * 1 Groszak na każde 10 zł (co najmniej 1 przy saldzie > 0), najwyżej 80.
 * Powyżej tej liczby jeden Groszak oznacza większą kwotę.
 * Groszaki z części salda do progu pracują blisko, z części ponad próg – na farmie.
 */
export function groszakiCrew(balance, threshold) {
  if (!(balance > 0)) return { count: 0, near: 0, far: 0, perGroszak: 0 };
  const count = Math.min(MAX_GROSZAKI, Math.max(1, Math.floor(balance / MICRO_PER_GROSZAK)));
  const farPart = Math.max(0, balance - threshold);
  let far = farPart > 0 ? Math.round(count * farPart / balance) : 0;
  if (farPart > 0 && count >= 2) far = Math.min(count - 1, Math.max(1, far));
  if (count < 2) far = 0;
  return { count, near: count - far, far, perGroszak: Math.round(balance / count) };
}

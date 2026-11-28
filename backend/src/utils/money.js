/**
 * Money is stored and returned as a string with 2 decimals ("88500.00"), like before.
 * Math is done in whole tiyin (cents) so there are no floating-point errors.
 */
export const cents = (value) => Math.round(Number(value ?? 0) * 100);

export const fromCents = (c) => (c / 100).toFixed(2);

/** Sum of a money field over rows, as a money string. */
export const sumMoney = (rows, pick) => fromCents(rows.reduce((s, r) => s + cents(pick(r)), 0));

/** part / whole * 100 rounded to 2 decimals, or null when whole is 0. */
export const percent = (partCents, wholeCents) =>
  wholeCents > 0 ? ((partCents * 100) / wholeCents).toFixed(2) : null;

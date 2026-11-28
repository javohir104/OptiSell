/** Same list as backend/src/services/inventoryLedger.js: these units may be sold in fractions (0.75 kg). */
const FRACTIONAL = new Set(['kg', 'g', 'gr', 'l', 'ml', 'm', 'cm', 'кг', 'г', 'л', 'мл', 'м', 'litr', 'metr', 'gramm']);
export const allowsFraction = (unit) => FRACTIONAL.has(String(unit ?? '').trim().toLowerCase());

/** Suggested units for the product form. */
export const UNITS = ['pcs', 'kg', 'g', 'l', 'ml', 'm', 'box', 'pack'];

/** Keep only what a quantity field for this unit may contain (digits, plus one "." for kg/l/m). */
export function cleanQty(value, unit) {
  const v = String(value).replace(',', '.');
  if (!allowsFraction(unit)) return v.replace(/\D/g, '');
  const [int, ...rest] = v.replace(/[^\d.]/g, '').split('.');
  return rest.length ? `${int}.${rest.join('').slice(0, 3)}` : int;
}

/** Is `q` a valid positive quantity for this unit? */
export const validQty = (q, unit) => Number.isFinite(q) && q > 0 && (allowsFraction(unit) ? Math.round(q * 1000) === q * 1000 || Math.abs(Math.round(q * 1000) - q * 1000) < 1e-6 : Number.isInteger(q));

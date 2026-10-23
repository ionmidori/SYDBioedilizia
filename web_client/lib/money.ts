/**
 * Money: every amount in euro is rounded to the cent, half away from zero.
 *
 * The same rule as the backend (`backend_python/src/core/money.py`), pinned by
 * `contracts/money/golden_vectors.json` (checked by both test suites):
 *
 *   line     = round(qty × unit price)
 *   subtotal = sum of the lines
 *   VAT      = round(subtotal × VAT rate)
 *   total    = subtotal + VAT
 *
 * - A number means the decimal it prints as (`String(x)`, the same digits as
 *   Python's `repr`): 1.005 is 1.005, not the binary value just below it.
 * - Arithmetic is on integers (BigInt), so it is exact; the only rounding is
 *   the final one to the cent. Rounding the float product instead fails on
 *   real quotes: 301.25 × 101.46 is 30564.825 but 30564.824999999997 as a float.
 *
 * Amounts are `Cents` (integer cents) inside this module; `centsToNumber` gives
 * the number to show or send (JSON keeps amounts as numbers).
 */

/** An amount in integer cents. */
export type Cents = bigint;

/** value = coefficient × 10^exponent, exactly. */
interface Exact {
  coefficient: bigint;
  exponent: number;
}

// BigInt() calls, not literals: the TypeScript target is ES2017.
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const TEN = BigInt(10);
const CENT_PLACES = 2;

const NUMBER_TEXT = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/;

function exact(value: number): Exact {
  if (!Number.isFinite(value)) throw new RangeError(`Not a finite number: ${value}`);
  const match = NUMBER_TEXT.exec(String(value));
  if (!match) throw new RangeError(`Not a number: ${value}`);
  const [, sign, whole, fraction = '', exponent = '0'] = match;
  return { coefficient: BigInt(`${sign}${whole}${fraction}`), exponent: Number(exponent) - fraction.length };
}

function multiply(a: Exact, b: Exact): Exact {
  return { coefficient: a.coefficient * b.coefficient, exponent: a.exponent + b.exponent };
}

function fromCents(cents: Cents): Exact {
  return { coefficient: cents, exponent: -CENT_PLACES };
}

/** Half away from zero, to integer cents. */
function roundToCents(value: Exact): Cents {
  const shift = value.exponent + CENT_PLACES;
  if (shift >= 0) return value.coefficient * TEN ** BigInt(shift);
  const divisor = TEN ** BigInt(-shift);
  const magnitude = value.coefficient < ZERO ? -value.coefficient : value.coefficient;
  let cents = magnitude / divisor;
  if ((magnitude % divisor) * TWO >= divisor) cents += ONE;
  return value.coefficient < ZERO ? -cents : cents;
}

/** An amount rounded to the cent. Throws RangeError for NaN or ±Infinity. */
export function toCents(value: number): Cents {
  return roundToCents(exact(value));
}

export function lineTotal(qty: number, unitPrice: number): Cents {
  return roundToCents(multiply(exact(qty), exact(unitPrice)));
}

export function sumAmounts(amounts: readonly Cents[]): Cents {
  return amounts.reduce((total, amount) => total + amount, ZERO);
}

export function vatAmount(subtotal: Cents, vatRate: number): Cents {
  return roundToCents(multiply(fromCents(subtotal), exact(vatRate)));
}

export interface Totals {
  subtotal: Cents;
  vatAmount: Cents;
  grandTotal: Cents;
}

/** The canonical quote totals from its line totals. */
export function computeTotals(lineTotals: readonly Cents[], vatRate: number): Totals {
  const subtotal = sumAmounts(lineTotals);
  const vat = vatAmount(subtotal, vatRate);
  return { subtotal, vatAmount: vat, grandTotal: subtotal + vat };
}

/** The number for display and JSON: the closest float to the cents value. */
export function centsToNumber(cents: Cents): number {
  return Number(cents) / 100;
}

/** "11.13", "-0.50", "0.00": exactly two decimals (the golden vectors' form). */
export function formatCents(cents: Cents): string {
  const magnitude = cents < ZERO ? -cents : cents;
  const hundred = TEN * TEN;
  const fraction = (magnitude % hundred).toString().padStart(CENT_PLACES, '0');
  return `${cents < ZERO ? '-' : ''}${magnitude / hundred}.${fraction}`;
}

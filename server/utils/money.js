// Every amount in this file is a whole number of paise. Nothing here ever
// produces a fraction, which is the point: floating point cannot represent
// 0.1 exactly, and a rounding error on a total is the kind of bug that only
// shows up in the accounts weeks later.

export function lineTotal(unitPriceCents, quantity) {
  return unitPriceCents * quantity;
}

export function sumCents(values) {
  return values.reduce((total, value) => total + value, 0);
}

// The rate is held in basis points so it stays an integer too: 1800 is 18%.
// Half-up rounding at the end, once, rather than per line.
export function taxOn(subtotalCents, basisPoints) {
  return Math.round((subtotalCents * basisPoints) / 10_000);
}

// Rupees appear in exactly two places: a printed invoice and the browser.
// Everything in between stays in paise.
export function formatPaise(cents) {
  return `Rs ${(cents / 100).toFixed(2)}`;
}

export function orderTotals(lines, basisPoints) {
  const subtotalCents = sumCents(lines.map((line) => line.lineTotalCents));
  const taxCents = taxOn(subtotalCents, basisPoints);
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

const formatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
});

// The API only ever deals in whole paise. Rupees exist for the person reading
// the screen and are converted back at the edge of every form.
export function formatPaise(paise) {
  return formatter.format(paise / 100);
}

export function paiseToRupees(paise) {
  return (paise / 100).toFixed(2);
}

export function rupeesToPaise(rupees) {
  return Math.round(Number(rupees) * 100);
}

const compact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

// Chart axes have no room for full amounts, so they get the short form.
export function formatPaiseCompact(paise) {
  return compact.format(paise / 100);
}

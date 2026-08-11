// Mirrors REPORTING_TIME_ZONE in server/config/constants.js. Both halves have
// to agree on where a day starts, or a movement made late in the evening shows
// up on a different date in the ledger than it does on the dashboard.
export const DISPLAY_TIME_ZONE = 'Asia/Kolkata';

const dateTime = new Intl.DateTimeFormat('en-IN', {
  timeZone: DISPLAY_TIME_ZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
});

const dateOnly = new Intl.DateTimeFormat('en-IN', {
  timeZone: DISPLAY_TIME_ZONE,
  dateStyle: 'medium',
});

export function formatDateTime(value) {
  return dateTime.format(new Date(value));
}

export function formatDate(value) {
  return dateOnly.format(new Date(value));
}

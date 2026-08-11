import crypto from 'node:crypto';
import { REPORTING_TIME_ZONE } from '../config/constants.js';

// en-CA gives YYYY-MM-DD, and the zone matches the one reports bucket by, so an
// order placed at 11pm IST carries the date the shop would call it.
const day = new Intl.DateTimeFormat('en-CA', {
  timeZone: REPORTING_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// Not a per-organization counter. A counter has to be read and locked on every
// placement, which serialises the exact path this project works to keep
// parallel. The random suffix keeps placements independent, and the unique
// constraint on (organizationId, orderNumber) still enforces uniqueness.
export function generateOrderNumber(now = new Date()) {
  const date = day.format(now).replace(/-/g, '');
  const suffix = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `ORD-${date}-${suffix}`;
}

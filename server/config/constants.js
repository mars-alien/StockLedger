// Timestamps are stored as timestamptz, which is an instant rather than a wall
// clock reading. Reports have to pick a wall clock to group by, and for this
// business that is IST: a day runs from midnight in Kolkata, not midnight UTC,
// so the dashboard agrees with what the shop actually sold that day.
//
// Analytics queries bucket with AT TIME ZONE using this constant. A date is
// never built inside a SQL string, because that would silently use whatever
// timezone the database session happens to be in.
export const REPORTING_TIME_ZONE = 'Asia/Kolkata';

export const INVITATION_TTL_DAYS = 7;

// Two tabs of the same app refresh at the same moment with the same cookie.
// The second one arrives holding a token that was rotated a fraction of a
// second earlier, which looks exactly like a stolen token being replayed.
// Inside this window it is treated as the honest race it almost always is;
// outside it, reuse still revokes the whole family.
export const REFRESH_REUSE_GRACE_MS = 10_000;

// A key is only useful for as long as a client might still retry with it.
export const IDEMPOTENCY_KEY_TTL_HOURS = 24;

// GST at 18%, held in basis points so the rate itself is an integer and the tax
// calculation never leaves paise.
export const TAX_RATE_BASIS_POINTS = 1800;

// The concurrency demo always works against this one variant, seeded on demand
// by the reset endpoint.
export const DEMO_PRODUCT_SKU = 'DEMO-001';
export const DEMO_VARIANT_SKU = 'DEMO-001-1';
export const DEMO_CUSTOMER_NAME = 'Concurrency demo';

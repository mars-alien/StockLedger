import { REPORTING_TIME_ZONE } from '../config/constants.js';
import * as analyticsModel from '../models/analyticsModel.js';

const TOP_PRODUCT_LIMIT = 5;

const localDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: REPORTING_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export async function dashboard({ organizationId, days }) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const range = { organizationId, from, to };

  const [[totals], [units], trend, top] = await Promise.all([
    analyticsModel.summary(range),
    analyticsModel.unitsSold(range),
    analyticsModel.revenueByDay({ ...range, timeZone: REPORTING_TIME_ZONE }),
    analyticsModel.topProducts({ ...range, limit: TOP_PRODUCT_LIMIT }),
  ]);

  const orders = totals.orders;
  const revenueCents = Number(totals.revenue);

  return {
    range: { from, to, days },
    totals: {
      orders,
      revenueCents,
      subtotalCents: Number(totals.subtotal),
      taxCents: Number(totals.tax),
      paidOrders: totals.paid_orders,
      paidRevenueCents: Number(totals.paid_revenue),
      unitsSold: units.units,
      averageOrderCents: orders > 0 ? Math.round(revenueCents / orders) : 0,
    },
    trend: fillMissingDays(trend, from, to),
    topProducts: top.map((row) => ({
      productId: row.productId,
      name: row.name,
      units: row.units,
      revenueCents: Number(row.revenue),
    })),
  };
}

// A chart with holes in it reads as a dip in trade rather than a day with no
// orders, so every day in the range gets a point whether it sold anything or not.
function fillMissingDays(rows, from, to) {
  const byDay = new Map(
    rows.map((row) => [
      row.day.toISOString().slice(0, 10),
      { revenueCents: Number(row.revenue), orders: row.orders },
    ]),
  );

  const days = [];
  const cursor = new Date(`${localDay.format(from)}T00:00:00Z`);
  const last = localDay.format(to);

  while (days.length < 800) {
    const key = cursor.toISOString().slice(0, 10);
    const found = byDay.get(key);
    days.push({ day: key, revenueCents: found?.revenueCents ?? 0, orders: found?.orders ?? 0 });

    if (key === last) {
      break;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

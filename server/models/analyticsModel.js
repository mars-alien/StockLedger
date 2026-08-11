import { prisma } from '../config/db.js';

// Every query here buckets by the reporting zone with a single AT TIME ZONE.
// The columns are timestamptz, so that converts an instant straight into local
// wall-clock time. A date is never built inside the SQL string.

export function summary({ organizationId, from, to }, client = prisma) {
  return client.$queryRawUnsafe(
    `SELECT count(*)::int                                AS orders,
            coalesce(sum(o."totalCents"), 0)::bigint     AS revenue,
            coalesce(sum(o."subtotalCents"), 0)::bigint  AS subtotal,
            coalesce(sum(o."taxCents"), 0)::bigint       AS tax,
            count(*) FILTER (WHERE o."paymentStatus" = 'PAID')::int AS paid_orders,
            coalesce(sum(o."totalCents") FILTER (WHERE o."paymentStatus" = 'PAID'), 0)::bigint AS paid_revenue
       FROM "orders" o
      WHERE o."organizationId" = $1::uuid
        AND o."status" <> 'CANCELLED'
        AND o."createdAt" >= $2 AND o."createdAt" < $3`,
    organizationId,
    from,
    to,
  );
}

export function revenueByDay({ organizationId, from, to, timeZone }, client = prisma) {
  return client.$queryRawUnsafe(
    `SELECT (o."createdAt" AT TIME ZONE $4)::date       AS day,
            coalesce(sum(o."totalCents"), 0)::bigint    AS revenue,
            count(*)::int                               AS orders
       FROM "orders" o
      WHERE o."organizationId" = $1::uuid
        AND o."status" <> 'CANCELLED'
        AND o."createdAt" >= $2 AND o."createdAt" < $3
      GROUP BY 1
      ORDER BY 1`,
    organizationId,
    from,
    to,
    timeZone,
  );
}

export function topProducts({ organizationId, from, to, limit }, client = prisma) {
  return client.$queryRawUnsafe(
    `SELECT p.id                                       AS "productId",
            p.name                                     AS name,
            sum(ol.quantity)::int                      AS units,
            sum(ol."lineTotalCents")::bigint           AS revenue
       FROM "orderLines" ol
       JOIN "orders" o           ON o.id = ol."orderId"
       JOIN "productVariants" v  ON v.id = ol."variantId"
       JOIN "products" p         ON p.id = v."productId"
      WHERE ol."organizationId" = $1::uuid
        AND o."status" <> 'CANCELLED'
        AND o."createdAt" >= $2 AND o."createdAt" < $3
      GROUP BY p.id, p.name
      ORDER BY revenue DESC
      LIMIT $4`,
    organizationId,
    from,
    to,
    limit,
  );
}

export function unitsSold({ organizationId, from, to }, client = prisma) {
  return client.$queryRawUnsafe(
    `SELECT coalesce(sum(ol.quantity), 0)::int AS units
       FROM "orderLines" ol
       JOIN "orders" o ON o.id = ol."orderId"
      WHERE ol."organizationId" = $1::uuid
        AND o."status" <> 'CANCELLED'
        AND o."createdAt" >= $2 AND o."createdAt" < $3`,
    organizationId,
    from,
    to,
  );
}

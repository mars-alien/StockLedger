import { prisma } from '../config/db.js';

const detailInclude = {
  lines: {
    include: {
      variant: {
        select: {
          id: true,
          sku: true,
          name: true,
          product: { select: { id: true, name: true } },
        },
      },
    },
  },
  placedByUser: { select: { id: true, name: true } },
};

const listSelect = {
  id: true,
  orderNumber: true,
  customerName: true,
  status: true,
  paymentStatus: true,
  totalCents: true,
  createdAt: true,
  placedByUser: { select: { id: true, name: true } },
  _count: { select: { lines: true } },
};

export function create(data, client = prisma) {
  return client.order.create({ data });
}

// Bulk paths for the seeder, which writes months of history at once and would
// otherwise spend its time on round trips.
export function createMany(orders, client = prisma) {
  return client.order.createMany({ data: orders });
}

// Not scoped by organizationId: a Razorpay webhook arrives unauthenticated and
// the razorpay order id is the only thing identifying the row. It is generated
// by Razorpay and unguessable, and nothing is returned to the caller.
export function findByRazorpayOrderId(razorpayOrderId, client = prisma) {
  return client.order.findFirst({ where: { razorpayOrderId } });
}

export function createLines(lines, client = prisma) {
  return client.orderLine.createMany({ data: lines });
}

export function findById(id, organizationId, client = prisma) {
  return client.order.findFirst({ where: { id, organizationId }, include: detailInclude });
}

export function list(organizationId, { skip, take, ...filters }, client = prisma) {
  return client.order.findMany({
    where: buildWhere(organizationId, filters),
    select: listSelect,
    orderBy: { createdAt: 'desc' },
    skip,
    take,
  });
}

export function count(organizationId, filters, client = prisma) {
  return client.order.count({ where: buildWhere(organizationId, filters) });
}

export function update(id, organizationId, data, client = prisma) {
  return client.order.update({ where: { id, organizationId }, data });
}

function buildWhere(organizationId, { status, paymentStatus, search, from, to }) {
  const where = { organizationId };

  if (status) {
    where.status = status;
  }
  if (paymentStatus) {
    where.paymentStatus = paymentStatus;
  }
  if (search) {
    where.OR = [
      { orderNumber: { contains: search, mode: 'insensitive' } },
      { customerName: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (from || to) {
    where.createdAt = {};
    if (from) {
      where.createdAt.gte = from;
    }
    if (to) {
      where.createdAt.lte = to;
    }
  }
  return where;
}

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { disconnect } from './config/db.js';
import { env } from './config/env.js';
import { TAX_RATE_BASIS_POINTS } from './config/constants.js';
import * as userModel from './models/userModel.js';
import * as membershipModel from './models/membershipModel.js';
import * as organizationModel from './models/organizationModel.js';
import * as orderModel from './models/orderModel.js';
import * as variantModel from './models/variantModel.js';
import * as stockMovementModel from './models/stockMovementModel.js';
import * as categoryService from './services/categoryService.js';
import * as productService from './services/productService.js';
import * as organizationService from './services/organizationService.js';
import { logger } from './utils/logger.js';
import { lineTotal, orderTotals } from './utils/money.js';
import { generateOrderNumber } from './utils/orderNumber.js';

const SEED_PASSWORD = 'password123';
const DEMO_SLUG = 'north-street-traders';
const HISTORY_DAYS = 275;

const CATALOG = [
  { category: 'Footwear', products: ['Runner', 'Trail Shoe', 'Loafer', 'Sandal', 'Hiking Boot'] },
  { category: 'Apparel', products: ['T Shirt', 'Hoodie', 'Chinos', 'Denim Jacket', 'Polo'] },
  { category: 'Electronics', products: ['Earbuds', 'Power Bank', 'Keyboard', 'Webcam', 'Mouse'] },
  { category: 'Home', products: ['Table Lamp', 'Cushion', 'Storage Box', 'Wall Clock', 'Rug'] },
  { category: 'Stationery', products: ['Notebook', 'Gel Pen', 'Sticky Notes', 'Folder', 'Marker'] },
  {
    category: 'Sports',
    products: ['Yoga Mat', 'Water Bottle', 'Skipping Rope', 'Dumbbell', 'Grip'],
  },
  {
    category: 'Beauty',
    products: ['Face Wash', 'Lip Balm', 'Shampoo', 'Body Lotion', 'Sunscreen'],
  },
  {
    category: 'Grocery',
    products: ['Filter Coffee', 'Green Tea', 'Almonds', 'Honey', 'Olive Oil'],
  },
];

const SIZES = ['Small', 'Medium', 'Large'];
const COLOURS = ['Black', 'Blue', 'Grey'];
const CUSTOMERS = [
  'Ananya Krishnan',
  'Rohit Verma',
  'Fatima Sheikh',
  'Karthik Reddy',
  'Neha Bansal',
  'Joseph Thomas',
  'Divya Nambiar',
  'Sameer Kulkarni',
  'Walk-in customer',
];

// A fixed seed keeps prices, volumes and stock levels the same on every run, so
// a screenshot taken today still matches the database tomorrow.
let seed = 20260811;
function random() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}

function pick(values) {
  return values[Math.floor(random() * values.length)];
}

function between(min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

async function createOwner({ name, email, organizationName }) {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
  const user = await userModel.create({ name, email, passwordHash });
  const { organization } = await organizationService.create({
    userId: user.id,
    name: organizationName,
  });
  return { user, organizationId: organization.id };
}

async function addMember({ name, email, organizationId, role }) {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
  const user = await userModel.create({ name, email, passwordHash });
  await membershipModel.create({ userId: user.id, organizationId, role });
  return user;
}

async function buildCatalog({ organizationId, actorUserId, productsWanted }) {
  const categories = new Map();
  for (const group of CATALOG) {
    const category = await categoryService.create({
      organizationId,
      actorUserId,
      name: group.category,
    });
    categories.set(group.category, category.id);
  }

  const variants = [];
  let made = 0;

  for (let round = 1; made < productsWanted; round += 1) {
    for (const group of CATALOG) {
      for (const base of group.products) {
        if (made >= productsWanted) {
          break;
        }
        made += 1;

        const sku = `${group.category.slice(0, 3).toUpperCase()}-${String(made).padStart(3, '0')}`;
        const product = await productService.create({
          organizationId,
          actorUserId,
          sku,
          name: `${base} ${round > 1 ? `Mk ${round}` : ''}`.trim(),
          description: `${base} from the ${group.category.toLowerCase()} range.`,
          categoryId: categories.get(group.category),
        });

        const costCents = between(15000, 240000);
        const priceCents = Math.round(costCents * (1.3 + random() * 0.7));

        for (let index = 0; index < between(1, 3); index += 1) {
          const variant = await productService.addVariant({
            organizationId,
            actorUserId,
            productId: product.id,
            sku: `${sku}-${index + 1}`,
            name: `${pick(SIZES)} / ${pick(COLOURS)}`,
            attributes: { size: pick(SIZES), colour: pick(COLOURS) },
            priceCents,
            costCents,
          });
          variants.push({ id: variant.id, priceCents: variant.priceCents });
        }
      }
    }
  }

  return variants;
}

function startOfHistory(days) {
  const start = new Date();
  start.setUTCHours(4, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - days);
  return start;
}

// Busier at weekends and drifting gently upwards, so the revenue chart looks
// like trade rather than noise.
function ordersForDay(date, dayIndex, totalDays) {
  const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
  const growth = 1 + (dayIndex / totalDays) * 0.6;
  const base = weekend ? between(4, 8) : between(1, 5);
  return Math.max(0, Math.round(base * growth));
}

/**
 * Writes the history in one pass, chronologically, keeping a running balance per
 * variant in memory. Every sale and cancellation gets the balanceAfter it would
 * have had on the day, so the seeded ledger obeys the same rules the API does.
 */
function buildHistory({ organizationId, variants, staffIds, days }) {
  const balances = new Map();
  const movements = [];
  const orders = [];
  const orderLines = [];

  const start = startOfHistory(days);
  const opening = new Date(start.getTime() - 24 * 60 * 60 * 1000);

  for (const variant of variants) {
    const quantity = between(150, 400);
    balances.set(variant.id, quantity);
    movements.push({
      organizationId,
      variantId: variant.id,
      delta: quantity,
      reason: 'RECEIPT',
      note: 'Opening stock',
      balanceAfter: quantity,
      createdByUserId: staffIds[0],
      createdAt: opening,
    });
  }

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const day = new Date(start.getTime() + dayIndex * 24 * 60 * 60 * 1000);

    // Sorted, and nudged apart by a second each, so the day's orders are written
    // in the order they happened. Generating them out of sequence would leave a
    // balanceAfter that cannot be reconstructed by reading the ledger forwards.
    const minutes = Array.from({ length: ordersForDay(day, dayIndex, days) }, () =>
      between(0, 11 * 60),
    ).sort((a, b) => a - b);

    for (const [n, minute] of minutes.entries()) {
      const createdAt = new Date(day.getTime() + minute * 60 * 1000 + n * 1000);
      const placedByUserId = pick(staffIds);
      const chosen = chooseLines(variants, balances);

      if (chosen.length === 0) {
        continue;
      }

      const orderId = crypto.randomUUID();
      const lines = chosen.map((entry) => ({
        id: crypto.randomUUID(),
        organizationId,
        orderId,
        variantId: entry.variant.id,
        quantity: entry.quantity,
        unitPriceCents: entry.variant.priceCents,
        lineTotalCents: lineTotal(entry.variant.priceCents, entry.quantity),
      }));

      // Most orders are paid, a few are still owing, and a handful get cancelled.
      const roll = random();
      const cancelled = roll < 0.04;
      const paid = !cancelled && roll < 0.88;

      orders.push({
        id: orderId,
        organizationId,
        orderNumber: generateOrderNumber(createdAt),
        customerName: pick(CUSTOMERS),
        customerPhone: random() < 0.5 ? `9${between(100000000, 999999999)}` : null,
        status: cancelled ? 'CANCELLED' : 'PLACED',
        paymentStatus: paid ? 'PAID' : 'UNPAID',
        placedByUserId,
        createdAt,
        ...orderTotals(lines, TAX_RATE_BASIS_POINTS),
      });
      orderLines.push(...lines);

      for (const line of lines) {
        const balanceAfter = balances.get(line.variantId) - line.quantity;
        balances.set(line.variantId, balanceAfter);
        movements.push({
          organizationId,
          variantId: line.variantId,
          delta: -line.quantity,
          reason: 'SALE',
          balanceAfter,
          orderId,
          createdByUserId: placedByUserId,
          createdAt,
        });
      }

      if (cancelled) {
        // Half a second later: after its own sale, and still before the next
        // order, which is at least a whole second away.
        const cancelledAt = new Date(createdAt.getTime() + 500);
        for (const line of lines) {
          const balanceAfter = balances.get(line.variantId) + line.quantity;
          balances.set(line.variantId, balanceAfter);
          movements.push({
            organizationId,
            variantId: line.variantId,
            delta: line.quantity,
            reason: 'CANCELLATION',
            note: 'Customer changed their mind',
            balanceAfter,
            orderId,
            createdByUserId: placedByUserId,
            createdAt: cancelledAt,
          });
        }
      }
    }
  }

  return { orders, orderLines, movements, balances };
}

function chooseLines(variants, balances) {
  const chosen = [];
  const seen = new Set();

  for (let n = 0; n < between(1, 3); n += 1) {
    const variant = pick(variants);
    if (seen.has(variant.id)) {
      continue;
    }

    const quantity = between(1, 4);
    if (balances.get(variant.id) < quantity) {
      continue;
    }

    seen.add(variant.id);
    chosen.push({ variant, quantity });
  }

  return chosen;
}

async function writeHistory({ organizationId, variants, staffIds, days }) {
  const { orders, orderLines, movements, balances } = buildHistory({
    organizationId,
    variants,
    staffIds,
    days,
  });

  await orderModel.createMany(orders);
  for (const chunk of chunks(orderLines, 500)) {
    await orderModel.createLines(chunk);
  }
  for (const chunk of chunks(movements, 500)) {
    await stockMovementModel.recordMany(chunk);
  }

  // The movements are the record; quantityOnHand is brought in line with them.
  for (const [variantId, quantityOnHand] of balances) {
    await variantModel.setQuantityOnHand(variantId, organizationId, quantityOnHand);
  }

  return { orders: orders.length, movements: movements.length };
}

function* chunks(values, size) {
  for (let index = 0; index < values.length; index += size) {
    yield values.slice(index, index + size);
  }
}

async function seedDatabase() {
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database');
  }
  if (await organizationModel.findBySlug(DEMO_SLUG)) {
    throw new Error('Database already has seed data. Reset it before seeding again.');
  }

  const demo = await createOwner({
    name: 'Asha Rao',
    email: 'asha@stockledger.test',
    organizationName: 'North Street Traders',
  });

  const demoStaff = [demo.user];
  for (const member of [
    { name: 'Imran Qureshi', email: 'imran@stockledger.test', role: 'MANAGER' },
    { name: 'Priya Menon', email: 'priya@stockledger.test', role: 'MANAGER' },
    { name: 'Rahul Das', email: 'rahul@stockledger.test', role: 'STAFF' },
    { name: 'Sneha Iyer', email: 'sneha@stockledger.test', role: 'STAFF' },
  ]) {
    demoStaff.push(await addMember({ ...member, organizationId: demo.organizationId }));
  }

  const rival = await createOwner({
    name: 'Vikram Nair',
    email: 'vikram@stockledger.test',
    organizationName: 'Harbour Supplies',
  });
  const rivalStaff = [rival.user];
  for (const member of [
    { name: 'Meera Pillai', email: 'meera@stockledger.test', role: 'MANAGER' },
    { name: 'Arjun Shetty', email: 'arjun@stockledger.test', role: 'STAFF' },
  ]) {
    rivalStaff.push(await addMember({ ...member, organizationId: rival.organizationId }));
  }

  logger.info('building the demo catalog');
  const demoVariants = await buildCatalog({
    organizationId: demo.organizationId,
    actorUserId: demo.user.id,
    productsWanted: 100,
  });

  logger.info({ days: HISTORY_DAYS }, 'writing trading history');
  const demoHistory = await writeHistory({
    organizationId: demo.organizationId,
    variants: demoVariants,
    staffIds: demoStaff.map((user) => user.id),
    days: HISTORY_DAYS,
  });

  // The second organization only has to be big enough to prove that nothing
  // leaks between tenants.
  logger.info('seeding the second organization');
  const rivalVariants = await buildCatalog({
    organizationId: rival.organizationId,
    actorUserId: rival.user.id,
    productsWanted: 10,
  });
  const rivalHistory = await writeHistory({
    organizationId: rival.organizationId,
    variants: rivalVariants,
    staffIds: rivalStaff.map((user) => user.id),
    days: 30,
  });

  logger.info(
    {
      organizations: 2,
      users: demoStaff.length + rivalStaff.length,
      variants: demoVariants.length + rivalVariants.length,
      orders: demoHistory.orders + rivalHistory.orders,
      movements: demoHistory.movements + rivalHistory.movements,
      signIn: `asha@stockledger.test / ${SEED_PASSWORD}`,
    },
    'seed complete',
  );
}

seedDatabase()
  .catch((error) => {
    logger.error({ err: error }, 'seed failed');
    process.exitCode = 1;
  })
  .finally(disconnect);

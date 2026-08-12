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
const DEMO_SLUG = 'sharma-general-store';

// Sized from the environment so the same seeder fills a laptop or a free tier
// database. The defaults are deliberately small: enough to look like a real
// shop, little enough to sit inside Supabase's free row and storage limits.
const PRODUCT_COUNT = Number(process.env.SEED_PRODUCTS ?? 24);
const HISTORY_DAYS = Number(process.env.SEED_HISTORY_DAYS ?? 90);
const RIVAL_PRODUCT_COUNT = Number(process.env.SEED_RIVAL_PRODUCTS ?? 6);

const CATALOG = [
  {
    category: 'Grocery',
    units: ['500 g', '1 kg', '5 kg'],
    products: ['Basmati Rice', 'Toor Dal', 'Chakki Atta', 'Mustard Oil', 'Jaggery'],
  },
  {
    category: 'Beverages',
    units: ['100 g', '250 g', '500 g'],
    products: ['Masala Chai', 'Filter Coffee', 'Green Tea', 'Badam Mix'],
  },
  {
    category: 'Snacks',
    units: ['150 g', '400 g'],
    products: ['Bikaneri Bhujia', 'Banana Chips', 'Murukku', 'Soan Papdi'],
  },
  {
    category: 'Personal Care',
    units: ['100 ml', '200 ml'],
    products: ['Neem Soap', 'Coconut Hair Oil', 'Ayurvedic Toothpaste'],
  },
  {
    category: 'Home',
    units: ['Small', 'Large'],
    products: ['Brass Diya', 'Steel Tiffin', 'Cotton Bedsheet'],
  },
  {
    category: 'Apparel',
    units: ['S', 'M', 'L', 'XL'],
    products: ['Cotton Kurta', 'Nehru Jacket', 'Dupatta'],
  },
  {
    category: 'Footwear',
    units: ['UK 7', 'UK 8', 'UK 9'],
    products: ['Kolhapuri Chappal', 'Juti', 'Canvas Shoe'],
  },
  {
    category: 'Stationery',
    units: ['Pack of 1', 'Pack of 5'],
    products: ['Ruled Notebook', 'Gel Pen', 'Geometry Box'],
  },
];

const CUSTOMERS = [
  'Ananya Krishnan',
  'Rohit Verma',
  'Fatima Sheikh',
  'Karthik Reddy',
  'Neha Bansal',
  'Sandeep Yadav',
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
          name: round > 1 ? `${base} (Premium)` : base,
          description: `${base} from the ${group.category.toLowerCase()} range.`,
          categoryId: categories.get(group.category),
        });

        // Rupees a general store would actually charge: the base pack lands
        // between roughly 30 and 350, and bigger packs scale up from there.
        const costCents = between(2000, 24000);
        const priceCents = Math.round(costCents * (1.25 + random() * 0.5));

        // Variants are the pack sizes that category actually sells in, so a
        // 5 kg bag of rice costs more than a 500 g one rather than the same.
        const units = group.units.slice(0, between(1, Math.min(3, group.units.length)));

        for (const [index, unit] of units.entries()) {
          const multiplier = 1 + index * 0.8;
          const variant = await productService.addVariant({
            organizationId,
            actorUserId,
            productId: product.id,
            sku: `${sku}-${index + 1}`,
            name: unit,
            attributes: { pack: unit },
            priceCents: Math.round(priceCents * multiplier),
            costCents: Math.round(costCents * multiplier),
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
  const base = weekend ? between(2, 5) : between(1, 3);
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
    const quantity = between(40, 150);
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
    name: 'Abhay Singh',
    email: 'abhaysingh@gmail.com',
    organizationName: 'Sharma General Store',
  });

  const demoStaff = [demo.user];
  for (const member of [
    { name: 'Priya Sharma', email: 'priyasharma@gmail.com', role: 'MANAGER' },
    { name: 'Rohit Verma', email: 'rohitverma@gmail.com', role: 'MANAGER' },
    { name: 'Neha Gupta', email: 'nehagupta@gmail.com', role: 'STAFF' },
    { name: 'Karan Mehta', email: 'karanmehta@gmail.com', role: 'STAFF' },
  ]) {
    demoStaff.push(await addMember({ ...member, organizationId: demo.organizationId }));
  }

  const rival = await createOwner({
    name: 'Vikram Nair',
    email: 'vikramnair@gmail.com',
    organizationName: 'Nair Traders',
  });
  const rivalStaff = [rival.user];
  for (const member of [
    { name: 'Meera Pillai', email: 'meerapillai@gmail.com', role: 'MANAGER' },
    { name: 'Arjun Shetty', email: 'arjunshetty@gmail.com', role: 'STAFF' },
  ]) {
    rivalStaff.push(await addMember({ ...member, organizationId: rival.organizationId }));
  }

  logger.info({ products: PRODUCT_COUNT }, 'building the catalogue');
  const demoVariants = await buildCatalog({
    organizationId: demo.organizationId,
    actorUserId: demo.user.id,
    productsWanted: PRODUCT_COUNT,
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
    productsWanted: RIVAL_PRODUCT_COUNT,
  });
  const rivalHistory = await writeHistory({
    organizationId: rival.organizationId,
    variants: rivalVariants,
    staffIds: rivalStaff.map((user) => user.id),
    days: Math.min(HISTORY_DAYS, 21),
  });

  logger.info(
    {
      organizations: 2,
      users: demoStaff.length + rivalStaff.length,
      products: PRODUCT_COUNT + RIVAL_PRODUCT_COUNT,
      variants: demoVariants.length + rivalVariants.length,
      orders: demoHistory.orders + rivalHistory.orders,
      movements: demoHistory.movements + rivalHistory.movements,
      signIn: `abhaysingh@gmail.com / ${SEED_PASSWORD}`,
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

import { withTransaction } from '../config/db.js';
import {
  DEMO_CUSTOMER_NAME,
  DEMO_PRODUCT_SKU,
  DEMO_VARIANT_SKU,
  TAX_RATE_BASIS_POINTS,
} from '../config/constants.js';
import * as productModel from '../models/productModel.js';
import * as variantModel from '../models/variantModel.js';
import * as orderModel from '../models/orderModel.js';
import * as stockMovementModel from '../models/stockMovementModel.js';
import { AppError } from '../utils/AppError.js';
import { lineTotal, orderTotals } from '../utils/money.js';
import { generateOrderNumber } from '../utils/orderNumber.js';

const DEMO_PRICE_CENTS = 99900;
const UNSAFE_READ_WRITE_GAP_MS = 25;

export async function getState({ organizationId }) {
  const variant = await variantModel.findBySku(DEMO_VARIANT_SKU, organizationId);

  if (!variant) {
    return { ready: false, variant: null };
  }
  return { ready: true, variant: toPublic(variant) };
}

// Brings the demo variant back to exactly one unit, creating it the first time.
// The correction goes through the ledger like any other, because the ledger is
// append-only and a demo is not an excuse to edit history.
export async function reset({ organizationId, actorUserId }) {
  const variant = await ensureDemoVariant({ organizationId });

  await withTransaction(async (tx) => {
    const [locked] = await variantModel.lockVariantsForUpdate([variant.id], organizationId, tx);
    const delta = 1 - locked.quantityOnHand;

    if (delta === 0) {
      return;
    }

    await variantModel.applyStockDelta(variant.id, organizationId, delta, tx);
    await stockMovementModel.record(
      {
        organizationId,
        variantId: variant.id,
        delta,
        reason: 'ADJUSTMENT',
        note: 'Concurrency demo reset',
        balanceAfter: 1,
        createdByUserId: actorUserId,
      },
      tx,
    );
  });

  return getState({ organizationId });
}

/**
 * The wrong way round, on purpose.
 *
 * The quantity is read outside any lock, checked, and only then written. Fifty
 * requests arriving together all read the same 1, all decide they are entitled
 * to it, and all decrement — which is how stock ends up negative. placeOrder
 * avoids this by taking the row lock before it reads.
 */
export async function placeUnsafeOrder({ organizationId, actorUserId }) {
  const variant = await variantModel.findBySku(DEMO_VARIANT_SKU, organizationId);
  if (!variant) {
    throw new AppError('DEMO_NOT_READY', 409, 'Reset the demo before running it');
  }

  const seen = variant.quantityOnHand;
  if (seen < 1) {
    throw new AppError('OUT_OF_STOCK', 409, 'Insufficient stock for 1 item', [
      { variantId: variant.id, requested: 1, available: seen },
    ]);
  }

  // Widens the gap between reading and writing so the race shows up every time
  // rather than only on an unlucky run.
  await new Promise((resolve) => setTimeout(resolve, UNSAFE_READ_WRITE_GAP_MS));

  return withTransaction(async (tx) => {
    const lines = [
      {
        variantId: variant.id,
        quantity: 1,
        unitPriceCents: variant.priceCents,
        lineTotalCents: lineTotal(variant.priceCents, 1),
      },
    ];

    const order = await orderModel.create(
      {
        organizationId,
        orderNumber: generateOrderNumber(),
        customerName: DEMO_CUSTOMER_NAME,
        placedByUserId: actorUserId,
        ...orderTotals(lines, TAX_RATE_BASIS_POINTS),
      },
      tx,
    );

    await orderModel.createLines(
      lines.map((line) => ({ ...line, organizationId, orderId: order.id })),
      tx,
    );
    await variantModel.applyStockDelta(variant.id, organizationId, -1, tx);
    await stockMovementModel.record(
      {
        organizationId,
        variantId: variant.id,
        delta: -1,
        reason: 'SALE',
        note: 'Unsafe demo order',
        // Computed from the stale read, which is exactly the lie this endpoint
        // exists to expose.
        balanceAfter: seen - 1,
        orderId: order.id,
        createdByUserId: actorUserId,
      },
      tx,
    );

    return { id: order.id, orderNumber: order.orderNumber };
  });
}

async function ensureDemoVariant({ organizationId }) {
  const existing = await variantModel.findBySku(DEMO_VARIANT_SKU, organizationId);
  if (existing) {
    return existing;
  }

  const product =
    (await productModel.findBySku(DEMO_PRODUCT_SKU, organizationId)) ??
    (await productModel.create({
      organizationId,
      sku: DEMO_PRODUCT_SKU,
      name: 'Concurrency demo item',
      description: 'Seeded by the concurrency demo. One unit, fifty buyers.',
      categoryId: null,
    }));

  return variantModel.create({
    organizationId,
    productId: product.id,
    sku: DEMO_VARIANT_SKU,
    name: 'The last one',
    priceCents: DEMO_PRICE_CENTS,
    costCents: DEMO_PRICE_CENTS,
  });
}

function toPublic(variant) {
  return {
    id: variant.id,
    sku: variant.sku,
    name: variant.name,
    priceCents: variant.priceCents,
    quantityOnHand: variant.quantityOnHand,
  };
}

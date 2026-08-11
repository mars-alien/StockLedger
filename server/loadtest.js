import crypto from 'node:crypto';
import autocannon from 'autocannon';
import { disconnect } from './config/db.js';
import { logger } from './utils/logger.js';

// This writes real orders, thousands of them, into whichever database the
// server is pointed at. Run it against one you are willing to reseed. The rows
// are identifiable by customerName and the LOADTEST product.
const BASE_URL = process.env.LOAD_TEST_URL ?? 'http://localhost:5000';
const CONNECTIONS = Number(process.env.LOAD_TEST_CONNECTIONS ?? 50);
const DURATION = Number(process.env.LOAD_TEST_DURATION ?? 20);
const CREDENTIALS = { email: 'asha@stockledger.test', password: 'password123' };

async function callApi(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`${method} ${path} answered ${response.status}`);
  }
  return response.json();
}

/**
 * Placing an order needs stock, and a run that exhausts it stops measuring the
 * write path and starts measuring how fast the server can say no. One variant
 * is topped up well past what the run can consume.
 */
const SPREAD_VARIANTS = 40;

async function prepare(token) {
  const existing = await callApi(`/inventory/variants?search=LOADTEST&limit=${SPREAD_VARIANTS}`, {
    token,
  });
  const variants = existing.data;

  if (variants.length < SPREAD_VARIANTS) {
    const product =
      (await callApi('/products?search=LOADTEST&limit=1', { token })).data[0] ??
      (await callApi('/products', {
        token,
        method: 'POST',
        body: { sku: 'LOADTEST-001', name: 'Load test item' },
      }));

    for (let index = variants.length; index < SPREAD_VARIANTS; index += 1) {
      variants.push(
        await callApi(`/products/${product.id}/variants`, {
          token,
          method: 'POST',
          body: {
            sku: `LOADTEST-001-${index + 1}`,
            name: `Variant ${index + 1}`,
            priceCents: 10_000,
            costCents: 5_000,
          },
        }),
      );
    }
  }

  // Enough that the run never starts measuring how fast the server says no.
  const headroom = CONNECTIONS * DURATION * 200;
  for (const variant of variants) {
    if (variant.quantityOnHand < headroom) {
      await callApi('/inventory/receive', {
        token,
        method: 'POST',
        body: { variantId: variant.id, quantity: headroom, note: 'Load test headroom' },
      });
    }
  }

  return variants;
}

function run({ title, token, variantIds }) {
  const placing = Boolean(variantIds?.length);
  const orderFor = (variantId) =>
    JSON.stringify({ customerName: 'Load test', lines: [{ variantId, quantity: 1 }] });

  return autocannon({
    title,
    url: BASE_URL,
    connections: CONNECTIONS,
    duration: DURATION,
    requests: [
      placing
        ? { method: 'POST', path: '/api/orders', body: orderFor(variantIds[0]) }
        : { method: 'GET', path: '/api/products?limit=20' },
    ],
    // Every placement needs its own idempotency key, or the second request on a
    // connection would be answered as a replay of the first and the run would
    // measure the cache rather than the work. When more than one variant is
    // supplied the body rotates too, which is what separates lock contention
    // from the cost of placing an order.
    setupClient(client) {
      const next = () => {
        if (placing) {
          const variantId = variantIds[Math.floor(Math.random() * variantIds.length)];
          client.setBody(orderFor(variantId));
        }
        client.setHeaders({
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
          ...(placing ? { 'Idempotency-Key': crypto.randomUUID() } : {}),
        });
      };

      next();
      client.on('response', next);
    },
  });
}

function report(result) {
  return {
    scenario: result.title,
    requests: result.requests.total,
    throughputPerSecond: Number(result.requests.average.toFixed(1)),
    latencyMs: {
      p50: result.latency.p50,
      p95: result.latency.p97_5,
      p99: result.latency.p99,
      max: result.latency.max,
    },
    non2xx: result.non2xx,
    errors: result.errors + result.timeouts,
  };
}

async function main() {
  const session = await callApi('/auth/login', { method: 'POST', body: CREDENTIALS });
  const token = session.accessToken;

  const variants = await prepare(token);
  const ids = variants.map((variant) => variant.id);
  logger.info(
    { connections: CONNECTIONS, duration: DURATION, url: BASE_URL },
    'starting load test',
  );

  const reads = await run({ title: 'GET /api/products', token });
  logger.info(report(reads), 'read scenario complete');

  // One variant: every request queues behind the same row lock. This is the
  // worst case the system has, not the normal one.
  const contended = await run({
    title: 'POST /api/orders (one variant, full contention)',
    token,
    variantIds: [ids[0]],
  });
  logger.info(report(contended), 'contended write scenario complete');

  // Spread across variants, which is what a shop selling a catalogue looks
  // like. The gap between the two is the cost of the lock rather than the cost
  // of placing an order.
  const spread = await run({
    title: `POST /api/orders (${ids.length} variants)`,
    token,
    variantIds: ids,
  });
  logger.info(report(spread), 'spread write scenario complete');

  const results = [report(reads), report(contended), report(spread)];
  process.stdout.write(`\n${JSON.stringify(results, null, 2)}\n`);
}

main()
  .catch((error) => {
    logger.error({ err: error }, 'load test failed');
    process.exitCode = 1;
  })
  .finally(disconnect);

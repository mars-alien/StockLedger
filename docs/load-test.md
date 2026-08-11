# Load test

## Setup

Run against localhost with a local PostgreSQL, not against a deployment. On
free hosting you measure cold starts and a shared CPU rather than the code, and
the numbers come out worse than the application deserves while telling you
nothing about it.

|            |                                                               |
| ---------- | ------------------------------------------------------------- |
| CPU        | 12th Gen Intel Core i5-12500H, 12 physical / 16 logical cores |
| Memory     | 16 GB                                                         |
| OS         | Windows 11                                                    |
| Node       | v24.13.0                                                      |
| PostgreSQL | 18.3, local, default configuration                            |
| Tool       | autocannon 8, 50 connections, 20 seconds per scenario         |
| Data       | seeded catalogue, 226 variants, ~1,500 orders of history      |

Reproduce with:

```
RATE_LIMIT_ENABLED=false npm --prefix server start
npm --prefix server run loadtest
```

Rate limiting is off for the run. Every request comes from one address, so with
it on the benchmark measures the limiter and nothing else — the first run of
this test returned 173,000 requests per second and a 100% non-2xx rate, which is
what that mistake looks like.

**The run writes real orders.** Twenty seconds at these rates produced about
15,000 of them, against roughly 1,500 of seeded history, which is enough to
swamp the dashboard. Run it against a database you are willing to reseed, and
reseed afterwards. The rows it creates are identifiable by `customerName = 'Load
test'` and the `LOADTEST-001` product.

## Results

| Scenario                        | Requests | Throughput |    p50 |    p95 |      p99 |      Max | Errors |
| ------------------------------- | -------: | ---------: | -----: | -----: | -------: | -------: | -----: |
| `GET /api/products`             |   22,758 |   1,138 /s |  41 ms |  58 ms |    65 ms |   371 ms |      0 |
| `POST /api/orders`, one variant |    2,110 |     106 /s | 447 ms | 889 ms | 2,027 ms | 2,159 ms |      0 |
| `POST /api/orders`, 40 variants |    8,187 |     409 /s | 114 ms | 207 ms |   254 ms |   435 ms |      0 |

No failed requests and no non-2xx responses in any scenario. Every order was
placed with its own idempotency key, so none of the writes were served as a
replay.

## What the two write scenarios mean

They run identical code. The only difference is whether the fifty connections
are all buying the same variant or spreading across forty of them.

With one variant, every transaction queues on the same `SELECT … FOR UPDATE`.
Placements serialise completely: the database is doing one at a time, and the
other forty-nine connections are waiting. **106 orders per second is therefore
the floor** — the throughput of this system when every customer in the country
wants the same item at the same instant.

Spread across forty variants, the same code does **409 orders per second, and
p50 drops from 447 ms to 114 ms**. Nothing about the query changed. The gap is
lock contention and nothing else, which is the useful result: the write path is
not slow, it is _serialised on purpose_, and it only serialises against orders
touching the same stock.

A real shop looks like the second row. The first row is worth measuring anyway,
because it is the number that holds when a single product goes viral, and it is
the case correctness actually depends on.

## Why not make it faster

The obvious optimisation is to drop the row lock and let the decrement be
atomic — `UPDATE … SET quantityOnHand = quantityOnHand - $1 WHERE id = $2 AND
quantityOnHand >= $1`, which needs no explicit lock and would be considerably
quicker.

It was not chosen because an order is not one decrement. It is several
decrements, a ledger row per line with a running balance, an order, its lines,
and an audit row, all of which have to agree or roll back together. The lock is
what lets every line be checked against a stable quantity before any of them is
written, and what makes `balanceAfter` mean something when read back later.
`/demo/concurrency` shows the version without it: fifty requests, fifty sales,
and stock at −49.

Buying throughput at the price of a ledger that does not add up is not a trade
this project is willing to make.

## Reading the numbers honestly

- This is a single Node process against a local database over loopback. There is
  no network, no TLS termination, and no cold start.
- The deployed demo runs on shared-CPU free hosting and will be slower. That is
  a property of the hosting, not of the code, which is why the measurement is
  taken here.
- Prisma sizes its connection pool at `cpus * 2 + 1`. On the 16-thread machine
  above that is 33 connections, comfortably more than the 50 test connections
  need given how much of their time is spent waiting on a lock. On a one-core
  host the pool is 3, and the contended scenario would be far worse — append
  `&connection_limit=10` to `DATABASE_URL` there.

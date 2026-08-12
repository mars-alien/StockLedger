# Optimization pass

Every change in this document carries a measurement taken before it and after it.
A change with no number attached did not get made.

Stage 1 is measurement only. No application code changed while producing it.

## Method

| | |
| --- | --- |
| Machine | Intel Core i5-12500H, 12 physical / 16 logical cores, 15.7 GB RAM |
| OS | Windows 11 Home Single Language |
| Node | v24.13.0 |
| PostgreSQL | 18.3, local, same machine as the API |
| Dataset | Seeded demo: 6 users, 2 organizations, 30 products, 56 variants, 346 orders, 663 order lines, 734 stock movements |
| API | `NODE_ENV=development`, `RATE_LIMIT_ENABLED=false`, single process, port 5000 |
| Client | Same machine, so network latency is excluded and these are server-side figures |

`VACUUM (ANALYZE)` was run before measuring. The local database still carried dead
tuples from an earlier load test that wrote and then deleted 14,874 orders, and
stale statistics would have produced plans that no production database would choose.

SQL statement counts were taken by setting `log_min_duration_statement = 0` on the
database, issuing one isolated request per endpoint, and counting what Postgres
logged during the window. Both that setting and `log_statement` were reset afterwards;
`pg_db_role_setting` is empty again. Session bookkeeping (`BEGIN`, `COMMIT`, `SET`,
`DEALLOCATE`) is excluded from the counts.

Percentiles are over 30 requests after 5 warmup requests, connection kept alive.

## Baseline

### Database: the five heaviest queries

`EXPLAIN (ANALYZE, BUFFERS)` with literal parameters, so these are the plans
Postgres chooses for real values rather than for a generic prepared statement.

| Query | Planning | Execution | Buffers | Seq scans | Reading |
| --- | ---: | ---: | ---: | ---: | --- |
| Analytics: revenue by day, 180d | 2.621 ms | 0.970 ms | 13 | 1 | Seq scan on `orders`, 265 rows kept of 346 |
| Analytics: top products, 180d | 7.056 ms | 0.687 ms | 36 | 4 | Four-table hash join, 508 rows aggregated to 24 |
| Products: search + category filter | 0.251 ms | 0.103 ms | 6 | 2 | `ILIKE` on 30 rows |
| Orders: status + date filter | 0.255 ms | 0.531 ms | 30 | 2 | Seq scan on `orderLines` for the line count |
| Ledger: movements for one variant | 0.151 ms | 0.101 ms | 34 | 1 | Sorted, 20 of 734 returned |

Every sequential scan above is the correct plan, not a missing index. The whole
`orders` table is 13 shared buffers and `products` is 6. Postgres reads a table of
that size in one pass more cheaply than it can descend an index and then fetch
heap pages, and it is choosing accordingly. An index added here would be ignored
by the planner, and would still cost write time on every insert.

Two of the five spend more time planning than executing. Top products plans for
7.056 ms and runs in 0.687 ms, a ratio of about ten to one. At this data volume
the cost of these queries is not the data.

### API latency

p50 and p95 over 30 requests each. Flag threshold is 200 ms.

| Endpoint | p50 | p95 | Flagged |
| --- | ---: | ---: | --- |
| `GET /health` | 1.2 ms | 2.4 ms | no |
| `GET /auth/me` | 4.3 ms | 6.9 ms | no |
| `GET /organizations` | 3.4 ms | 5.1 ms | no |
| `GET /organizations/current` | 2.9 ms | 4.7 ms | no |
| `GET /categories` | 2.7 ms | 4.6 ms | no |
| `GET /products?limit=20` | 3.8 ms | 5.7 ms | no |
| `GET /products?search=` | 3.8 ms | 5.3 ms | no |
| `GET /products/:id` | 3.4 ms | 5.8 ms | no |
| `GET /orders?limit=20` | 4.2 ms | 6.9 ms | no |
| `GET /orders?status=&paymentStatus=` | 4.1 ms | 6.7 ms | no |
| `GET /orders/:id` | 5.0 ms | 7.6 ms | no |
| `GET /inventory/movements?limit=20` | 4.7 ms | 7.4 ms | no |
| `GET /inventory/movements?variantId=` | 4.1 ms | 6.1 ms | no |
| `GET /inventory/variants?limit=20` | 3.5 ms | 5.7 ms | no |
| `GET /members` | 3.2 ms | 6.0 ms | no |
| `GET /analytics/dashboard?days=30` | 4.4 ms | 8.2 ms | no |
| `GET /analytics/dashboard?days=180` | 8.6 ms | 17.4 ms | no |

Nothing is flagged. The slowest endpoint in the application is the six-month
dashboard at 17.4 ms p95, which is 11.5 times under the threshold.

### Payload sizes

Uncompressed, at `limit=20`. Flag threshold is 50 kB.

| Endpoint | Size | Flagged |
| --- | ---: | --- |
| `GET /inventory/movements` | 7.7 kB | no |
| `GET /orders` | 6.3 kB | no |
| `GET /products` | 5.0 kB | no |
| `GET /inventory/variants` | 4.5 kB | no |
| `GET /analytics/dashboard?days=180` | 9.9 kB | no |
| `GET /categories` | 1.4 kB | no |
| `GET /members` | 1.1 kB | no |

Nothing is flagged. The largest response in the application is 9.9 kB, five times
under the threshold. No list endpoint returns detail-shaped rows; the row-fetch
statements select explicit column lists rather than `SELECT *`.

### Bundle

`vite build`, production mode.

| Chunk | Raw | Gzip | Pulled in by |
| --- | ---: | ---: | --- |
| `index-*.js` | 480.09 kB | 146.29 kB | Initial load, every route |
| `DashboardPage-*.js` | 391.63 kB | 114.13 kB | `/` only, lazy |
| `ConcurrencyDemoPage-*.js` | 5.56 kB | 2.38 kB | `/demo/concurrency` only, lazy |
| `index-*.css` | 23.56 kB | 5.21 kB | Initial load |
| `index.html` | 0.40 kB | 0.27 kB | Initial load |

Route-level code splitting is already in place for the two heavy routes.
Recharts is confined to the dashboard chunk and does not reach the initial load.
The initial JavaScript payload is 480.09 kB raw, 146.29 kB gzipped.

### SQL statements per request

Flag threshold is more than five, which is the N+1 signature.

| Endpoint | Statements | Flagged |
| --- | ---: | --- |
| `GET /health` | 0 | no |
| `GET /organizations` | 2 | no |
| `GET /organizations/current` | 2 | no |
| `GET /categories` | 2 | no |
| `GET /auth/me` | 3 | no |
| `GET /products` | 3 | no |
| `GET /products/:id` | 3 | no |
| `GET /orders` | 3 | no |
| `GET /inventory/variants` | 3 | no |
| `GET /members` | 3 | no |
| `GET /analytics/dashboard` | 4 | no |
| `GET /orders/:id` | 5 | no |
| `GET /inventory/movements` | 5 | no |

Nothing is flagged. No N+1 exists. Relations are loaded with one batched statement
each, of the form `WHERE "id" IN ($1,$2,$3,$4,$5)`, so the count is fixed by the
number of relations requested and does not grow with the number of rows returned.
The health endpoint issues no query at all.

### Index usage and scan mix

Cumulative counters since the last statistics reset. They include the seeding run
and the earlier load test, so they describe how this database has been used in
total rather than one request.

| Table | Rows | Seq scans | Index scans |
| --- | ---: | ---: | ---: |
| `products` | 30 | 156,779 | 21,688 |
| `organizations` | 6 | 96,248 | 1,230 |
| `users` | 12 | 73,121 | 896 |
| `categories` | 16 | 71,826 | 476 |
| `productVariants` | 56 | 48,314 | 136,804 |
| `orderLines` | 663 | 485 | 62,740 |
| `orders` | 346 | 455 | 59,775 |
| `stockMovements` | 734 | 390 | 20,093 |

Indexes with no recorded scan:

| Table | Index | Size |
| --- | --- | ---: |
| `auditLogs` | `auditLogs_pkey` | 608 kB |
| `categories` | `categories_organizationId_idx` | 16 kB |
| `idempotencyKeys` | `idempotencyKeys_organizationId_key_key` | 1968 kB |
| `invitations` | `invitations_pkey` | 16 kB |
| `invitations` | `invitations_tokenHash_key` | 16 kB |
| `memberships` | `memberships_userId_idx` | 16 kB |
| `orderLines` | `orderLines_pkey` | 680 kB |
| `products` | `products_categoryId_idx` | 16 kB |
| `stockMovements` | `stockMovements_pkey` | 1168 kB |

A zero scan count here does not by itself justify dropping an index. Four of these
are primary keys or unique constraints that exist to enforce correctness, not to
serve reads. `idempotencyKeys_organizationId_key_key` is the constraint the entire
idempotency design depends on: the insert that claims a key relies on it raising
`P2002`, and it is off limits under ground rule 3. The sizes shown for the larger
entries are inflated by the same load-test bloat described above and are not the
size these indexes would have on a fresh database.

## Findings

1. **Nothing measured exceeds any threshold in the brief.** No endpoint is over
   200 ms, no payload is over 50 kB, no request issues more than five statements.
   The slowest thing in the application is a 17.4 ms p95.
2. **There is no N+1 to fix.** This was the brief's expected largest single win.
   Prisma is batching relation loads into one statement each.
3. **Aggregation is already in SQL.** `analyticsModel.js` uses `SUM`, `COUNT`,
   `GROUP BY` and `FILTER` server-side. No analytics path pulls rows into Node to
   total them.
4. **Sequential scans are correct at this volume** and adding indexes to remove
   them would make writes slower and reads no faster.
5. **Planning time exceeds execution time on the two analytics queries.** Top
   products plans in 7.056 ms and executes in 0.687 ms. If anything in the database
   layer is worth attention, it is this, not the data access.
6. **One structural issue worth recording.** The `_count` relation on list
   endpoints generates a subquery that aggregates the entire table before joining:

   ```sql
   LEFT JOIN (SELECT "orderId", COUNT(*) FROM "orderLines" WHERE 1=1 GROUP BY "orderId")
   ```

   The organization filter is not pushed into the subquery, so this counts lines
   for every tenant and then discards all but one. At 663 rows it costs 0.531 ms
   and does not matter. It is the one query in the application whose cost grows
   with total data rather than with the requesting tenant's data.

7. **Two assumptions in the brief do not hold for this codebase.** `staleTime` is
   already 30 seconds rather than the default 0, and route-level code splitting is
   already applied to the dashboard and the demo. The brief also refers to Neon's
   pooled endpoint; this project deployed on Supabase, whose transaction pooler
   needs `?pgbouncer=true` rather than Neon's arrangement.

## Stage 2 onwards

Ground rule 6 says to skip anything the measurement says is already fine. On these
numbers that covers most of Stage 2: there is no N+1 to fix, no aggregation to push
into SQL, no over-selecting list query, and no measured sequential scan that an index
would improve.

What the measurement does justify looking at, in order:

- The `_count` subquery in finding 6, which is the only query whose cost is tied to
  global rather than per-tenant volume.
- The connection pool size, which is currently inherited rather than stated.
- Transaction scope, which the brief asks to be audited and which has not been
  measured yet.

Whether any of that is worth changing is a Stage 2 question and is not answered here.

## Stage 2: database

One change was made. Six were considered and skipped, each because a measurement
said there was nothing to fix.

| What was slow | What was measured | What changed | What it measures now |
| --- | --- | --- | --- |
| Connection pool was inherited, not stated | 25 connections held, p95 swinging 384-686 ms across runs | `connection_limit=10` in the connection string | 10 connections, 280-301 req/s, p95 391 ms on both runs |

### The one change: connection pool

Prisma sizes its pool at `physical cores * 2 + 1`. On this laptop that is 25. On a
shared-CPU host it is closer to 3. The same code therefore opens a different number
of connections depending on where it runs, which is the argument for stating it.

Fifty concurrent readers against `GET /analytics/dashboard?days=180`, eight seconds,
two rounds:

| Pool | Round 1 | Round 2 | p95 round 1 | p95 round 2 | Connections held |
| --- | ---: | ---: | ---: | ---: | ---: |
| Inherited (25) | 256 req/s | 290 req/s | 686 ms | 384 ms | 25 |
| 5 | 250 req/s | 250 req/s | 588 ms | 545 ms | 5 |
| 10 | 301 req/s | 280 req/s | 391 ms | 391 ms | 10 |

Ten matches or beats the inherited default on throughput while holding 60 percent
fewer connections, and its tail latency was identical across both rounds where the
default varied by 302 ms. Five is reproducibly worse: 250 req/s in both rounds, a
14 percent loss against ten. Ten also leaves headroom inside the connection budget
of a shared pooler, which matters on Supabase where the transaction pooler is a
shared resource rather than a private one.

Set in `.env.example` for local development and in the commented Supabase line.
It is not set in any deployed environment yet; that is a change to make in Render's
environment variables and in the local `server/.env`.

### Skipped, with the measurement that justified skipping

| Stage 2 item | Measurement | Verdict |
| --- | --- | --- |
| Fix any N+1 | Every endpoint issues 2-5 statements; relations load as one batched `IN (...)` per relation | Nothing to fix |
| Composite index column order | All four composite indexes lead with `organizationId`, the equality column, followed by `createdAt` or `status` | Already correct |
| Add indexes for sequential scans | All five plans read 6-36 shared buffers; the planner is right to scan | Would slow writes, not speed reads |
| Push aggregation into SQL | `analyticsModel.js` uses `SUM`, `COUNT`, `GROUP BY`, `FILTER` server-side | Already done |
| Select only what is used | Row-fetch statements carry explicit column lists, no `SELECT *`, no detail columns in list rows | Already done |
| Drop unused indexes | Nine show zero scans; four are primary keys or unique constraints enforcing correctness | Not droppable |

On the unused indexes specifically: `idempotencyKeys_organizationId_key_key` is the
constraint the idempotency design depends on, since claiming a key relies on it
raising `P2002`. Ground rule 3 puts it out of scope. `invitations_tokenHash_key`
serves a lookup that only runs when somebody accepts an invitation, which no
measurement in this pass exercised. A zero here means not yet used, not useless.

### Transaction scope audit

Sixteen call sites open a transaction. The two that hold `FOR UPDATE` row locks are
`placeOrder` and `cancelOrder`, and those are the ones that matter.

`placeOrder`, measured by reading the `BEGIN`..`COMMIT` window out of the Postgres log:

| | |
| --- | --- |
| Statements between `BEGIN` and `COMMIT` | 15 |
| Non-SQL operations inside the transaction | 0 |
| Server-side statement time inside the transaction | 10.9 ms |
| End-to-end `POST /orders`, p50 / p95 | 24.5 ms / 31.4 ms |

The end-to-end figure bounds the lock hold from above: the transaction cannot be
open longer than the request that contains it. No network call, file write or PDF
generation appears between `BEGIN` and `COMMIT` anywhere:

- Cloudinary upload runs at `productService.js:115`, before the transaction opens at 117.
- Razorpay calls run before `paymentService.js:184`, which opens a transaction that
  only writes the order row and an audit row.
- Invoice PDF generation lives in `utils/invoicePdf.js` and is not inside any transaction.

### The `_count` subquery, measured

Stage 1 finding 6 identified the one query whose cost is tied to global rather than
per-tenant volume. Measured directly, twelve runs each, median of twelve:

| Form | Median execution | Buffers |
| --- | ---: | ---: |
| Current, `WHERE 1=1` | 0.401 ms | 33 |
| Tenant filter pushed into the subquery | 0.388 ms | 30 |

A 3 percent difference and three buffers, which is inside run-to-run noise at 691
rows. Ground rule 6 says skip it, so it is skipped. It is recorded here rather than
fixed because the gap widens with total rows across all tenants rather than with the
rows one tenant asks for, so this is the first query to revisit if the database grows.

### Database measurements, before and after

| Query | Planning before | Planning after | Execution before | Execution after |
| --- | ---: | ---: | ---: | ---: |
| Analytics: revenue by day, 180d | 2.621 ms | 3.503 ms | 0.970 ms | 1.064 ms |
| Analytics: top products, 180d | 7.056 ms | 8.081 ms | 0.687 ms | 0.725 ms |
| Products: search + category | 0.251 ms | 0.265 ms | 0.103 ms | 0.101 ms |
| Orders: status + date | 0.255 ms | 0.251 ms | 0.531 ms | 0.510 ms |
| Ledger: one variant | 0.151 ms | 0.130 ms | 0.101 ms | 0.105 ms |

Unchanged, which is the expected result. Pool size does not affect the plan or the
execution of a single query; it affects how many of them can run at once. The two
analytics queries measure slightly higher because the dataset is now larger, not
because anything regressed.

### Measurement hygiene

Two things happened during Stage 2 that affect how these numbers should be read.

The first pool sweep was invalid and its numbers are discarded. It used `pkill`,
which does not exist in this shell, so no server was ever stopped and every setting
measured the same unchanged process on port 5000. The apparent noise was one server
measured six times. The sweep was redone with `taskkill`, and each run now reports
the connection count it actually held, which is how the 25 / 5 / 10 figures above are
confirmed rather than assumed.

The probes placed and cancelled fourteen orders against the local database. It now
holds 360 orders where the baseline had 346, 691 order lines where it had 663, and
790 stock movements where it had 734, about four percent more data. The cancelled
orders are excluded from every analytics query by the `status <> 'CANCELLED'` filter,
so the analytics numbers are comparable; the order list numbers are measured over
slightly more rows than the baseline was.

`log_min_duration_statement` was enabled twice to capture statement counts and the
transaction window, and reset both times. `pg_db_role_setting` is empty.

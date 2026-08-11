# StockLedger

Multi-tenant inventory and order management for small retailers, built so that
overselling is impossible.

<!-- Record a 15 second walkthrough and save it as docs/screenshots/demo.gif -->

![StockLedger](docs/screenshots/demo.gif)

## Live demo

<!-- Add the deployed URL here once it is live -->

| Sign in as | Email                    | Password      |
| ---------- | ------------------------ | ------------- |
| Owner      | `asha@stockledger.test`  | `password123` |
| Manager    | `imran@stockledger.test` | `password123` |
| Staff      | `rahul@stockledger.test` | `password123` |

The demo data is nine months of trading: 100 products, 226 variants and around
1,500 orders. Sign in as the owner and open **Concurrency demo** to see the part
of the system that is otherwise invisible.

## What it does

Retailers sign up, create an organization and invite their team. Managers build
a catalogue of products and variants, receive stock and correct it. Staff take
orders across the counter. Every change to stock is written to an append-only
ledger with a running balance, so any number on screen can be traced to the
movement that produced it.

- Register, sign in, refresh token rotation with reuse detection
- Owner, manager and staff roles
- Organizations, with copyable invite links
- Strict tenant isolation — one organization can never read another's data
- Categories, products and variants with search, filters and pagination
- Product image upload to Cloudinary
- Append-only stock ledger, receive stock, adjustments that require a reason
- Order placement with row locking, so stock can never go negative
- Idempotent order creation via `Idempotency-Key`
- Cancellation that returns stock through the ledger
- Razorpay test payments and PDF invoices
- Analytics dashboard over nine months of data
- A concurrency demo page that shows what happens without the lock

## The interesting part

Two people buying the last unit at the same moment is the problem this project
is actually about.

`placeOrder` sorts the variant ids, takes `SELECT … FOR UPDATE` on those rows,
checks every line against the locked quantities, and writes the order, its
lines, a ledger movement per line and an audit row in one transaction. If any
line is short the whole thing rolls back.

`/demo/concurrency` fires fifty simultaneous orders at a product with one unit
in stock and shows the result both ways:

|                   | Created | Refused | Final stock |
| ----------------- | ------: | ------: | ----------: |
| With the row lock |       1 |      49 |           0 |
| Without it        |      50 |       0 |     **−49** |

Same fifty requests, same code path except for the lock.

## Architecture

```
route → middleware → controller → service → model → PostgreSQL
```

A controller reads validated input, calls one service and sends the result. A
service holds the business logic, owns transactions, and never touches `req` or
`res` — which is why the seeder and the tests call the same functions the HTTP
layer does. A model is the only place Prisma appears, and every method takes an
`organizationId` and filters by it.

ESLint enforces the layering rather than trusting anyone to remember it: Prisma
may only be imported inside `models/`, controllers may not import models, and
services may not import Express.

## Stack

|          |                                                                           |
| -------- | ------------------------------------------------------------------------- |
| Server   | Node, Express 5, Prisma, PostgreSQL, Zod, Pino                            |
| Auth     | jsonwebtoken, bcryptjs, httpOnly refresh cookie                           |
| Client   | React, Vite, TanStack Query, Zustand, React Hook Form, Tailwind, Recharts |
| Services | Cloudinary, Razorpay test mode, pdfkit                                    |
| Testing  | Vitest, Supertest, autocannon                                             |

PostgreSQL is the only datastore. No Redis, no queue, no second database. The
UI components are hand-written rather than pulled from a component library.

## Running it

```bash
git clone <repo> && cd stockledger
npm run setup
cp .env.example server/.env    # fill in DATABASE_URL and JWT_ACCESS_SECRET
npm --prefix server run db:migrate && npm --prefix server run seed
npm run dev
```

The app is on http://localhost:5173 and the API on http://localhost:5000. Vite
proxies `/api`, so both sit on one origin in development just as they do in
production.

Cloudinary and Razorpay keys are optional. Without them those two endpoints
answer `503` and everything else works.

## Environment

Copy `.env.example` to `server/.env`, and again to `server/.env.test` with a
database name ending in `_test`. `config/env.js` validates everything with Zod
and refuses to start if anything is missing or malformed.

| Variable                          | Required | Notes                                                    |
| --------------------------------- | :------: | -------------------------------------------------------- |
| `DATABASE_URL`                    |   yes    | On Supabase this is the pooler; see `DIRECT_URL`.        |
| `DIRECT_URL`                      |          | Direct connection for migrations. Same as above locally. |
| `JWT_ACCESS_SECRET`               |   yes    | At least 32 characters.                                  |
| `ACCESS_TOKEN_TTL`                |          | Default `15m`.                                           |
| `REFRESH_TOKEN_TTL_DAYS`          |          | Default `7`.                                             |
| `CORS_ORIGINS`                    |   yes    | Comma separated. `*` is rejected.                        |
| `APP_URL`                         |   yes    | Where invitation links point.                            |
| `CLOUDINARY_*`                    |          | Empty disables image upload.                             |
| `RAZORPAY_KEY_ID` / `_KEY_SECRET` |          | Empty disables payments.                                 |
| `RAZORPAY_WEBHOOK_SECRET`         |          | The secret you set on the webhook, not the API secret.   |
| `LOG_LEVEL`                       |          | Default `info`.                                          |
| `TRUST_PROXY`                     |          | `true` behind Render or Fly.                             |
| `DEMO_ENDPOINTS_ENABLED`          |          | `true` exposes the deliberately unsafe demo endpoint.    |
| `RATE_LIMIT_ENABLED`              |          | Only ever `false` for a load test.                       |

## Testing

```bash
npm test
```

124 tests against a real PostgreSQL, not mocks. Migrations are applied to the
test database automatically, and it refuses to run against a database whose name
does not end in `_test`.

The ones worth reading:

- **Tenant isolation** — every list and every get-by-id, from the wrong organization
- **Overselling** — fifty parallel orders against one unit give exactly one success
- **Idempotency** — replay, key reuse, and expiry
- **Token rotation** — reuse revokes the family, two tabs do not

## Documentation

- [Architecture](docs/architecture.md) — layering, locking, isolation levels, idempotency
- [Database](docs/database.md) — schema, index rationale, what is deliberately not indexed
- [API](docs/api.md) — every endpoint, plus the [Postman collection](docs/stockledger.postman_collection.json)
- [Load test](docs/load-test.md) — measured numbers and what they mean

## Notable decisions

**Money is stored as integers.** Paise in an `Int` column. Binary floating point
cannot represent 0.1 exactly and the error compounds across order lines. Tax is
a rate in basis points so the rate is an integer too.

**Stock leaves at placement, not at payment.** Staff enter orders for a customer
standing at the counter, so the goods have physically gone. Reserve-then-confirm
exists to stop anonymous strangers holding inventory hostage on a public
checkout, which is not this product.

**`READ COMMITTED` is enough.** The correctness argument rests on the explicit
`FOR UPDATE` lock, not on the isolation level. `SERIALIZABLE` would also be
correct but pays for it with retry storms under exactly the contention this
system is built to handle.

**The unique constraint is the distributed lock.** `POST /api/orders` inserts
the idempotency key row before doing any work. A duplicate fails instantly with
`P2002`, and that failure is the detection. The database already provides atomic
uniqueness, so no second system is needed to provide it again.

**Refresh tokens rotate, and reuse kills the family.** Presenting an already
rotated token revokes every token descended from that sign-in. A ten second
grace window distinguishes two browser tabs racing from an actual replay.

**Fulfilment and payment are separate fields.** `status` is `PLACED` or
`CANCELLED`; `paymentStatus` is the only field that speaks for money. Two
columns that can each claim an order is paid will eventually disagree.

**One origin in production.** Express serves the built React bundle beside the
API. That keeps the refresh cookie at `SameSite=Strict`, which a separate
frontend host would break, and removes CORS from the deployment entirely.

## Security

- helmet, with a content security policy that names Razorpay and Cloudinary explicitly
- CORS from an allowlist; `*` fails validation at boot
- Rate limiting globally and harder on sign-in
- Zod validation on every body, query, param and the idempotency header
- bcrypt at cost 12; only hashes of refresh tokens and invite tokens are stored
- Razorpay webhook signatures verified against the raw request bytes, compared in constant time
- No stack traces in production responses; a request id is always returned
- Uploads limited to 2 MB and to JPEG, PNG or WebP
- `npm audit --audit-level=high` is clean

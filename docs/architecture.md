# Architecture

## Layers

```
route → middleware → controller → service → model → PostgreSQL
```

A route declares a path and attaches middleware. A controller reads validated
input off the request, calls one service method and sends the result. A service
holds the business logic and owns transactions, and never touches `req` or
`res`, which is why `seeder.js` and the test suite can call the same functions
the HTTP layer does. A model is the only place Prisma appears, every method
takes an `organizationId`, and every method accepts an optional transaction
client so a service can compose several of them into one transaction.

ESLint enforces the boundaries rather than trusting anyone to remember them:
`@prisma/client` may only be imported from `models/` and `config/db.js`,
controllers may not import models, and services may not import Express.

`config/db.js` exports `withTransaction` so a service can open a transaction
without importing Prisma itself.

## Tenant isolation

`tenantMiddleware` reads `organizationId` out of the verified access token, not
from a header or a URL segment, so a client cannot ask for another tenant's data
by editing the request. Every model method filters by it, including lookups by
primary key, which are `findFirst({ where: { id, organizationId } })` rather than
`findUnique({ where: { id } })`. A row belonging to another organization is
therefore not "forbidden", it simply is not found, and the API answers 404.

## Stock leaves at placement, not at payment

There is no reservation window, no expiry job, and no release of stock held by
unpaid orders. Placing an order decrements it; that is the only moment stock
moves for a sale.

The reason is who places the orders. This is a back-office tool: staff enter
orders on behalf of a walk-in or telephone customer, and the goods are handed
across the counter as the order is entered. The stock really has gone. A
reserve-then-confirm flow exists to stop anonymous strangers on a public
checkout from holding inventory hostage by filling a basket and wandering off,
and that risk does not exist here — the person placing the order is an employee
who is standing next to the customer.

Adding a reservation window would mean a `RESERVED` state, an expiry job to
release abandoned reservations, and a second set of ledger entries that do not
correspond to anything physical. All of that would be carrying weight for a
threat model this product does not have.

If the product ever grew a public checkout, that is when reservation would
become the right answer.

## Why `FOR UPDATE`

`placeOrder` reads `quantityOnHand`, decides whether there is enough, and then
writes. Without a lock, two orders can run that sequence at the same time, both
read the same quantity, both conclude there is enough, and both decrement. One
unit gets sold twice and the balance goes negative.

`SELECT … FOR UPDATE` takes a row-level write lock as part of the read. The
second transaction to arrive blocks until the first commits, and when it does
get the row it sees the decremented quantity and correctly refuses. The demo
page at `/demo/concurrency` shows both behaviours side by side: the locked path
turns fifty simultaneous orders into one sale and forty-nine clean 409s, and
`POST /api/demo/orders-unsafe` does the same reads and writes without the lock
and drives the balance below zero.

## Why the variant ids are sorted before locking

Two orders that each want variants A and B will deadlock if one locks A then
waits for B while the other holds B and waits for A. Postgres detects the cycle
and kills one of the transactions, so the customer sees a failure that had
nothing to do with stock.

Sorting the ids ascending before locking means every transaction reaches for
the same rows in the same sequence. The second one blocks on the first row it
shares and waits there, holding nothing the first one needs. Requests queue
instead of colliding. `lockVariantsForUpdate` also carries an `ORDER BY id`, so
the ordering does not depend on the caller having remembered.

## The same lock, in the auth path

Refreshing a token is the same shape as placing an order: read the row, decide
what it means, write. Two tabs of the same app refresh at the same moment with
the same cookie, and without a lock both read a token that has not been rotated
yet and both rotate it. The result is one family holding two live refresh
tokens, with the rotation chain recording only whichever wrote last — the other
token is orphaned but still valid, which is exactly what rotation exists to
prevent.

`lockByHash` takes `SELECT … FOR UPDATE` on the refresh token row, and the whole
read-decide-rotate sequence runs inside that transaction. The second tab blocks,
and when it gets the row it sees the rotation that already happened and takes
the grace path instead.

This was found by a test that failed roughly one run in eight. Intermittent is
what this class of bug looks like from the outside, which is the argument for
locking on the reasoning rather than on the symptom.

One detail worth keeping: reuse detection revokes the family and then throws,
and the throw happens **after** the transaction commits. Throwing inside it
would roll the revocation back along with the error, leaving the stolen token
live.

## Why `READ COMMITTED` is enough

Postgres defaults to `READ COMMITTED`, and this code stays there.

The isolation anomaly that would matter is a lost update: two transactions read
the same quantity and both write based on it. `READ COMMITTED` does not prevent
that on its own, because each statement sees a fresh snapshot and neither
transaction is aware of the other.

The explicit `FOR UPDATE` lock closes exactly that hole. Once the row is locked,
the second transaction cannot read a stale quantity — it cannot read the row at
all until the first commits, and then it reads the committed value. The
correctness argument rests on the lock, not on the isolation level.

`SERIALIZABLE` would also be correct, and was not chosen because it pays for a
guarantee this code does not need. It works by detecting conflicts after the
fact and aborting one transaction with a serialization failure, which means
every caller needs retry logic, and under the fifty-orders-at-once case that
retry storm is far more expensive than queueing on a lock. `FOR UPDATE` makes
the contention explicit and orderly instead of optimistic and noisy.

## Idempotent order creation

`POST /api/orders` requires an `Idempotency-Key` header containing a UUID.
Missing or malformed is a 400.

The key row is inserted **before any other work**. There is no distributed lock
and no polling, because the database already provides an atomic way to ask "has
anybody claimed this?" — a unique constraint on `(organizationId, key)`. A
second insert with the same key fails immediately with Prisma's `P2002`, and
that failure _is_ the detection.

What happens next depends on what the existing row holds:

| Existing row                       | Answer                                                             |
| ---------------------------------- | ------------------------------------------------------------------ |
| Same request hash, response stored | Replay it verbatim with `Idempotency-Replayed: true`               |
| Different request hash             | 422 `IDEMPOTENCY_KEY_REUSED`                                       |
| Same hash, no response yet         | 409 `IDEMPOTENCY_IN_PROGRESS` — the first attempt is still running |

The request hash is taken over a canonical form of the payload with the lines
sorted by variant id, so a client that retries with its lines in a different
order is recognised as the same request rather than a conflicting one.

On the client, the key is a function of the basket rather than of the page. The
create-order page keeps a signature of everything the server hashes and mints a
new key whenever that signature changes. Pressing the button again after a
network failure therefore reuses the key and is deduplicated; editing the basket
and pressing again is a genuinely new request with a new key. Without that, a
customer who removed an out-of-stock line and tried again would send new content
under an old key and get 422 for the rest of the session. A 409 also mints a
fresh key, because out of stock is a settled answer rather than an unknown
outcome, so trying again is a new attempt and not a retry of the old one.

A refusal is stored as the response too. If the first attempt came back 409
`OUT_OF_STOCK`, the same key asking the same question gets the same 409, because
that is a real answer and not a reason to redo the work. Only an unexpected
error deletes the key, so the caller is free to retry rather than being stuck
with a failure they cannot clear.

## Fulfilment and payment are separate fields

`OrderStatus` is `PLACED` or `CANCELLED`. `PaymentStatus` is `UNPAID`, `PAID` or
`FAILED`. Only `paymentStatus` speaks for money.

`OrderStatus` originally carried a `PAID` value as well, which meant two columns
could each claim an order was paid and nothing stopped them disagreeing. That is
not a hypothetical once a payment webhook is involved: the webhook and the
application would both be writing "paid" into different places, and a partial
failure would leave one set and the other not. The cancel guard was already
having to ask both fields and trust neither, which was the signal that the model
was wrong.

Now the webhook will touch `paymentStatus` and nothing else, and the cancel
guard asks `paymentStatus === 'PAID'` and nothing else.

## Cancellation

Only a `PLACED` order can be cancelled. A `PAID` order returns 409
`ORDER_ALREADY_PAID` because refunds are out of scope, and an already cancelled
order returns 409 `ORDER_ALREADY_CANCELLED`.

Cancellation mirrors placement exactly: sort the variant ids, lock the rows,
write a `CANCELLATION` movement per line with a correct `balanceAfter`, update
`quantityOnHand`, write an audit row, and commit. Stock returns through the
ledger rather than by editing a number, so the history still adds up.

## One origin in production

Decided in phase 3, implemented in phase 5.

Express serves the built React bundle in production, so the app and the API sit
behind a single origin on one host. Vite keeps proxying `/api` in development,
which is already how it works today.

The reason is the refresh cookie. It is `SameSite=Strict`, which means the
browser will not attach it to a request aimed at a different site. A frontend on
Vercel calling an API on Render is exactly that, so refresh would never work and
the cookie would have to be weakened to `SameSite=None; Secure` with a CORS
allowlist to compensate. Serving both from one origin keeps the stronger cookie
and removes CORS from the deployment altogether.

It is also less to run: one service to keep warm instead of two, one cold start,
and one URL in the README. A CDN in front of the frontend is not worth a second
host for a demo of this size.

If the two ever do need to be split, `api.example.com` and `app.example.com`
share a registrable domain and therefore count as the same site, so
`SameSite=Strict` would survive that. Two unrelated hosting domains would not.

## Money

Every amount is a whole number of paise held in an `Int` column. There is no
`MONEY` type and no floating point anywhere in the path, because binary floating
point cannot represent 0.1 exactly and the error compounds across lines.

Tax is a rate in basis points (1800 = 18%), which keeps the rate an integer too,
and is applied once to the subtotal rather than per line, rounded half up.

## Time

Every timestamp column is `timestamptz`, so Postgres stores an instant rather
than a naive wall-clock reading.

Reports have to pick a wall clock to group by, and that is
`REPORTING_TIME_ZONE` (`Asia/Kolkata`) in `config/constants.js`. A day runs from
midnight IST, so the dashboard agrees with what the shop actually sold that day.
The frontend formats with the same zone. A date is never constructed inside a
SQL string, because that would silently pick up whatever timezone the database
session happened to be in.

That is not hypothetical: the migration that introduced `timestamptz` had to
convert `USING "column" AT TIME ZONE 'UTC'`. The default conversion reads the
existing naive values in the session timezone, and this server's session is
`Asia/Calcutta`, so it would have moved every existing row five and a half hours
away from the instant it actually happened.

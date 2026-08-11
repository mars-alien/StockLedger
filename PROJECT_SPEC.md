# StockLedger — Build Prompt

> Save this in the repo root as `PROJECT_SPEC.md`. Then instruct Claude Code one phase at a time:
> _"Read PROJECT_SPEC.md. Do Phase 1 only, then stop and tell me what to verify."_

---

## 0. Rules

You are building **StockLedger**, a multi-tenant inventory and order management app. It is a final-year student's portfolio project. He will be questioned on every line of it, so favour code that is straightforward and explainable over code that is clever.

1. **One phase per instruction.** Finish it, list what was built and what needs manual checking, then stop.
2. **Do not touch Git.** No `git init`, no commits, no branches, no husky, no commitlint, no lint-staged, no PR templates, no `.github/` folder. The owner handles all of that himself.
3. **No business logic in controllers.** Controllers read the request, call one service, send the response.
4. **Prisma is imported only inside `models/`.**
5. **Any write touching more than one table runs in a transaction.**
6. **Money is stored as integers (paise).** Never floats.
7. **Every list endpoint is paginated.**
8. **No `console.log`, no empty `catch`, no commented-out code, no `TODO` left behind.**
9. **Build nothing that is not in this document.** Ask instead.
10. **Follow §9 (authorship rules) strictly.**

---

## 1. The 15 features

This is the complete scope. Nothing else gets built.

| #   | Feature                                                                       |
| --- | ----------------------------------------------------------------------------- |
| 1   | Register and login with JWT access tokens + refresh token rotation            |
| 2   | Role-based access control — Owner, Manager, Staff                             |
| 3   | Create an organization and invite members by email                            |
| 4   | Multi-tenant data isolation — no organization can ever read another's data    |
| 5   | Category CRUD                                                                 |
| 6   | Product and variant CRUD with search, filter and pagination                   |
| 7   | Product image upload                                                          |
| 8   | Append-only stock ledger — every stock change recorded with a running balance |
| 9   | Receive stock and manual stock adjustment (reason required)                   |
| 10  | Order placement with transactional row locking — overselling is impossible    |
| 11  | Idempotent order creation via `Idempotency-Key`                               |
| 12  | Order cancellation that returns stock to the ledger                           |
| 13  | Razorpay test payment + PDF invoice download                                  |
| 14  | Analytics dashboard with charts                                               |
| 15  | Concurrency demo page (§8)                                                    |

Plus one thing that is infrastructure rather than a feature and is expected throughout: an audit log of who changed what.

**Not building:** email of any kind, low-stock alerts or notifications of any kind, email verification, forgot password, purchase orders, suppliers, a customers module (customer name and phone are fields on the order), CSV import or export, returns, multi-warehouse, barcodes, POS.

There is no mail provider, no notification system and no reorder point. Stock is a number you look at, never a threshold that triggers anything.

---

## 2. Tech stack

Do not substitute anything.

**Package manager: plain `npm`.** No pnpm, no yarn, no workspaces, no `.npmrc`. Two separate `package.json` files — one in `server/`, one in `frontend/` — plus a small root `package.json` that uses `concurrently` to run both in development.

**Language:** plain JavaScript, ESM (`"type": "module"`). Not TypeScript.

**Backend (`server/`)**

- Express 5
- Prisma + PostgreSQL
- Zod for request validation
- jsonwebtoken, bcryptjs
- helmet, cors, express-rate-limit (in-memory store)
- Pino + pino-http for logging
- Cloudinary (images), Razorpay (test mode), pdfkit (invoices)

**Frontend (`frontend/`)**

- React + Vite
- React Router
- TanStack Query for server state, Zustand for client state
- React Hook Form + Zod resolver
- Tailwind CSS — **hand-write the UI components**, do not install shadcn/ui, MUI or any component library
- Recharts for the dashboard
- axios

**Testing:** Vitest + Supertest against a local test database. `autocannon` for the load test.

**PostgreSQL is the only datastore.** Every piece of persistent state — users, catalog, stock ledger, orders, refresh tokens, idempotency keys, audit log — lives in one Postgres database accessed through Prisma. No second database, no key-value store, no separate cache.

**No Redis, no BullMQ, no Docker Compose, no message queues, no email provider, no CI configuration.** Invoices generate on demand when the user clicks download.

**Deployment:** a single origin. Express serves the built React bundle in production, so the app and the API run as one service on Render or Fly.io, with Supabase for PostgreSQL. Vite keeps proxying `/api` in development. One small `Dockerfile` in `server/` only if the host needs it.

This keeps the refresh cookie at `SameSite=Strict`, which a split frontend and API host would break, and removes CORS from the deployment entirely. See `docs/architecture.md`.

---

## 3. Folder structure

Modelled on the layout the owner already knows, extended with a service layer and validators.

```
stockledger/
├── server/
│   ├── config/
│   │   ├── db.js                  # prisma client
│   │   └── env.js                 # Zod-validated environment variables
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── organizationController.js
│   │   ├── memberController.js
│   │   ├── categoryController.js
│   │   ├── productController.js
│   │   ├── inventoryController.js
│   │   ├── orderController.js
│   │   ├── paymentController.js
│   │   ├── analyticsController.js
│   │   └── demoController.js
│   ├── services/
│   │   ├── authService.js
│   │   ├── organizationService.js
│   │   ├── categoryService.js
│   │   ├── productService.js
│   │   ├── inventoryService.js
│   │   ├── orderService.js        # placeOrder lives here — the important one
│   │   ├── paymentService.js
│   │   └── analyticsService.js
│   ├── models/                    # the only place Prisma is used
│   │   ├── userModel.js
│   │   ├── organizationModel.js
│   │   ├── membershipModel.js
│   │   ├── refreshTokenModel.js
│   │   ├── categoryModel.js
│   │   ├── productModel.js
│   │   ├── variantModel.js
│   │   ├── stockMovementModel.js
│   │   ├── orderModel.js
│   │   └── auditLogModel.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── organizationRoutes.js
│   │   ├── memberRoutes.js
│   │   ├── categoryRoutes.js
│   │   ├── productRoutes.js
│   │   ├── inventoryRoutes.js
│   │   ├── orderRoutes.js
│   │   ├── paymentRoutes.js
│   │   ├── analyticsRoutes.js
│   │   └── demoRoutes.js
│   ├── middleware/
│   │   ├── authMiddleware.js      # verifies JWT, attaches req.user
│   │   ├── tenantMiddleware.js    # attaches req.organizationId
│   │   ├── roleMiddleware.js      # requireRole('OWNER','MANAGER')
│   │   ├── validate.js            # runs a Zod schema against body/query/params
│   │   ├── requestId.js
│   │   └── errorMiddleware.js     # the single error handler
│   ├── validators/                # one Zod file per resource
│   ├── utils/
│   │   ├── AppError.js
│   │   ├── asyncHandler.js
│   │   ├── logger.js
│   │   ├── money.js               # integer paise arithmetic
│   │   ├── pagination.js
│   │   ├── generateToken.js
│   │   └── invoicePdf.js
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── tests/
│   ├── seeder.js
│   └── index.js
├── frontend/
│   ├── src/
│   │   ├── api/                   # axios instance + one query-hook file per resource
│   │   ├── components/
│   │   │   ├── ui/                # Button, Input, Modal, Table, Badge, Card — hand-written
│   │   │   ├── layout/            # Sidebar, Topbar, AppShell
│   │   │   └── shared/            # Pagination, EmptyState, Loader, ErrorBoundary
│   │   ├── pages/                 # one folder per screen
│   │   ├── hooks/
│   │   ├── store/                 # zustand
│   │   ├── utils/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   └── vite.config.js
├── docs/
│   ├── architecture.md
│   ├── database.md
│   ├── load-test.md
│   └── screenshots/
├── .env.example
├── package.json                   # dev script runs server + frontend via concurrently
└── README.md
```

**Naming convention:** for a resource `X` there is exactly `controllers/xController.js`, `services/xService.js`, `models/xModel.js`, `routes/xRoutes.js`, `validators/xValidator.js`. Same pattern every time.

---

## 4. Architecture

**Flow:** `route → middleware → controller → service → model → PostgreSQL`

- **Route** declares the path and attaches middleware. No logic.
- **Controller** takes validated input off `req`, calls one service method, sends the response. Wrapped in `asyncHandler`, so no `try/catch` — errors reach `errorMiddleware`. Keep it under 10 lines.
- **Service** holds all business logic and owns transactions. Never touches `req` or `res`, so it can be called from `seeder.js` or a test.
- **Model** is the only Prisma consumer. Methods are named for intent (`findBySku`, `lockVariantsForUpdate`, `applyStockDelta`) and accept an optional transaction client so a service can compose several models in one transaction. **Every model method takes `organizationId` and filters by it** — this is how tenant isolation is enforced.
- **`utils/`** holds pure helpers. These get the unit tests.

This is MVC with a service layer, the same pattern Rails and Laravel use. The reason the service layer exists is that MVC gives business logic no home of its own, so without it everything piles into the controller.

---

## 5. Database

Every tenant-scoped table has `organizationId`.

| Table             | Fields                                                                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organizations`   | id, name, slug (unique), createdAt                                                                                                                                                                                                                            |
| `users`           | id, email (unique), passwordHash, name, createdAt                                                                                                                                                                                                             |
| `memberships`     | id, userId, organizationId, role (OWNER/MANAGER/STAFF), unique(userId, organizationId)                                                                                                                                                                        |
| `invitations`     | id, organizationId, email, role, tokenHash, expiresAt, acceptedAt                                                                                                                                                                                             |
| `refreshTokens`   | id, userId, tokenHash, familyId, expiresAt, revokedAt, replacedById                                                                                                                                                                                           |
| `categories`      | id, organizationId, name, slug, unique(organizationId, slug)                                                                                                                                                                                                  |
| `products`        | id, organizationId, sku, name, description, categoryId, imageUrl, isActive, unique(organizationId, sku)                                                                                                                                                       |
| `productVariants` | id, organizationId, productId, sku, name, attributes (Json), priceCents, costCents, quantityOnHand, unique(organizationId, sku)                                                                                                                               |
| `stockMovements`  | id, organizationId, variantId, delta (signed Int), reason (RECEIPT/SALE/ADJUSTMENT/CANCELLATION), note, orderId, balanceAfter, createdByUserId, createdAt                                                                                                     |
| `orders`          | id, organizationId, orderNumber, customerName, customerPhone, status (PLACED/CANCELLED), paymentStatus (UNPAID/PAID/FAILED — the only authority on money), subtotalCents, taxCents, totalCents, razorpayOrderId, razorpayPaymentId, placedByUserId, createdAt |
| `orderLines`      | id, organizationId, orderId, variantId, quantity, unitPriceCents, lineTotalCents                                                                                                                                                                              |
| `idempotencyKeys` | id, organizationId, key, requestHash, responseStatus, responseBody (Json), createdAt, **unique(organizationId, key)**                                                                                                                                         |
| `auditLogs`       | id, organizationId, actorUserId, action, entityType, entityId, before (Json), after (Json), createdAt                                                                                                                                                         |

**Indexes:** every `organizationId`, every foreign key, `stockMovements(variantId, createdAt)`, `orders(organizationId, createdAt)`, `orders(organizationId, status)`. Explain each in `docs/database.md`.

**Seeder:** two organizations (so isolation is demonstrable), about 8 users across the three roles, ~100 products with ~200 variants, and **9 months of backdated orders** so the dashboard shows a real-looking business.

---

## 6. The three things that must be exactly right

### 6.1 Tenant isolation

`tenantMiddleware` reads `organizationId` from the verified JWT and sets `req.organizationId`. Services pass it to every model call, and **every model method filters by it in the `where` clause** — including single-record lookups by id, which must be `findFirst({ where: { id, organizationId } })`, never `findUnique({ where: { id } })`. That one habit is what prevents cross-tenant reads.

**Prove it with tests:** seed two organizations, log in as a member of org A, and assert that every list endpoint returns none of org B's rows and every get-by-id for an org B record returns 404.

### 6.2 Order placement — `services/orderService.js → placeOrder()`

The most important function in the project.

```
1.  Insert the idempotency key row first (§6.3).
2.  BEGIN transaction.
3.  Collect the variant ids from the order lines and SORT THEM ASCENDING.
    → locking rows in a consistent order prevents deadlocks when two
      orders touch overlapping variants.
4.  SELECT id, quantityOnHand, priceCents FROM "productVariants"
    WHERE id = ANY($1) AND "organizationId" = $2 FOR UPDATE
    (raw query via $queryRaw — Prisma has no first-class FOR UPDATE).
5.  Check every line has enough stock. If any line fails, throw
    AppError('OUT_OF_STOCK', 409) with a details array naming each
    short variant and its available quantity. The transaction rolls
    back and nothing is partially applied.
6.  Compute totals in integer paise using utils/money.js.
7.  Insert the order and its lines.
8.  Per line, insert a stockMovement (negative delta, reason SALE,
    balanceAfter computed) and update quantityOnHand.
9.  Insert an auditLog row.
10. COMMIT.
11. Update the idempotency row with the response.
```

`READ COMMITTED` is sufficient here **because** of the explicit `FOR UPDATE` locks. Write that reasoning into `docs/architecture.md` — it is a question you will be asked.

### 6.3 Idempotent order creation

- `POST /api/orders` requires an `Idempotency-Key` header (a UUID). Missing → 400.
- **Insert the key row before doing any work.** The unique constraint on `(organizationId, key)` does the concurrency control for you — a duplicate insert fails immediately with a Prisma P2002, which means the request is a repeat. No lock, no Redis, no polling.
- On P2002: load the existing row. If it has a stored response and the request hash matches, replay it with header `Idempotency-Replayed: true`. If the hash differs, return 422 `IDEMPOTENCY_KEY_REUSED`.
- The reason this works is that the database is already a shared source of truth with atomic uniqueness. Say exactly that when asked why there is no distributed lock.

### 6.4 Auth and token rotation

- Passwords hashed with bcryptjs, cost factor 12.
- **Access token:** JWT, 15-minute expiry, returned in the response body, kept in memory on the client. Never in localStorage.
- **Refresh token:** 32 random bytes, **only its hash stored in the database**, sent as `httpOnly; Secure; SameSite=Strict` cookie with a 7-day expiry.
- **Rotation:** each refresh issues a new token and marks the old one replaced. All tokens in a chain share a `familyId`.
- **Reuse detection:** presenting an already-replaced token revokes the entire family and forces re-login, logged at `warn`. Do not skip this — it is the detail that makes the auth answer strong.
- The access token payload carries `userId`, `organizationId` and `role`. Switching organization issues a new access token.
- `/api/auth/login` limited to 5 attempts per 15 minutes per IP.

---

## 7. API and error handling

- Base path `/api`. `/api/health` is public.
- **One error shape, always:**

  ```json
  {
    "error": {
      "code": "OUT_OF_STOCK",
      "message": "Insufficient stock for 2 items",
      "details": [],
      "requestId": "a1b2c3"
    }
  }
  ```

- One `AppError` class (`code`, `statusCode`, `message`, `details`) and one `errorMiddleware` that maps `AppError`, Zod errors, and Prisma errors (P2002 → 409 `DUPLICATE_RESOURCE`, P2025 → 404 `NOT_FOUND`), with anything unrecognised becoming a 500 whose message is hidden in production. `requestId` is always included.
- Pagination: `?page=&limit=&search=&sort=`, response `{ data: [], page, limit, total, totalPages }`.
- Every response carries an `X-Request-Id` header.
- API documentation: a hand-written `docs/api.md` table of endpoints, plus a Postman collection committed to the repo. No auto-generated OpenAPI tooling.

**Logging:** Pino, JSON in production and pretty in development, with a short request id generated per request. Log request completion with method, path, status and duration; all 5xx with the stack; login success and failure; token reuse detection; and every stock movement. Redact passwords, tokens and cookies.

**Security:** helmet, a CORS allowlist from environment variables (never `*`), rate limiting globally and harder on login, Zod validation on every route, bcrypt, secrets only from a Zod-validated `env.js` that crashes on boot if one is missing, `.env.example` committed with `.env` ignored, Razorpay webhook signature verification, no stack traces in production responses, upload size and MIME restrictions.

---

## 8. Screens and the demo page

Sidebar + topbar dashboard layout with an organization switcher and user menu. Neutral palette, one accent colour, dense tables, roomy forms. Fully responsive — sidebar collapses to a drawer on mobile and tables become stacked cards.

1. Login, Register, Accept invitation
2. Create organization (onboarding)
3. Dashboard — revenue trend, orders over time, top products, KPI cards
4. Products — table with search, category filter and pagination; detail page with variants, stock history and image upload
5. Categories — table with modal create/edit
6. Inventory — stock movement ledger with filters, a receive-stock form, and an adjustment form that requires a reason
7. Orders — filterable list; create-order page with variant search, live stock and a running total; detail page with timeline, pay button and invoice download
8. Members — invite, change role, remove (Owner only)
9. **`/demo/concurrency`**

**State rules:** all server data goes through TanStack Query with structured keys like `['products', orgId, filters]`; mutations invalidate specific keys, never everything; Zustand holds only the active organization, sidebar state and filter drafts; one axios interceptor refreshes the access token once on a 401, queues the requests that failed meanwhile, and redirects to login if the refresh fails; every page has a loading state, an empty state and an error state.

**The concurrency demo page** is what makes the invisible work visible, so build it carefully. It shows a demo product holding **1 unit**. A button fires 50 parallel order requests with distinct idempotency keys, and a results panel shows the count of 201s versus 409s, the final stock, total duration, and a scrolling log. A toggle switches to a deliberately naive endpoint (`POST /api/demo/orders-unsafe`) that reads stock then writes without `FOR UPDATE` — running that one produces several successes and **negative stock**. A reset button restores the demo. Put a paragraph beside it explaining what the lock is doing. Keep the unsafe endpoint behind an environment flag.

---

## 9. Authorship rules

This must read as one student's work, written over five weeks.

**Comments explain why, never what.** No `// Increment the counter`. No banner dividers like `// ===== HELPERS =====`. No file-header blocks. No JSDoc on one-line functions. Save comments for genuinely non-obvious decisions — why variant ids are sorted before locking, why the idempotency row is inserted before the transaction, why the refresh cookie is `SameSite=Strict`. Roughly one comment every 30 lines.

**No AI tells.** No emoji anywhere. No "🚀 Features" heading in the README. No words like robust, seamless, comprehensive, leverages, cutting-edge. No leftover `TODO`. No over-explaining in documentation.

**Consistency beats cleverness.** One way to throw an error, one pagination helper, one Zod naming convention, one response shape, across every file. Files that disagree with each other are the clearest sign of stitched-together code.

**No speculative abstraction.** No base controller class, no plugin system, no event bus, no config-driven generic layer. Plain code a student can defend beats architecture that looks impressive and cannot be explained.

**Keep functions small and named for intent.** If a service method passes about 40 lines, split it into named functions in the same file. `placeOrder` is the exception and should read as one coherent transaction.

**At the end of each phase, list the decisions you made** so the owner can review them.

---

## 10. Phases (five weeks)

Do one phase per instruction, then stop. The owner commits the work himself.

**Phase 1 — Foundation and auth**
Root `package.json` with a `dev` script, `server/` and `frontend/` scaffolds, ESLint and Prettier, `env.js`, Pino logger with request ids, `AppError` + `asyncHandler` + `errorMiddleware`, `/api/health`. Prisma schema for users, organizations, memberships, invitations, refreshTokens and auditLogs. Register, login, refresh with rotation and reuse detection, logout, me. Organization creation, email invitations, member list, role changes, removal. `authMiddleware`, `tenantMiddleware`, `roleMiddleware`. Frontend: auth pages, protected routing, axios interceptor, Zustand stores, app shell with sidebar and organization switcher.
_Done when:_ tenant isolation tests and token rotation tests pass.

**Phase 2 — Catalog and stock ledger**
Categories, products and variants with full CRUD, search, filters and pagination. Cloudinary image upload. Append-only `stockMovements` with `quantityOnHand` maintained transactionally, receive-stock, and adjustments requiring a reason. Frontend tables, modal forms, product detail with stock history, inventory ledger page. Seeder with realistic data.
_Done when:_ a manager can build a catalog and move stock through the UI, every change traces to a movement row with a correct `balanceAfter`, and Staff is correctly blocked.

**Phase 3 — Orders and concurrency**
`placeOrder` per §6.2, idempotency per §6.3, cancellation returning stock to the ledger, order list and detail UI, create-order page with live stock, and the `/demo/concurrency` page. Concurrency and idempotency tests.
_Done when:_ 50 parallel orders against 1 unit give exactly one success and stock never goes negative.

**Phase 4 — Payments, invoices, dashboard**
Razorpay order creation, checkout integration and webhook signature verification. PDF invoice generated on download. Analytics queries and the Recharts dashboard.
_Done when:_ a test payment completes end to end and the dashboard renders nine months of seeded data.

**Phase 5 — Polish, docs, deploy**
Fill test gaps, run the autocannon load test and write `docs/load-test.md` with real p50/p95/p99 numbers, security review pass, `docs/architecture.md` and `docs/database.md`, `docs/api.md` plus the Postman collection, screenshots, a demo GIF, the README, and deployment as a single origin to Render or Fly with Supabase, with a seeded demo account whose credentials are in the README.
_Done when:_ a stranger can open the live link, log in with the demo account and place an order in under a minute.

---

## 11. Done means

- The live demo loads quickly and works end to end
- The README opens with a working GIF and demo credentials
- `docs/load-test.md` contains numbers actually measured
- Isolation, concurrency, idempotency and token-rotation tests all pass
- The owner can explain, without notes: why `FOR UPDATE` is needed, why variant ids are sorted before locking, why `READ COMMITTED` is enough, why the unique constraint replaces a distributed lock, why refresh-token reuse revokes a whole family, and why money is stored as integers

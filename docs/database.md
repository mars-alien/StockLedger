# Database

PostgreSQL, one database, accessed only through Prisma and only from
`server/models/`. There is no second datastore and no cache.

## Tables

| Table             | Holds                                                                               |
| ----------------- | ----------------------------------------------------------------------------------- |
| `organizations`   | One tenant. Every other tenant-scoped row points at it.                             |
| `users`           | An account. Global, not per tenant: one person can belong to several organizations. |
| `memberships`     | Which user is in which organization, and as what role.                              |
| `invitations`     | A pending invite. Stores a hash of the token, never the token.                      |
| `refreshTokens`   | One row per issued refresh token, forming a rotation chain.                         |
| `categories`      | Catalogue grouping, scoped per organization.                                        |
| `products`        | A sellable thing. Carries the SKU, image and active flag.                           |
| `productVariants` | What is actually sold and counted. Price, cost and `quantityOnHand` live here.      |
| `stockMovements`  | Append-only ledger. Every change to `quantityOnHand`, with the balance it produced. |
| `orders`          | A sale. Fulfilment state, payment state and money totals.                           |
| `orderLines`      | What was on the order, at the price it sold for.                                    |
| `idempotencyKeys` | One row per `Idempotency-Key`, with the response it produced.                       |
| `auditLogs`       | Who changed what, with before and after.                                            |

## Decisions worth defending

**Money is `Int`, in paise.** No `NUMERIC`, no `MONEY`, no floating point.
Binary floating point cannot represent 0.1 exactly, and the error compounds
across order lines. Tax is a rate in basis points so the rate is an integer too.

**Every timestamp is `timestamptz(3)`.** The column holds an instant rather than
a naive wall-clock reading, so reports can bucket by `AT TIME ZONE
'Asia/Kolkata'` in one step. The migration that introduced this had to convert
`USING "column" AT TIME ZONE 'UTC'` — the default conversion reads existing
values in the _session_ timezone, which on this machine is `Asia/Calcutta` and
would have moved every row five and a half hours.

**`stockMovements` is append-only.** Rows are inserted, never updated or
deleted. `balanceAfter` is the running total at the moment of the movement, so
the ledger can be replayed and checked against `quantityOnHand`. That is why
products and variants with history refuse to be deleted — a cascade would tear
holes in the history.

**`quantityOnHand` is denormalised on the variant.** It could be derived by
summing deltas, but every order placement would then have to sum the whole
ledger under a lock. It is maintained in the same transaction as the movement
that changes it, and the two are checked against each other:

```sql
select count(*) from "productVariants" v
 where v."quantityOnHand" <> (
   select coalesce(sum(m.delta), 0) from "stockMovements" m where m."variantId" = v.id
 );
```

**`OrderStatus` has no `PAID` value.** Fulfilment is `PLACED` or `CANCELLED`;
`paymentStatus` is the only field that speaks for money. Two columns that can
each claim an order is paid will eventually disagree.

**`idempotencyKeys` has a unique constraint on `(organizationId, key)`,** and
that constraint _is_ the concurrency control for repeat submissions. A duplicate
insert fails immediately, which is how a retry is detected without a lock.

## Indexes

Every foreign key is indexed, because Postgres does not do it for you and an
unindexed FK turns every parent delete into a sequential scan of the child.

| Index                                                      | Why                                                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `organizations_slug_key`                                   | Slug lookup when creating an organization, and uniqueness.                                   |
| `users_email_key`                                          | Every sign-in is a lookup by email.                                                          |
| `memberships_userId_organizationId_key`                    | One membership per person per organization, and the lookup `tenantMiddleware` depends on.    |
| `memberships_organizationId_idx`, `memberships_userId_idx` | The member list, and "which organizations am I in".                                          |
| `invitations_tokenHash_key`                                | Accepting an invitation is a lookup by hash.                                                 |
| `invitations_organizationId_idx`, `invitations_email_idx`  | Pending list, and the already-invited check.                                                 |
| `refreshTokens_tokenHash_key`                              | Every refresh is a lookup by hash.                                                           |
| `refreshTokens_familyId_idx`                               | Revoking a family on reuse detection touches every row in it.                                |
| `refreshTokens_replacedById_key`                           | One token can only replace one other, which keeps the rotation chain a chain.                |
| `categories_organizationId_slug_key`                       | Uniqueness per tenant, and the duplicate-name check.                                         |
| `products_organizationId_sku_key`                          | SKUs are unique per tenant, not globally.                                                    |
| `products_organizationId_idx`                              | The product list is always filtered by tenant first.                                         |
| `products_categoryId_idx`                                  | Category filter on the product list.                                                         |
| `productVariants_organizationId_sku_key`                   | Same, for variants.                                                                          |
| `productVariants_productId_idx`                            | Loading a product's variants on the detail page.                                             |
| `stockMovements_variantId_createdAt_idx`                   | The ledger is read per variant, newest first. Composite so the sort is served by the index.  |
| `stockMovements_organizationId_createdAt_idx`              | The unfiltered ledger page, same shape.                                                      |
| `stockMovements_orderId_idx`                               | The stock effect panel on an order.                                                          |
| `orders_organizationId_createdAt_idx`                      | The order list, which is always tenant plus newest first.                                    |
| `orders_organizationId_status_idx`                         | The status filter on that list.                                                              |
| `orders_organizationId_orderNumber_key`                    | Order numbers are unique per tenant, which is what lets them be generated without a counter. |
| `orderLines_orderId_idx`                                   | Loading an order's lines.                                                                    |
| `orderLines_variantId_idx`                                 | The top-products analytics join.                                                             |
| `idempotencyKeys_organizationId_key_key`                   | The constraint that does the idempotency work.                                               |
| `auditLogs_organizationId_createdAt_idx`                   | Reading an organization's audit trail in order.                                              |

Composite indexes are ordered with the equality column first and the sort column
second, so a query filtering on one and ordering by the other is served entirely
from the index.

## What is not indexed, and why

Product and variant search uses `contains` with `mode: 'insensitive'`, which
becomes `ILIKE '%term%'` and cannot use a B-tree index. At this size that is a
sequential scan over a few hundred rows and is not worth solving. A catalogue
large enough to care would want a trigram index (`pg_trgm`) or a `tsvector`
column, and that is a change to make when the numbers justify it rather than in
advance.

## Relationship notes

- `products.categoryId` is `ON DELETE SET NULL`. Deleting a category is a filing
  change and should not take stock with it.
- `orderLines` and `stockMovements` cascade from their variant, which is why
  variants with history cannot be deleted at all.
- `stockMovements.orderId` is `ON DELETE SET NULL` and nullable: receipts and
  manual adjustments have no order behind them.
- `refreshTokens.replacedById` is a self-relation with a unique constraint,
  making the rotation chain single-linked and unforkable.

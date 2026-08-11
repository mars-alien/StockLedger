# API

Base path `/api`. JSON in, JSON out, except the invoice which is a PDF stream.

## Conventions

**Authentication.** A bearer access token, 15 minutes, in the response body and
held in memory by the client. The refresh token is an httpOnly `SameSite=Strict`
cookie scoped to `/api/auth`; it never appears in a response body.

**Tenancy.** The organization comes from the signed token, never from a header
or the URL. A row belonging to another organization is not forbidden, it is
absent: the answer is `404`.

**Pagination.** Every list takes `?page=&limit=` and answers with the same
envelope. `limit` is capped at 100.

```json
{ "data": [], "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
```

**Errors.** One shape, always. `requestId` matches the `X-Request-Id` header on
every response.

```json
{
  "error": {
    "code": "OUT_OF_STOCK",
    "message": "Insufficient stock for 1 item",
    "details": [],
    "requestId": "a1b2c3d4"
  }
}
```

**Money.** Integers, in paise. `priceCents: 49900` is ₹499.00.

## Roles

|                                           | Owner | Manager | Staff |
| ----------------------------------------- | :---: | :-----: | :---: |
| Read catalogue, stock, orders             |   ✓   |    ✓    |   ✓   |
| Place an order                            |   ✓   |    ✓    |   ✓   |
| Take a payment, download an invoice       |   ✓   |    ✓    |   ✓   |
| Edit catalogue, move stock, cancel orders |   ✓   |    ✓    |       |
| Analytics, concurrency demo               |   ✓   |    ✓    |       |
| Members and invitations                   |   ✓   |         |       |

## Endpoints

### Health

| Method | Path          | Notes                     |
| ------ | ------------- | ------------------------- |
| `GET`  | `/api/health` | Public. Not rate limited. |

### Auth — `/api/auth`

| Method | Path                  | Notes                                                                                                        |
| ------ | --------------------- | ------------------------------------------------------------------------------------------------------------ |
| `POST` | `/register`           | Creates the account and signs in. No organization yet.                                                       |
| `POST` | `/login`              | Five attempts per 15 minutes per IP.                                                                         |
| `POST` | `/refresh`            | Rotates the cookie. Optional body `{ organizationId }` picks which organization the new access token is for. |
| `POST` | `/logout`             | Revokes the whole token family.                                                                              |
| `GET`  | `/me`                 | Current user and active organization.                                                                        |
| `GET`  | `/invitations/:token` | What an invite is for, before accepting it.                                                                  |
| `POST` | `/accept-invitation`  | `{ token, name?, password }`. An existing account must supply its password.                                  |

### Organizations — `/api/organizations`

| Method | Path                      | Notes                                                      |
| ------ | ------------------------- | ---------------------------------------------------------- |
| `POST` | `/`                       | Creates it, makes you owner, returns a token scoped to it. |
| `GET`  | `/`                       | Organizations you belong to.                               |
| `GET`  | `/current`                | Active organization, including `taxRateBasisPoints`.       |
| `POST` | `/:organizationId/switch` | Returns a new access token for that organization.          |

### Members — `/api/members` · owner only

| Method   | Path                         | Notes                                                                      |
| -------- | ---------------------------- | -------------------------------------------------------------------------- |
| `GET`    | `/`                          | `?search=` matches name or email.                                          |
| `GET`    | `/invitations`               | Pending only.                                                              |
| `POST`   | `/invitations`               | `{ email, role }`. Returns `inviteUrl` **once** — only its hash is stored. |
| `DELETE` | `/invitations/:invitationId` |                                                                            |
| `PATCH`  | `/:membershipId`             | `{ role }`. Refuses self, and refuses to drop the last owner.              |
| `DELETE` | `/:membershipId`             | Same guards.                                                               |

### Categories — `/api/categories`

| Method   | Path           | Notes                                              |
| -------- | -------------- | -------------------------------------------------- |
| `GET`    | `/`            | `?search=`                                         |
| `POST`   | `/`            | `{ name }`. Slug derived; duplicates rejected.     |
| `PATCH`  | `/:categoryId` |                                                    |
| `DELETE` | `/:categoryId` | Products survive; their `categoryId` becomes null. |

### Products — `/api/products`

| Method   | Path                              | Notes                                                                               |
| -------- | --------------------------------- | ----------------------------------------------------------------------------------- |
| `GET`    | `/`                               | `?search=&categoryId=&isActive=`                                                    |
| `POST`   | `/`                               | `{ sku, name, description?, categoryId? }`                                          |
| `GET`    | `/:productId`                     | Includes variants.                                                                  |
| `PATCH`  | `/:productId`                     | At least one field.                                                                 |
| `DELETE` | `/:productId`                     | `409 PRODUCT_HAS_HISTORY` once stock has moved.                                     |
| `POST`   | `/:productId/image`               | Multipart, field `image`. JPEG/PNG/WebP, 2 MB. `503` if Cloudinary is unconfigured. |
| `POST`   | `/:productId/variants`            | `{ sku, name, attributes?, priceCents, costCents }`                                 |
| `PATCH`  | `/:productId/variants/:variantId` |                                                                                     |
| `DELETE` | `/:productId/variants/:variantId` | `409 VARIANT_HAS_HISTORY` once stock has moved.                                     |

### Inventory — `/api/inventory`

| Method | Path         | Notes                                                                 |
| ------ | ------------ | --------------------------------------------------------------------- |
| `GET`  | `/movements` | `?variantId=&productId=&orderId=&reason=&from=&to=`                   |
| `GET`  | `/variants`  | Flat variant search with current stock.                               |
| `POST` | `/receive`   | `{ variantId, quantity, note? }`                                      |
| `POST` | `/adjust`    | `{ variantId, delta, note }`. Note is required; delta cannot be zero. |

### Orders — `/api/orders`

| Method | Path                | Notes                                             |
| ------ | ------------------- | ------------------------------------------------- |
| `GET`  | `/`                 | `?status=&paymentStatus=&search=&from=&to=`       |
| `POST` | `/`                 | **Requires `Idempotency-Key`** (UUID). See below. |
| `GET`  | `/:orderId`         |                                                   |
| `GET`  | `/:orderId/invoice` | `application/pdf`.                                |
| `POST` | `/:orderId/cancel`  | `{ note? }`. Returns stock through the ledger.    |

`POST /api/orders`

```json
{
  "customerName": "Ananya Krishnan",
  "customerPhone": "9876543210",
  "lines": [{ "variantId": "…", "quantity": 2 }]
}
```

Every response carries `Idempotency-Replayed: true|false`.

| Situation                             | Answer                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------- |
| Header missing or not a UUID          | `400 VALIDATION_ERROR`                                                  |
| Same key, same body, already answered | The stored response, `Idempotency-Replayed: true`                       |
| Same key, different body              | `422 IDEMPOTENCY_KEY_REUSED`                                            |
| Same key, first attempt still running | `409 IDEMPOTENCY_IN_PROGRESS`                                           |
| Any line short of stock               | `409 OUT_OF_STOCK`, nothing written, `details` names each short variant |

### Payments — `/api/payments`

| Method | Path                      | Notes                                                        |
| ------ | ------------------------- | ------------------------------------------------------------ |
| `POST` | `/webhook`                | **Public.** Authenticated by the Razorpay webhook signature. |
| `POST` | `/orders/:orderId/intent` | Creates or reuses the Razorpay order.                        |
| `POST` | `/verify`                 | `{ razorpayOrderId, razorpayPaymentId, signature }`          |

Both paths converge on one idempotent update, so either can arrive first or
twice. Neither will mark a cancelled order paid.

### Analytics — `/api/analytics` · owner and manager

| Method | Path         | Notes                                                                                          |
| ------ | ------------ | ---------------------------------------------------------------------------------------------- |
| `GET`  | `/dashboard` | `?days=` (1–730, default 180). Cancelled orders excluded. Every day in the range gets a point. |

### Demo — `/api/demo` · owner and manager

Behind `DEMO_ENDPOINTS_ENABLED`. Off means `404`, not `403`.

| Method | Path             | Notes                                                             |
| ------ | ---------------- | ----------------------------------------------------------------- |
| `GET`  | `/state`         | The demo variant and its stock.                                   |
| `POST` | `/reset`         | Back to one unit, through the ledger.                             |
| `POST` | `/orders-unsafe` | **Deliberately wrong.** Reads stock, waits, writes, with no lock. |

## Error codes

| Code                                                                 | Status | Meaning                                                                   |
| -------------------------------------------------------------------- | :----: | ------------------------------------------------------------------------- |
| `VALIDATION_ERROR`                                                   |  400   | Zod rejected the body, query, params or a header. `details` lists fields. |
| `UNAUTHENTICATED`                                                    |  401   | No access token.                                                          |
| `INVALID_TOKEN`                                                      |  401   | Access token invalid or expired.                                          |
| `INVALID_CREDENTIALS`                                                |  401   | Wrong email or password.                                                  |
| `INVALID_REFRESH_TOKEN`                                              |  401   | Refresh token not recognised.                                             |
| `REFRESH_TOKEN_EXPIRED`                                              |  401   | Session past seven days.                                                  |
| `TOKEN_REUSE_DETECTED`                                               |  401   | A rotated token came back. The whole family is revoked.                   |
| `FORBIDDEN`                                                          |  403   | Role does not allow it.                                                   |
| `NO_ORGANIZATION`                                                    |  403   | Token carries no organization.                                            |
| `NOT_FOUND`                                                          |  404   | Missing, or belongs to another organization.                              |
| `INVITATION_INVALID`                                                 |  404   | Expired, used, or unknown.                                                |
| `EMAIL_TAKEN`                                                        |  409   | Account already exists.                                                   |
| `DUPLICATE_RESOURCE`                                                 |  409   | Unique constraint, from Prisma `P2002`.                                   |
| `SKU_TAKEN` / `CATEGORY_EXISTS`                                      |  409   | Already used in this organization.                                        |
| `OUT_OF_STOCK`                                                       |  409   | One or more lines short. Nothing written.                                 |
| `INSUFFICIENT_STOCK`                                                 |  409   | An adjustment would go below zero.                                        |
| `PRODUCT_HAS_HISTORY` / `VARIANT_HAS_HISTORY`                        |  409   | Deactivate instead of deleting.                                           |
| `ORDER_ALREADY_PAID` / `ORDER_ALREADY_CANCELLED` / `ORDER_CANCELLED` |  409   | Order is past that point.                                                 |
| `IDEMPOTENCY_IN_PROGRESS`                                            |  409   | First request with this key is still running.                             |
| `LAST_OWNER`                                                         |  409   | An organization keeps at least one owner.                                 |
| `CANNOT_MODIFY_SELF`                                                 |  400   | You cannot change or remove your own membership.                          |
| `RATE_LIMITED`                                                       |  429   | Too many requests.                                                        |
| `FILE_TOO_LARGE`                                                     |  413   | Image over 2 MB.                                                          |
| `UNSUPPORTED_IMAGE_TYPE`                                             |  415   | Not JPEG, PNG or WebP.                                                    |
| `IDEMPOTENCY_KEY_REUSED`                                             |  422   | Key already used for a different request.                                 |
| `PAYMENTS_UNAVAILABLE` / `IMAGE_UPLOAD_UNAVAILABLE`                  |  503   | Provider not configured.                                                  |
| `PAYMENT_SIGNATURE_INVALID`                                          |  400   | Signature did not verify.                                                 |
| `INTERNAL_ERROR`                                                     |  500   | Unexpected. Message hidden in production, `requestId` always returned.    |

## Postman

`docs/stockledger.postman_collection.json`. Set `baseUrl`; the login request
stores `accessToken` into a collection variable and everything else uses it.

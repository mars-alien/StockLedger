-- OrderStatus had a PAID value and so did PaymentStatus, which meant two
-- columns could each claim an order was paid and disagree with each other.
-- Fulfilment and money are now separate: OrderStatus is PLACED or CANCELLED,
-- and paymentStatus is the only authority on whether money arrived.
--
-- Postgres cannot drop a value from an enum, so the type is rebuilt. Any row
-- still carrying the old PAID status keeps its meaning: it was placed, and
-- paymentStatus already records that it was paid.

UPDATE "orders" SET "status" = 'PLACED' WHERE "status" = 'PAID';

ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";

CREATE TYPE "OrderStatus" AS ENUM ('PLACED', 'CANCELLED');

ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "orders"
  ALTER COLUMN "status" TYPE "OrderStatus" USING ("status"::text::"OrderStatus");
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PLACED';

DROP TYPE "OrderStatus_old";

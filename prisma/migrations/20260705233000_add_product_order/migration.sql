-- AlterTable
ALTER TABLE "Product" ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;

-- Backfill existing products per user using the current visible order.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt" DESC) - 1 AS rn
  FROM "Product"
)
UPDATE "Product"
SET "order" = ranked.rn
FROM ranked
WHERE "Product"."id" = ranked."id";

-- CreateIndex
CREATE INDEX "Product_userId_order_idx" ON "Product"("userId", "order");

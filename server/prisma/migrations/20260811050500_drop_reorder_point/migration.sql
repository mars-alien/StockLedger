-- Reorder points existed to drive a low stock alert. There is no alerting in
-- this project, so the threshold had nothing left to trigger and the column
-- was only inviting someone to build one.

ALTER TABLE "productVariants" DROP COLUMN "reorderPoint";

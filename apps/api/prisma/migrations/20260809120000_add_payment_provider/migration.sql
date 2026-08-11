-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'REVOLUT');

-- AlterTable
-- Existing rows all predate Revolut, so STRIPE is the correct backfill as well
-- as the correct default for anything written by an older build.
ALTER TABLE "payments" ADD COLUMN "provider" "PaymentProvider" NOT NULL DEFAULT 'STRIPE';

-- AlterTable
-- Revolut reports refunds one at a time rather than as a running total, so the
-- ids already folded into "refundedAmount" are kept to make replays harmless.
ALTER TABLE "payments" ADD COLUMN "appliedRefundIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

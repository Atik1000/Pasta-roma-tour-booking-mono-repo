-- AlterEnum
-- PayPal joins Stripe and Revolut as a gateway a payment can be opened with.
-- Nothing is backfilled: `provider` is recorded per payment when it is opened,
-- and every existing row belongs to the gateway that is already named on it.
ALTER TYPE "PaymentProvider" ADD VALUE 'PAYPAL';

-- A `transactionId` index is not added: the refund path reaches it through the
-- payment row it already holds, and the table is small enough that the extra
-- write cost on every capture would buy nothing.

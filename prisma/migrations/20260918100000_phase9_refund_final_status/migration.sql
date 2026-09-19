-- Phase 9 review pass (2026-09-18): the Refund row records the status a full
-- refund ends in (REFUNDED, or CANCELLED for an operator cancellation), so an
-- apply step resumed after a crash finishes the order in the state the
-- operator asked for. NULL means REFUNDED.
ALTER TABLE "Refund" ADD COLUMN "finalStatus" TEXT;

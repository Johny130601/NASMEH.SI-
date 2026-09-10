import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), refundFind: vi.fn(), markRefunded: vi.fn(), markPaid: vi.fn(), markFailed: vi.fn() }));
vi.mock("@/lib/payments/paypal-verify", () => ({ verifyPayPalWebhook: mocks.verify }));
vi.mock("@/lib/payments/paypal", () => ({ capturePayPalOrder: vi.fn(), paypalRequest: vi.fn() }));
vi.mock("@/lib/turnstile", () => ({ isTestMode: () => true }));
vi.mock("@/lib/db", () => ({ db: { refund: { findFirst: mocks.refundFind }, order: { findFirst: vi.fn() } } }));
vi.mock("@/lib/orders/transitions", () => ({ markRefunded: mocks.markRefunded, markOrderPaid: mocks.markPaid, markPaymentFailed: mocks.markFailed }));

import { POST } from "@/app/api/webhooks/paypal/route";

const event = (resourceId: string) => new Request("http://localhost/api/webhooks/paypal", {
  method: "POST",
  body: JSON.stringify({ id: `evt-${resourceId}`, event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { id: resourceId, amount: { value: "10.00", currency_code: "EUR" } } }),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.verify.mockResolvedValue(true);
  mocks.markRefunded.mockResolvedValue({ outcome: "ignored" });
});

describe("PayPal refund webhooks after an operator refund", () => {
  it("skips a refund the admin already applied (per-event amounts would double count)", async () => {
    mocks.refundFind.mockResolvedValue({ id: "refund-row" });
    const response = await POST(event("REFUND-1"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, result: { outcome: "already_processed" } });
    expect(mocks.refundFind).toHaveBeenCalledWith({ where: { providerRefundId: "REFUND-1" }, select: { id: true } });
    expect(mocks.markRefunded).not.toHaveBeenCalled();
  });

  it("applies refunds that originated at PayPal", async () => {
    mocks.refundFind.mockResolvedValue(null);
    const response = await POST(event("REFUND-2"));
    expect(response.status).toBe(200);
    expect(mocks.markRefunded).toHaveBeenCalledWith("paypal", "evt-REFUND-2", "REFUND-2", { amountCents: 1000, currency: "EUR" });
  });
});

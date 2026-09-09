import { describe, expect, it } from "vitest";
import { paymentResumeState } from "@/lib/orders/resume-state";

const pending = { ok: true as const, orderNumber: "NS-2026-00001", provider: "stripe" as const, totalCents: 5000 };

describe("confirmation payment recovery", () => {
  it("opens the payment UI for an unpaid intent or recoverable setup failure", () => {
    expect(paymentResumeState({ ...pending, clientSecret: "secret", paymentStatus: "PENDING" })).toBe("payment");
    expect(paymentResumeState({ ...pending, paymentUnavailable: true })).toBe("payment");
  });
  it("waits after provider acceptance without opening another payment attempt", () => {
    expect(paymentResumeState({ ...pending, paymentStatus: "AWAITING_WEBHOOK" })).toBe("waiting");
  });
  it("directs cancelled payment attempts back to checkout", () => {
    expect(paymentResumeState({ ...pending, paymentStatus: "PAYMENT_CANCELLED" })).toBe("cancelled");
  });
  it("refreshes real persisted order statuses instead of making a client-side paid claim", () => {
    for (const paymentStatus of ["PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"]) {
      expect(paymentResumeState({ ...pending, paymentStatus })).toBe("refresh");
    }
  });
  it("shows no provider controls for rejected order access", () => {
    expect(paymentResumeState({ ok: false, error: "order_access" })).toBe("error");
  });
});

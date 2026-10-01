import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 9 review pass: the refund apply step is its own idempotent unit and a
 * row left PENDING by a crash is finished later. These cover the two defects
 * the review found — the money counted twice when the provider's webhook
 * raced the apply, and the refund stuck PENDING for ever when the apply threw.
 */

const mocks = vi.hoisted(() => ({
  restockAlerts: vi.fn(),
  notify: vi.fn(),
  adjustStock: vi.fn(),
}));

vi.mock("@/lib/payments", () => ({ getPaymentProvider: vi.fn() }));
vi.mock("@/lib/jobs/restock-alerts", () => ({ sendPendingRestockAlerts: mocks.restockAlerts }));
vi.mock("@/lib/orders/status-mail", () => ({ notifyOrderStatus: mocks.notify }));
vi.mock("@/lib/inventory/stock", () => ({ adjustVariantStockInTx: mocks.adjustStock }));
vi.mock("@/lib/orders/transitions", () => ({
  // Faithful enough for the assertions: append one entry, keep the earlier ones.
  timelinePush: (order: { timeline?: unknown }, event: string, detail?: string) => [
    ...(Array.isArray(order.timeline) ? order.timeline : []),
    { at: "2026-09-19T00:00:00.000Z", event, ...(detail ? { detail } : {}) },
  ],
}));

interface FakeRefund {
  id: string; orderId: string; status: string; amountCents: number; restock: boolean;
  lines: Array<{ orderItemId: string; quantity: number }>; actorName: string;
  finalStatus: string | null; providerRefundId: string | null; createdAt: Date;
  completedAt?: Date | null; lastError?: string | null;
}
interface FakeOrder {
  id: string; number: string; status: string; totalCents: number; refundedCents: number;
  stockDeducted: boolean; timeline: unknown[]; refundRequired?: boolean; confirmationEmailPending?: boolean;
  items: Array<{ id: string; variantId: string | null; quantity: number; properties: unknown }>;
}

const state: { order: FakeOrder; refunds: FakeRefund[]; variants: Set<string> } = {
  order: null as unknown as FakeOrder, refunds: [], variants: new Set(),
};

const tx = {
  $queryRaw: vi.fn(async () => []),
  order: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
      where.id === state.order.id ? { ...state.order, refunds: state.refunds.map((r) => ({ ...r })) } : null),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(state.order, data);
      return state.order;
    }),
  },
  refund: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => state.refunds.find((r) => r.id === where.id) ?? null),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = state.refunds.find((r) => r.id === where.id);
      if (row) Object.assign(row, data);
      return row;
    }),
  },
  variant: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (state.variants.has(where.id) ? { id: where.id } : null)),
  },
};

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    refund: {
      findMany: vi.fn(async ({ where }: { where: Record<string, { lt?: Date }> & { orderId?: string } }) =>
        state.refunds
          .filter((r) => r.status === "PENDING")
          .filter((r) => !where.orderId || r.orderId === where.orderId)
          .filter((r) => !where.createdAt?.lt || r.createdAt < where.createdAt.lt)
          .map((r) => ({ id: r.id, orderId: r.orderId, providerRefundId: r.providerRefundId }))),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = state.refunds.find((r) => r.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      }),
    },
    order: { findUnique: vi.fn(async () => ({ ...state.order })) },
  },
}));

import { applyRefundInTx, resolvePendingRefunds } from "@/lib/orders/refunds";

const NOW = new Date("2026-09-19T12:00:00.000Z");
const OLD = new Date("2026-09-19T11:00:00.000Z"); // an hour back: past the in-flight grace period
const FRESH = new Date("2026-09-19T11:59:00.000Z"); // a minute back: still possibly in flight

function seed(order: Partial<FakeOrder> = {}, refund: Partial<FakeRefund> = {}) {
  state.order = {
    id: "order-1", number: "NS-2026-00007", status: "PAID", totalCents: 10_000, refundedCents: 0,
    stockDeducted: true, timeline: [{ at: "2026-09-18T00:00:00.000Z", event: "paid" }],
    items: [{ id: "item-1", variantId: "variant-1", quantity: 2, properties: null }],
    ...order,
  };
  state.refunds = [{
    id: "refund-1", orderId: "order-1", status: "PENDING", amountCents: 6_000, restock: false,
    lines: [{ orderItemId: "item-1", quantity: 1 }], actorName: "staff@nasmeh.si",
    finalStatus: null, providerRefundId: "re_provider_1", createdAt: OLD, ...refund,
  }];
  state.variants = new Set(["variant-1", "variant-2"]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adjustStock.mockResolvedValue({ armedAlerts: 0 });
  mocks.notify.mockResolvedValue(undefined);
  mocks.restockAlerts.mockResolvedValue(undefined);
  seed();
});

describe("applyRefundInTx", () => {
  it("books a partial refund once and leaves the order open", async () => {
    const applied = await applyRefundInTx(tx as never, "refund-1");
    expect(applied).toMatchObject({ orderId: "order-1", amountCents: 6_000, full: false, status: "PAID" });
    expect(state.order.refundedCents).toBe(6_000);
    expect(state.order.status).toBe("PAID");
    expect(state.refunds[0].status).toBe("COMPLETED");
    expect(state.order.timeline.at(-1)).toMatchObject({ event: "partially_refunded", detail: "cents:6000:staff@nasmeh.si" });
    // The paid entry survives: the timeline is appended to, never replaced.
    expect(state.order.timeline).toHaveLength(2);
  });

  it("refuses to book the same row twice, so a webhook that raced the apply cannot double-count", async () => {
    await applyRefundInTx(tx as never, "refund-1");
    expect(state.order.refundedCents).toBe(6_000);

    // The provider's refund webhook has meanwhile written its own total.
    state.order.refundedCents = 6_000;
    const second = await applyRefundInTx(tx as never, "refund-1");

    expect(second).toBeNull();
    expect(state.order.refundedCents).toBe(6_000);
    expect(state.order.status).toBe("PAID");
    expect(state.order.timeline).toHaveLength(2);
  });

  it("closes a full refund as REFUNDED and clears the pending mail flags", async () => {
    seed({ refundedCents: 4_000, refundRequired: true, confirmationEmailPending: true });
    const applied = await applyRefundInTx(tx as never, "refund-1");
    expect(applied).toMatchObject({ full: true, status: "REFUNDED" });
    expect(state.order).toMatchObject({ refundedCents: 10_000, status: "REFUNDED", refundRequired: false, confirmationEmailPending: false });
  });

  it("ends a cancellation in CANCELLED even when the apply is resumed later", async () => {
    seed({}, { amountCents: 10_000, finalStatus: "CANCELLED" });
    const applied = await applyRefundInTx(tx as never, "refund-1");
    expect(applied).toMatchObject({ full: true, status: "CANCELLED" });
    expect(state.order.status).toBe("CANCELLED");
    expect(state.order.timeline.at(-1)).toMatchObject({ event: "cancelled" });
  });

  it("settles a captured payment owed on a CANCELLED order: flag cleared, logged and mailed as a refund, not a second cancellation (QA M3)", async () => {
    seed({ status: "CANCELLED", stockDeducted: false, refundRequired: true }, { amountCents: 10_000, finalStatus: "CANCELLED", restock: false });
    const applied = await applyRefundInTx(tx as never, "refund-1");
    expect(applied).toMatchObject({ full: true, status: "CANCELLED", event: "refunded" });
    expect(state.order).toMatchObject({ status: "CANCELLED", refundedCents: 10_000, refundRequired: false });
    expect(state.order.timeline.at(-1)).toMatchObject({ event: "refunded", detail: "cents:10000:staff@nasmeh.si" });
    expect(mocks.adjustStock).not.toHaveBeenCalled();
  });

  it("restocks a bundle line through the stock helper", async () => {
    seed(
      { items: [{ id: "item-1", variantId: "bundle-variant", quantity: 1, properties: { bundleComponents: [{ variantId: "variant-1", quantity: 2 }, { variantId: "variant-2", quantity: 1 }] } }] },
      { restock: true },
    );
    mocks.adjustStock.mockResolvedValue({ armedAlerts: 1 });
    const applied = await applyRefundInTx(tx as never, "refund-1");
    expect(mocks.adjustStock).toHaveBeenCalledTimes(2);
    expect(mocks.adjustStock).toHaveBeenCalledWith(tx, "variant-1", 2);
    expect(mocks.adjustStock).toHaveBeenCalledWith(tx, "variant-2", 1);
    expect(applied?.armed).toBe(2);
  });

  it("skips a component variant deleted since the order and notes it, instead of failing the refund", async () => {
    seed(
      { items: [{ id: "item-1", variantId: "bundle-variant", quantity: 1, properties: { bundleComponents: [{ variantId: "variant-1", quantity: 1 }, { variantId: "deleted-variant", quantity: 1 }] } }] },
      { restock: true },
    );
    const applied = await applyRefundInTx(tx as never, "refund-1");
    expect(applied?.skippedVariants).toBe(1);
    expect(mocks.adjustStock).toHaveBeenCalledTimes(1);
    expect(state.refunds[0].status).toBe("COMPLETED");
    expect(state.order.refundedCents).toBe(6_000);
    expect(state.order.timeline.at(-1)).toMatchObject({ event: "restock_skipped", detail: "variants:1:staff@nasmeh.si" });
  });

  it("does not restock when the order never deducted stock", async () => {
    seed({ stockDeducted: false }, { restock: true });
    await applyRefundInTx(tx as never, "refund-1");
    expect(mocks.adjustStock).not.toHaveBeenCalled();
  });
});

describe("resolvePendingRefunds", () => {
  it("applies a row whose money the provider already accepted", async () => {
    const result = await resolvePendingRefunds(undefined, NOW);
    expect(result).toEqual({ applied: 1, interrupted: 0, failed: 0 });
    expect(state.order.refundedCents).toBe(6_000);
    expect(state.refunds[0].status).toBe("COMPLETED");
    expect(mocks.notify).toHaveBeenCalledWith("order-1", "refunded", { amountCents: 6_000 });
  });

  it("closes a row the provider never accepted as failed, and moves no money", async () => {
    seed({}, { providerRefundId: null });
    const result = await resolvePendingRefunds(undefined, NOW);
    expect(result).toEqual({ applied: 0, interrupted: 1, failed: 0 });
    expect(state.refunds[0]).toMatchObject({ status: "FAILED", lastError: "interrupted" });
    expect(state.order.refundedCents).toBe(0);
    expect(state.order.status).toBe("PAID");
    expect(state.order.timeline.at(-1)).toMatchObject({ event: "refund_interrupted" });
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("leaves a row inside the in-flight grace period alone", async () => {
    seed({}, { createdAt: FRESH });
    const result = await resolvePendingRefunds(undefined, NOW);
    expect(result).toEqual({ applied: 0, interrupted: 0, failed: 0 });
    expect(state.refunds[0].status).toBe("PENDING");
  });

  it("counts a row it could not resolve and logs the error name only", async () => {
    const error = new Error("kupec@test.si could not be locked");
    error.name = "PrismaClientKnownRequestError";
    tx.order.findUnique.mockRejectedValueOnce(error);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await resolvePendingRefunds(undefined, NOW);

    expect(result).toEqual({ applied: 0, interrupted: 0, failed: 1 });
    expect(logged).toHaveBeenCalledWith("Pending refund left unresolved", "PrismaClientKnownRequestError");
    expect(JSON.stringify(logged.mock.calls)).not.toContain("kupec@test.si");
    logged.mockRestore();
  });

  it("scopes to one order when asked", async () => {
    await resolvePendingRefunds("another-order", NOW);
    expect(state.refunds[0].status).toBe("PENDING");
  });
});

import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { prisma, signWebhook, WEBHOOK_SECRETS } from "./helpers";

/**
 * Phase 3 acceptance regressions. Fixtures are private to each test; no seed
 * stock, shared order counter, customer accounts, or settings are changed.
 * These assert the intended behavior, including gaps in the current handlers.
 */
function fixtureIds() {
  const key = randomUUID();
  return {
    key,
    orderId: `p3-order-${key}`,
    number: `NS-P3-${key}`,
    productId: `p3-product-${key}`,
    variantId: `p3-variant-${key}`,
    bundleProductId: `p3-bundle-product-${key}`,
    bundleVariantId: `p3-bundle-variant-${key}`,
    intentId: `p3-intent-${key}`,
    eventIds: Array.from({ length: 6 }, (_, index) => `evt_p3_${key}_${index}`),
  };
}

type Fixture = ReturnType<typeof fixtureIds>;

async function createFixture(
  fixture: Fixture,
  options: { stock: number; provider?: "stripe" | "paypal"; withBundle?: boolean },
) {
  const provider = options.provider ?? "stripe";
  await prisma.product.create({
    data: {
      id: fixture.productId,
      title: "Phase 3 acceptance component",
      slug: `p3-component-${fixture.key}`,
      status: "ACTIVE",
      visibleInCatalog: false,
      visibleInSearch: false,
      variants: {
        create: {
          id: fixture.variantId,
          title: "Phase 3 acceptance component",
          sku: `P3-SINGLE-${fixture.key}`,
          priceCents: 1000,
          stock: options.stock,
        },
      },
    },
  });

  if (options.withBundle) {
    await prisma.product.create({
      data: {
        id: fixture.bundleProductId,
        title: "Phase 3 acceptance bundle",
        slug: `p3-bundle-${fixture.key}`,
        status: "ACTIVE",
        visibleInCatalog: false,
        visibleInSearch: false,
        variants: {
          create: {
            id: fixture.bundleVariantId,
            sku: `P3-BUNDLE-${fixture.key}`,
            priceCents: 900,
            stock: 10,
            maxCartQuantity: 1,
          },
        },
        bundle: {
          create: {
            priceCents: 900,
            items: { create: { variantId: fixture.variantId, quantity: 1 } },
          },
        },
      },
    });
  }

  const totalCents = options.withBundle ? 1900 : 1000;
  await prisma.order.create({
    data: {
      id: fixture.orderId,
      number: fixture.number,
      email: `p3-${fixture.key}@test.si`,
      status: "PENDING",
      paymentProvider: provider,
      ...(provider === "stripe"
        ? { stripePaymentIntentId: fixture.intentId }
        : { paypalOrderId: fixture.intentId }),
      subtotalCents: totalCents,
      totalCents,
      vatCents: totalCents - Math.round(totalCents / 1.22),
      shippingAddress: { fullName: "Phase 3 acceptance test", country: "SI" },
      items: {
        create: [
          {
            variantId: fixture.variantId,
            title: "Phase 3 acceptance component",
            sku: `P3-SINGLE-${fixture.key}`,
            unitPriceCents: 1000,
            quantity: 1,
          },
          ...(options.withBundle
            ? [{
                variantId: fixture.bundleVariantId,
                title: "Phase 3 acceptance bundle",
                sku: `P3-BUNDLE-${fixture.key}`,
                unitPriceCents: 900,
                quantity: 1,
                properties: {
                  bundleComponents: [{ variantId: fixture.variantId, quantity: 1 }],
                },
              }]
            : []),
        ],
      },
    },
  });
}

async function cleanup(fixture: Fixture) {
  // Exact IDs only; order items and bundle definitions cascade with fixtures.
  await prisma.order.deleteMany({ where: { id: fixture.orderId } });
  await prisma.product.deleteMany({
    where: { id: { in: [fixture.productId, fixture.bundleProductId] } },
  });
  await prisma.processedEvent.deleteMany({
    where: { eventId: { in: fixture.eventIds } },
  });
}

async function sendStripeSuccess(
  request: APIRequestContext,
  fixture: Fixture,
  eventId: string,
  amountCents = 1000,
  currency = "eur",
) {
  const body = JSON.stringify({
    id: eventId,
    type: "payment_intent.succeeded",
    data: { object: { id: fixture.intentId, amount_received: amountCents, currency } },
  });
  return request.post("/api/webhooks/stripe", {
    data: body,
    headers: {
      "content-type": "application/json",
      "stripe-signature": signWebhook(body, WEBHOOK_SECRETS.stripe),
    },
  });
}

async function sendStripeCancellation(request: APIRequestContext, fixture: Fixture, eventId: string) {
  const body = JSON.stringify({ id: eventId, type: "payment_intent.canceled", data: { object: { id: fixture.intentId } } });
  return request.post("/api/webhooks/stripe", {
    data: body,
    headers: { "content-type": "application/json", "stripe-signature": signWebhook(body, WEBHOOK_SECRETS.stripe) },
  });
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("bundle plus standalone component requires their combined stock", async ({ request }) => {
  const fixture = fixtureIds();
  try {
    await createFixture(fixture, { stock: 1, withBundle: true });
    const response = await sendStripeSuccess(request, fixture, fixture.eventIds[0], 1900);
    expect(response.ok()).toBe(true);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } });
    const variant = await prisma.variant.findUniqueOrThrow({ where: { id: fixture.variantId } });
    expect.soft(order.status).toBe("CANCELLED");
    expect.soft(order.stockDeducted).toBe(false);
    expect.soft(order.invoiceNumber).toBeNull();
    expect.soft(order.paidAt).not.toBeNull();
    expect.soft(order.refundRequired).toBe(true);
    expect.soft(order.fulfillmentIssue).toContain("stockout:");
    expect.soft(order.confirmationEmailPending).toBe(false);
    expect.soft(variant.stock).toBe(1);
  } finally {
    await cleanup(fixture);
  }
});

test("simultaneous distinct success events deduct the same order only once", async ({ request }) => {
  const fixture = fixtureIds();
  try {
    await createFixture(fixture, { stock: 3 });
    const responses = await Promise.all([
      sendStripeSuccess(request, fixture, fixture.eventIds[0]),
      sendStripeSuccess(request, fixture, fixture.eventIds[1]),
    ]);
    for (const response of responses) expect(response.ok()).toBe(true);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } });
    const variant = await prisma.variant.findUniqueOrThrow({ where: { id: fixture.variantId } });
    expect(order.status).toBe("PAID");
    expect(variant.stock).toBe(2);
    expect((order.timeline as Array<{ event: string }>).filter((event) => event.event === "paid")).toHaveLength(1);
    expect(await prisma.processedEvent.count({ where: { eventId: { in: fixture.eventIds } } })).toBe(2);
  } finally {
    await cleanup(fixture);
  }
});

test("competing captured orders cannot oversell the last unit", async ({ request }) => {
  const first = fixtureIds();
  const second = fixtureIds();
  try {
    await createFixture(first, { stock: 1 });
    await createFixture(second, { stock: 1 });
    await prisma.orderItem.updateMany({
      where: { orderId: second.orderId },
      data: { variantId: first.variantId },
    });
    const responses = await Promise.all([
      sendStripeSuccess(request, first, first.eventIds[0]),
      sendStripeSuccess(request, second, second.eventIds[0]),
    ]);
    for (const response of responses) expect(response.ok()).toBe(true);
    const orders = await prisma.order.findMany({ where: { id: { in: [first.orderId, second.orderId] } } });
    expect(orders.map((order) => order.status).sort()).toEqual(["CANCELLED", "PAID"]);
    expect(orders.every((order) => order.paidAt !== null)).toBe(true);
    expect(orders.filter((order) => order.stockDeducted)).toHaveLength(1);
    expect(orders.find((order) => order.status === "CANCELLED")?.refundRequired).toBe(true);
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: first.variantId } })).stock).toBe(0);
  } finally {
    await cleanup(second);
    await cleanup(first);
  }
});

test("transaction failure rolls back its event marker and stock, then the same event can retry", async ({ request }) => {
  const fixture = fixtureIds();
  const blocker = fixtureIds();
  try {
    await createFixture(fixture, { stock: 3 });
    await createFixture(blocker, { stock: 1 });
    // A private invoice-number collision fails the order update AFTER the
    // stock mutation, without changing schema or installing fault hooks.
    await prisma.order.update({ where: { id: blocker.orderId }, data: { invoiceNumber: fixture.number } });
    const failed = await sendStripeSuccess(request, fixture, fixture.eventIds[0]);
    expect(failed.status()).toBeGreaterThanOrEqual(500);
    const pending = await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } });
    expect(pending.status).toBe("PENDING");
    expect(pending.stockDeducted).toBe(false);
    expect(pending.invoiceNumber).toBeNull();
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: fixture.variantId } })).stock).toBe(3);
    expect(await prisma.processedEvent.count({ where: { eventId: fixture.eventIds[0] } })).toBe(0);

    await prisma.order.update({ where: { id: blocker.orderId }, data: { invoiceNumber: null } });
    const retried = await sendStripeSuccess(request, fixture, fixture.eventIds[0]);
    expect(retried.ok()).toBe(true);
    expect((await retried.json()).result.outcome).toBe("paid");
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: fixture.variantId } })).stock).toBe(2);
    expect(await prisma.processedEvent.count({ where: { eventId: fixture.eventIds[0] } })).toBe(1);
  } finally {
    await cleanup(blocker);
    await cleanup(fixture);
  }
});

test("amount and currency mismatches leave the order and event retryable", async ({ request }) => {
  const fixture = fixtureIds();
  try {
    await createFixture(fixture, { stock: 3 });
    const wrongAmount = await sendStripeSuccess(request, fixture, fixture.eventIds[0], 999);
    expect(wrongAmount.ok()).toBe(false);
    const wrongCurrency = await sendStripeSuccess(request, fixture, fixture.eventIds[0], 1000, "usd");
    expect(wrongCurrency.ok()).toBe(false);
    expect(await prisma.processedEvent.count({ where: { eventId: fixture.eventIds[0] } })).toBe(0);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } })).status).toBe("PENDING");
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: fixture.variantId } })).stock).toBe(3);

    const correct = await sendStripeSuccess(request, fixture, fixture.eventIds[0]);
    expect(correct.ok()).toBe(true);
    expect((await correct.json()).result.outcome).toBe("paid");
  } finally {
    await cleanup(fixture);
  }
});

test("a Stripe event cannot pay an order belonging to PayPal", async ({ request }) => {
  const fixture = fixtureIds();
  try {
    await createFixture(fixture, { stock: 3, provider: "paypal" });
    const response = await sendStripeSuccess(request, fixture, fixture.eventIds[0]);
    expect(response.ok()).toBe(false);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } })).status).toBe("PENDING");
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: fixture.variantId } })).stock).toBe(3);
    expect(await prisma.processedEvent.count({ where: { eventId: fixture.eventIds[0] } })).toBe(0);
  } finally {
    await cleanup(fixture);
  }
});

test("partial and cumulative full refunds preserve stock and never revive a refunded order", async ({ request }) => {
  const fixture = fixtureIds();
  const refund = async (eventId: string, amountRefunded: number) => {
    const body = JSON.stringify({
      id: eventId,
      type: "charge.refunded",
      data: { object: {
        id: `ch_${fixture.key}`,
        payment_intent: fixture.intentId,
        amount: 1000,
        amount_refunded: amountRefunded,
        currency: "eur",
      } },
    });
    return request.post("/api/webhooks/stripe", {
      data: body,
      headers: { "content-type": "application/json", "stripe-signature": signWebhook(body, WEBHOOK_SECRETS.stripe) },
    });
  };
  try {
    await createFixture(fixture, { stock: 3 });
    expect((await sendStripeSuccess(request, fixture, fixture.eventIds[0])).ok()).toBe(true);
    expect((await refund(fixture.eventIds[1], 400)).ok()).toBe(true);
    const partial = await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } });
    expect(partial.status).toBe("PAID");
    expect(partial.refundedCents).toBe(400);
    expect((await refund(fixture.eventIds[2], 400)).ok()).toBe(true);
    expect((await refund(fixture.eventIds[3], 1000)).ok()).toBe(true);
    expect((await sendStripeSuccess(request, fixture, fixture.eventIds[4])).ok()).toBe(true);
    const full = await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } });
    expect(full.status).toBe("REFUNDED");
    expect(full.refundedCents).toBe(1000);
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: fixture.variantId } })).stock).toBe(2);
  } finally {
    await cleanup(fixture);
  }
});

test("uncaptured cancellation is idempotent and a late capture requires a refund without touching stock", async ({ request }) => {
  const fixture = fixtureIds();
  try {
    await createFixture(fixture, { stock: 3 });
    expect((await sendStripeCancellation(request, fixture, fixture.eventIds[0])).ok()).toBe(true);
    expect((await sendStripeCancellation(request, fixture, fixture.eventIds[0])).ok()).toBe(true);
    const cancelled = await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.paidAt).toBeNull();
    expect(cancelled.refundRequired).toBe(false);
    expect(cancelled.stockDeducted).toBe(false);
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: fixture.variantId } })).stock).toBe(3);
    expect(await prisma.processedEvent.count({ where: { eventId: fixture.eventIds[0] } })).toBe(1);

    expect((await sendStripeSuccess(request, fixture, fixture.eventIds[1])).ok()).toBe(true);
    const captured = await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } });
    expect(captured.status).toBe("CANCELLED");
    expect(captured.paidAt).not.toBeNull();
    expect(captured.refundRequired).toBe(true);
    expect(captured.fulfillmentIssue).toBe("payment_received_after_cancellation");
    expect(captured.stockDeducted).toBe(false);
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: fixture.variantId } })).stock).toBe(3);
  } finally {
    await cleanup(fixture);
  }
});

test("a late cancellation event cannot reverse a captured order", async ({ request }) => {
  const fixture = fixtureIds();
  try {
    await createFixture(fixture, { stock: 3 });
    expect((await sendStripeSuccess(request, fixture, fixture.eventIds[0])).ok()).toBe(true);
    expect((await sendStripeCancellation(request, fixture, fixture.eventIds[1])).ok()).toBe(true);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } });
    expect(order.status).toBe("PAID");
    expect(order.stockDeducted).toBe(true);
    expect(order.refundRequired).toBe(false);
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: fixture.variantId } })).stock).toBe(2);
  } finally {
    await cleanup(fixture);
  }
});

test("a new success event cannot regress a processing order or deduct stock again", async ({ request }) => {
  const fixture = fixtureIds();
  try {
    await createFixture(fixture, { stock: 3 });
    const first = await sendStripeSuccess(request, fixture, fixture.eventIds[0]);
    expect(first.ok()).toBe(true);
    expect((await first.json()).result.outcome).toBe("paid");

    const paid = await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } });
    expect(paid.stockDeducted).toBe(true);
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: fixture.variantId } })).stock).toBe(2);
    await prisma.order.update({ where: { id: fixture.orderId }, data: { status: "PROCESSING" } });

    // A distinct event ID bypasses the simple same-event replay guard.
    const duplicate = await sendStripeSuccess(request, fixture, fixture.eventIds[1]);
    expect(duplicate.ok()).toBe(true);
    const after = await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } });
    const variant = await prisma.variant.findUniqueOrThrow({ where: { id: fixture.variantId } });
    expect.soft(after.status).toBe("PROCESSING");
    expect.soft(variant.stock).toBe(2);
    expect.soft(after.paidAt).toEqual(paid.paidAt);
    expect.soft(after.invoiceIssuedAt).toEqual(paid.invoiceIssuedAt);
  } finally {
    await cleanup(fixture);
  }
});

test("PayPal approval without capture cannot mark an order paid", async ({ request }) => {
  const fixture = fixtureIds();
  try {
    await createFixture(fixture, { stock: 3, provider: "paypal" });
    const body = JSON.stringify({
      id: fixture.eventIds[0],
      event_type: "CHECKOUT.ORDER.APPROVED",
      resource: { id: fixture.intentId, status: "APPROVED" },
    });
    const response = await request.post("/api/webhooks/paypal", {
      data: body,
      headers: {
        "content-type": "application/json",
        "x-webhook-signature": signWebhook(body, WEBHOOK_SECRETS.paypal),
      },
    });
    expect(response.ok()).toBe(true);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } });
    const variant = await prisma.variant.findUniqueOrThrow({ where: { id: fixture.variantId } });
    expect.soft(order.status).toBe("PENDING");
    expect.soft(order.stockDeducted).toBe(false);
    expect.soft(order.invoiceNumber).toBeNull();
    expect.soft(variant.stock).toBe(3);
  } finally {
    await cleanup(fixture);
  }
});

for (const eventType of ["PAYMENT.CAPTURE.DECLINED", "PAYMENT.CAPTURE.DENIED"]) {
  test(`${eventType} records a failed attempt without deducting stock`, async ({ request }) => {
    const fixture = fixtureIds();
    try {
      await createFixture(fixture, { stock: 3, provider: "paypal" });
      const body = JSON.stringify({ id: fixture.eventIds[0], event_type: eventType,
        resource: { id: `capture-${fixture.key}`, supplementary_data: { related_ids: { order_id: fixture.intentId } } } });
      const send = () => request.post("/api/webhooks/paypal", { data: body,
        headers: { "content-type": "application/json", "x-webhook-signature": signWebhook(body, WEBHOOK_SECRETS.paypal) } });
      expect((await send()).ok()).toBe(true);
      expect((await send()).ok()).toBe(true);
      const order = await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } });
      expect(order.status).toBe("PENDING");
      expect(order.paidAt).toBeNull();
      expect((order.timeline as Array<{ event: string }>).filter(value => value.event === "payment_failed")).toHaveLength(1);
      expect((await prisma.variant.findUniqueOrThrow({ where: { id: fixture.variantId } })).stock).toBe(3);
    } finally { await cleanup(fixture); }
  });
}

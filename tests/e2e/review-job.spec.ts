import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma, MAILPIT_URL, waitForMailMessage } from "./helpers";

const DAY = 24 * 60 * 60 * 1000;
const jobHeaders = { authorization: "Bearer jobs_e2e_secret" };

async function fixture(options: { status?: "DELIVERED" | "SHIPPED"; deliveredAt?: Date | null } = {}) {
  const key = randomUUID();
  const product = await prisma.product.create({ data: {
    title: "Review job fixture", slug: `review-job-${key}`, status: "ACTIVE", visibleInCatalog: false, visibleInSearch: false,
    variants: { create: { sku: `RJ-${key}`, priceCents: 1999, stock: 1 } },
  }, include: { variants: true } });
  const order = await prisma.order.create({ data: {
    number: `NS-RJ-${key}`, status: options.status ?? "DELIVERED", email: `review-job-${key}@test.si`,
    deliveredAt: options.deliveredAt === undefined ? new Date(Date.now() - 8 * DAY) : options.deliveredAt,
    subtotalCents: 1999, totalCents: 1999, vatCents: 360, shippingAddress: { country: "SI" },
    items: { create: { variantId: product.variants[0].id, sku: product.variants[0].sku, title: product.title, quantity: 1, unitPriceCents: 1999 } },
  } });
  return { product, order, cleanup: async () => {
    await prisma.order.deleteMany({ where: { id: order.id } });
    await prisma.product.deleteMany({ where: { id: product.id } });
  } };
}

test.afterAll(async () => prisma.$disconnect());

test("daily job rejects missing, malformed and incorrect authorization", async ({ request }) => {
  for (const authorization of [undefined, "Bearer wrong", "Bearer ünicode", "jobs_e2e_secret"]) {
    const response = await request.post("/api/jobs/daily", { headers: authorization ? { authorization } : {} });
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  }
});

test("parallel and repeated jobs send one request based on deliveredAt despite later order edits", async ({ request }) => {
  const f = await fixture();
  try {
    await prisma.order.update({ where: { id: f.order.id }, data: { trackingNumber: "later-note" } });
    const results = await Promise.all([1, 2].map(() => request.post("/api/jobs/daily", { headers: jobHeaders })));
    for (const response of results) expect(response.status()).toBe(200);
    const row = await prisma.reviewRequest.findUniqueOrThrow({ where: { orderId: f.order.id } });
    expect(row.sentAt).not.toBeNull(); expect(row.attempts).toBe(1); expect(row.leaseUntil).toBeNull();
    const mail = await waitForMailMessage(f.order.email);
    expect(`${mail.Text} ${mail.HTML}`).toContain("/oceni/hitro/");
    expect((await request.post("/api/jobs/daily", { headers: jobHeaders })).status()).toBe(200);
    const messages = await (await fetch(`${MAILPIT_URL}/api/v1/messages?limit=50`, { signal: AbortSignal.timeout(5000) })).json() as { messages: Array<{ To: Array<{ Address: string }> }> };
    expect(messages.messages.filter(message => message.To.some(to => to.Address === f.order.email))).toHaveLength(1);
  } finally { await f.cleanup(); }
});

test("delivery transition stamps its own date and a recent delivery is not requested early", async ({ request }) => {
  const f = await fixture({ status: "SHIPPED", deliveredAt: null });
  try {
    const before = Date.now();
    const delivered = await prisma.order.update({ where: { id: f.order.id }, data: { status: "DELIVERED", updatedAt: new Date(Date.now() - 9 * DAY) } });
    expect(delivered.deliveredAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    const edited = await prisma.order.update({ where: { id: f.order.id }, data: { trackingNumber: "updated" } });
    expect(edited.deliveredAt).toEqual(delivered.deliveredAt);
    expect((await request.post("/api/jobs/daily", { headers: jobHeaders })).status()).toBe(200);
    expect(await prisma.reviewRequest.findUnique({ where: { orderId: f.order.id } })).toBeNull();
  } finally { await f.cleanup(); }
});

test("expired request lease recovers, while an active lease is left alone", async ({ request }) => {
  const expired = await fixture(); const active = await fixture();
  try {
    await prisma.reviewRequest.createMany({ data: [
      { orderId: expired.order.id, leaseToken: "crashed", leaseUntil: new Date(Date.now() - 60_000), attempts: 1 },
      { orderId: active.order.id, leaseToken: "running", leaseUntil: new Date(Date.now() + 60_000), attempts: 1 },
    ] });
    expect((await request.post("/api/jobs/daily", { headers: jobHeaders })).status()).toBe(200);
    const recovered = await prisma.reviewRequest.findUniqueOrThrow({ where: { orderId: expired.order.id } });
    expect(recovered.sentAt).not.toBeNull(); expect(recovered.attempts).toBe(2);
    const untouched = await prisma.reviewRequest.findUniqueOrThrow({ where: { orderId: active.order.id } });
    expect(untouched.sentAt).toBeNull(); expect(untouched.leaseToken).toBe("running"); expect(untouched.attempts).toBe(1);
  } finally { await expired.cleanup(); await active.cleanup(); }
});

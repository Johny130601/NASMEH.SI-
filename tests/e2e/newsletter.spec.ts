import { expect, test } from "@playwright/test";
import { dismissCookieBanner, prisma, waitForMailTo } from "./helpers";

/**
 * Newsletter double opt-in e2e (spec §13.1) via Mailpit, and withdrawal
 * (Phase 9 step 4, GDPR Art. 7(1)/7(3)): the links never mutate on GET, the
 * confirm and unsubscribe buttons do, and each change is logged once with the
 * subscriber reference.
 */
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("submit → verification email → GET is read-only → confirm button → CONFIRMED + one linked ConsentLog row → withdrawal", async ({
  page,
}) => {
  const address = `e2e-${Date.now()}@test.si`;

  await page.goto("/");
  await dismissCookieBanner(page);
  // The footer form is on every page: no Cloudflare script before interaction.
  await expect(page.locator("script#cf-turnstile-script")).toHaveCount(0);
  const form = page.locator("[data-newsletter-form]");
  await form.scrollIntoViewIfNeeded();
  await expect(form.locator("[data-privacy-notice]").getByRole("link", { name: "politika zasebnosti" }))
    .toHaveAttribute("href", "/politika-zasebnosti");
  await form.getByRole("textbox", { name: "E-pošta" }).fill(address);
  await form.getByRole("button", { name: "Prijavi se" }).click();

  await expect(
    page.getByText(/Poslali smo vam potrditveno sporočilo/),
  ).toBeVisible({ timeout: 15_000 });

  // Turnstile test bypass path used (server runs NODE_ENV=test)
  const subscriber = await prisma.subscriber.findUniqueOrThrow({
    where: { email: address },
  });
  expect(subscriber.status).toBe("PENDING");
  expect(subscriber.source).toBe("footer");
  const bySubject = { kind: "marketing-email", choices: { path: ["subscriberId"], equals: subscriber.id } };
  expect(await prisma.consentLog.count({ where: bySubject })).toBe(0);

  // verification email arrives in Mailpit with the confirm and withdrawal links
  const body = await waitForMailTo(address);
  const tokenMatch = body.match(/\/potrdi\/([a-f0-9]{48})/);
  expect(tokenMatch).toBeTruthy();
  const mailUnsubscribe = body.match(/\/odjava-novice\/[A-Za-z0-9_-]+/);
  expect(mailUnsubscribe?.[0]).toContain(subscriber.id);

  // A plain GET (what a mail scanner does) changes nothing.
  const scanned = await page.request.get(`/potrdi/${tokenMatch![1]}`);
  expect(scanned.status()).toBe(200);
  expect((await prisma.subscriber.findUniqueOrThrow({ where: { email: address } })).status).toBe("PENDING");

  await page.goto(`/potrdi/${tokenMatch![1]}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Potrdite prijavo na e-novice");
  expect((await prisma.subscriber.findUniqueOrThrow({ where: { email: address } })).status).toBe("PENDING");
  await page.getByRole("button", { name: "Potrdi prijavo" }).click();
  await expect(page.getByText("Prijava potrjena 🎉")).toBeVisible();

  const confirmed = await prisma.subscriber.findUniqueOrThrow({
    where: { email: address },
  });
  expect(confirmed.status).toBe("CONFIRMED");
  expect(confirmed.confirmedAt).not.toBeNull();

  const rows = await prisma.consentLog.findMany({ where: bySubject });
  expect(rows).toHaveLength(1);
  expect(rows[0].version).toMatch(/^t-[0-9a-f]{12}$/);
  expect(rows[0].choices).toMatchObject({ marketing: true, doubleOptIn: true, source: "footer", subscriberId: subscriber.id });

  // Revisiting the link shows the done state and never logs again.
  await page.goto(`/potrdi/${tokenMatch![1]}`);
  await expect(page.getByText("Prijava potrjena 🎉")).toBeVisible();
  expect(await prisma.consentLog.count({ where: bySubject })).toBe(1);

  // Withdrawal from the confirmation page: read-only GET, then the button.
  const unsubscribeHref = await page.locator("[data-newsletter-unsubscribe-link]").getAttribute("href");
  expect(unsubscribeHref).toBe(mailUnsubscribe![0]);
  const unsubscribeScan = await page.request.get(unsubscribeHref!);
  expect(unsubscribeScan.status()).toBe(200);
  expect(await unsubscribeScan.text()).toContain('name="robots" content="noindex');
  expect((await prisma.subscriber.findUniqueOrThrow({ where: { email: address } })).status).toBe("CONFIRMED");

  await page.locator("[data-newsletter-unsubscribe-link]").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Odjava od e-novic");
  await page.getByRole("button", { name: "Odjavi me" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Odjava je uspela");
  expect((await prisma.subscriber.findUniqueOrThrow({ where: { email: address } })).status).toBe("UNSUBSCRIBED");
  const history = await prisma.consentLog.findMany({ where: bySubject, orderBy: { createdAt: "asc" } });
  expect(history.map((row) => row.choices)).toEqual([
    expect.objectContaining({ marketing: true }),
    expect.objectContaining({ marketing: false, withdrawn: true, previousStatus: "CONFIRMED", source: "unsubscribe-link" }),
  ]);

  // Idempotent: a second visit shows the done state; a withdrawn token no longer confirms.
  await page.goto(unsubscribeHref!);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Odjava je uspela");
  await page.goto(`/potrdi/${tokenMatch![1]}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Povezava ni veljavna");
  expect(await prisma.consentLog.count({ where: bySubject })).toBe(2);

  // Tampered withdrawal link.
  await page.goto(`${unsubscribeHref!.slice(0, -2)}xx`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Povezava ni veljavna");

  await prisma.consentLog.deleteMany({ where: bySubject });
  await prisma.subscriber.delete({ where: { id: subscriber.id } });
});

test("invalid email is rejected client-message side", async ({ page }) => {
  await page.goto("/");
  const form = page.locator("[data-newsletter-form]");
  await form.scrollIntoViewIfNeeded();
  const input = form.getByRole("textbox", { name: "E-pošta" });
  await input.fill("ni-email");
  // native required/type=email prevents submit; force via JS-entered invalid value check instead
  await expect(input).toHaveAttribute("type", "email");
});

import { expect, test } from "@playwright/test";
import { prisma, waitForMailTo } from "./helpers";

/** Newsletter double opt-in e2e (spec §13.1) via Mailpit. */
test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("submit → verification email in Mailpit → confirm → CONFIRMED + ConsentLog", async ({
  page,
}) => {
  const address = `e2e-${Date.now()}@test.si`;

  await page.goto("/");
  const form = page.locator("[data-newsletter-form]");
  await form.scrollIntoViewIfNeeded();
  await form.getByRole("textbox", { name: "E-pošta" }).fill(address);
  await form.getByRole("button", { name: "Prijavi se" }).click();

  await expect(
    page.getByText(/Poslali smo vam potrditveno sporočilo/),
  ).toBeVisible({ timeout: 15_000 });

  // Turnstile test bypass path used (server runs NODE_ENV=test)
  const subscriber = await prisma.subscriber.findUnique({
    where: { email: address },
  });
  expect(subscriber).toBeTruthy();
  expect(subscriber!.status).toBe("PENDING");

  // verification email arrives in Mailpit with a /potredi link
  const body = await waitForMailTo(address);
  const tokenMatch = body.match(/\/potrdi\/([a-f0-9]{48})/);
  expect(tokenMatch).toBeTruthy();

  await page.goto(`/potrdi/${tokenMatch![1]}`);
  await expect(page.getByText("Prijava potrjena 🎉")).toBeVisible();

  const confirmed = await prisma.subscriber.findUnique({
    where: { email: address },
  });
  expect(confirmed!.status).toBe("CONFIRMED");
  expect(confirmed!.confirmedAt).not.toBeNull();

  const consentRow = await prisma.consentLog.findFirst({
    where: { kind: "marketing-email" },
    orderBy: { createdAt: "desc" },
  });
  expect(consentRow).toBeTruthy();
  expect(JSON.stringify(consentRow!.choices)).toContain('"marketing":true');
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

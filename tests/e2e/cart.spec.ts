import { expect, test, type Page } from "@playwright/test";
import { prisma } from "./helpers";

/** /cart e2e (§7.1) + merge-on-login + tamper. Serial: shared guest/DB state. */
test.describe.configure({ mode: "serial" });

const CUSTOMER = { email: "customer@nasmeh.si", password: "Customer123!" };

async function dismissCmp(page: Page) {
  const banner = page.getByRole("dialog", { name: /piškotki/i });
  if (await banner.isVisible().catch(() => false)) {
    await banner.getByRole("button", { name: "Zavrni" }).click();
    await banner.waitFor({ state: "hidden" });
  }
}

async function clearCartUi(page: Page) {
  await page.goto("/cart");
  while ((await page.locator("[data-cart-line] button[aria-label='Odstrani izdelek']").count()) > 0) {
    await page.locator("[data-cart-line] button[aria-label='Odstrani izdelek']").first().click();
    await page.waitForTimeout(400);
  }
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("ATC from PDP + sticky bar → badge count → cart line", async ({ page }) => {
  await page.goto("/izdelek/belilni-trakci-za-zobe");
  await dismissCmp(page);

  await page.locator("[data-buy-box]").getByRole("button", { name: "Dodaj v košarico" }).click();
  await expect(page.locator("[data-buy-box]").getByRole("button", { name: "Dodano ✓" })).toBeVisible();
  await expect(page.locator("[data-cart-badge]")).toHaveText("1");

  // sticky bar ATC adds one more
  await page.locator("div.fixed").getByRole("button", { name: "Dodaj v košarico" }).click();
  await expect(page.locator("[data-cart-badge]")).toHaveText("2");

  await page.goto("/cart");
  await expect(page.locator("[data-cart-line='NAS-TRK-14']")).toBeVisible();
  await expect(page.getByText("Vaša košarica (2)")).toBeVisible();
  await expect(page.locator("[data-cart-total]")).toHaveText(/69,98/);
});

test("qty steppers: cap 5 + message, minus disabled at 1, remove", async ({ page }) => {
  // fresh context per test → seed the guest cart via UI first
  await page.goto("/trgovina");
  await dismissCmp(page);
  await page.locator("[data-product-card='belilni-trakci-za-zobe']").getByRole("button", { name: "Dodaj v košarico" }).click();
  await expect(page.locator("[data-cart-badge]")).toHaveText("1");

  await page.goto("/cart");
  const line = page.locator("[data-cart-line='NAS-TRK-14']");
  await expect(line).toBeVisible();

  // pump to cap 5 → cap message appears, + disabled
  const plus = line.getByLabel("Povečaj količino");
  for (let i = 0; i < 4; i++) {
    await plus.click();
    await page.waitForTimeout(350);
    if (await plus.isDisabled()) break;
  }
  await expect(line.getByText("Največ 5 kosov na naročilo")).toBeVisible();
  await expect(plus).toBeDisabled();

  // back to 1 → minus disabled
  const minus = line.getByLabel("Zmanjšaj količino");
  for (let i = 0; i < 4; i++) {
    await minus.click();
    await page.waitForTimeout(300);
  }
  await expect(minus).toBeDisabled();

  // remove → empty state
  await line.getByLabel("Odstrani izdelek").click();
  await expect(page.getByText("Vaša košarica je prazna")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.locator("[data-cart-badge]")).toHaveCount(0);
});

test("progress bar states: empty → in progress → reached", async ({ page }) => {
  // empty: 5 % floor + unlock copy
  await page.goto("/cart");
  await expect(page.getByText("Vaša košarica je prazna")).toBeVisible();

  // in progress: 1× mouthwash 19,99 → "Samo še €26"
  await page.goto("/trgovina");
  await dismissCmp(page);
  const mouthwash = page.locator("[data-product-card='ustna-voda-globinsko-ciscenje']");
  await mouthwash.getByRole("button", { name: "Dodaj v košarico" }).click();
  await expect(page.locator("[data-cart-badge]")).toHaveText("1");
  await page.goto("/cart");
  await expect(page.getByText(/Samo še €26 vas loči/)).toBeVisible();
  await expect(page.locator("[role='progressbar']")).toHaveAttribute("aria-valuenow", "44");

  // reached: add bundle 49,99 → free shipping
  await page.goto("/izdelek/paket-popolna-rutina");
  await page.locator("[data-buy-box]").getByRole("button", { name: "Dodaj v košarico" }).click();
  // wait for the Server Action to resolve before navigating (cookie write)
  await expect(page.locator("[data-buy-box]").getByRole("button", { name: "Dodano ✓" })).toBeVisible();
  await page.goto("/cart");
  await expect(page.getByText(/Odklenili ste brezplačno dostavo/)).toBeVisible();
  await expect(page.locator("[role='progressbar']")).toHaveAttribute("aria-valuenow", "100");
  await expect(page.getByText("Brezplačna", { exact: true })).toBeVisible();

  // bundle contents listed under the bundle line
  const bundleLine = page.locator("[data-cart-line='NAS-PAK-RUTINA']");
  await expect(bundleLine.getByText("Vsebina paketa:")).toBeVisible();
  await expect(bundleLine.getByText(/1× Belilni trakci/)).toBeVisible();

  await clearCartUi(page);
});

test("cross-sell quick ATC from cart page", async ({ page }) => {
  // seed cart with one item so the shelf renders
  await page.goto("/trgovina");
  await dismissCmp(page);
  await page.locator("[data-product-card='serum-korektor-barve-zob']").getByRole("button", { name: "Dodaj v košarico" }).click();
  await page.goto("/cart");

  const shelf = page.locator("[data-product-card='belilni-trakci-za-zobe']").last();
  await shelf.getByRole("button", { name: "Dodaj v košarico" }).click();
  await expect(page.locator("[data-cart-badge]")).toHaveText("2");
  await expect(page.locator("[data-cart-line='NAS-TRK-14']")).toBeVisible();

  await clearCartUi(page);
});

test("/koda scaffold: stores code, shows pill, remove works", async ({ page }) => {
  // summary (with the code pill) renders only with items — seed one
  await page.goto("/trgovina");
  await dismissCmp(page);
  await page.locator("[data-product-card='belilni-trakci-za-zobe']").getByRole("button", { name: "Dodaj v košarico" }).click();
  await expect(page.locator("[data-cart-badge]")).toHaveText("1");

  await page.goto("/koda/TEST10");
  await expect(page).toHaveURL(/\/cart/);
  await expect(page.locator("[data-active-code]")).toHaveText("TEST10");
  await expect(page.getByText(/ne sešteva se z drugimi ponudbami/)).toBeVisible();

  await page.getByRole("button", { name: "Odstrani kodo" }).click();
  await expect(page.locator("[data-active-code]")).toHaveCount(0);

  await page.goto("/koda/not_valid!");
  await expect(page).toHaveURL(/koda=neveljavna/);
});

test("merge-on-login: guest lines merge into DB cart, cookie cleared", async ({
  page,
  context,
}) => {
  // guest adds 2 lines
  await page.goto("/trgovina");
  await dismissCmp(page);
  await page.locator("[data-product-card='belilni-trakci-za-zobe']").getByRole("button", { name: "Dodaj v košarico" }).click();
  await page.locator("[data-product-card='ustna-voda-globinsko-ciscenje']").getByRole("button", { name: "Dodaj v košarico" }).click();
  await expect(page.locator("[data-cart-badge]")).toHaveText("2");

  // pre-clean the customer's DB cart
  const customer = await prisma.user.findUniqueOrThrow({
    where: { email: CUSTOMER.email },
  });
  await prisma.cartItem.deleteMany({
    where: { cart: { userId: customer.id } },
  });

  // login via the credentials form
  await page.goto("/prijava");
  await page.getByLabel("E-pošta").fill(CUSTOMER.email);
  await page.getByLabel("Geslo").fill(CUSTOMER.password);
  await page.getByRole("button", { name: "Prijava", exact: true }).click();
  await page.waitForURL(/\/racun/, { timeout: 15_000 });

  // guest cookie cleared
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "nasmeh_cart")).toBeUndefined();

  // DB cart has both lines
  const dbCart = await prisma.cart.findUnique({
    where: { userId: customer.id },
    include: { items: true },
  });
  expect(dbCart?.items).toHaveLength(2);

  // badge reads from DB cart now
  await page.goto("/cart");
  await expect(page.locator("[data-cart-badge]")).toHaveText("2");
  await expect(page.locator("[data-cart-line]")).toHaveCount(2);

  // sign out via cookie clear + clean DB cart for other tests
  await context.clearCookies();
  await prisma.cartItem.deleteMany({ where: { cart: { userId: customer.id } } });
});

test("tamper test: forged guest cookie is rejected (never trusted)", async ({
  page,
  context,
}) => {
  // valid cart first
  await page.goto("/trgovina");
  await dismissCmp(page);
  await page.locator("[data-product-card='belilni-trakci-za-zobe']").getByRole("button", { name: "Dodaj v košarico" }).click();
  await expect(page.locator("[data-cart-badge]")).toHaveText("1");

  // forge: rewrite quantity to 99 keeping the old signature
  const cookies = await context.cookies();
  const cartCookie = cookies.find((c) => c.name === "nasmeh_cart");
  expect(cartCookie).toBeTruthy();
  const forgedPayload = Buffer.from(
    JSON.stringify({ v: 1, lines: [{ variantId: "x", quantity: 99 }] }),
  ).toString("base64url");
  const signature = cartCookie!.value.split(".").pop()!;
  await context.addCookies([
    {
      name: "nasmeh_cart",
      value: `${forgedPayload}.${signature}`,
      domain: "127.0.0.1",
      path: "/",
    },
  ]);

  await page.goto("/cart");
  await expect(page.getByText("Vaša košarica je prazna")).toBeVisible();
  await expect(page.locator("[data-cart-badge]")).toHaveCount(0);
});

test("visibility: DRAFT/hiddenDeal variants are rejected server-side + leave the catalog", async ({
  request,
}) => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const mouthwash = await prisma.product.findUniqueOrThrow({
    where: { slug: "ustna-voda-globinsko-ciscenje" },
    include: { variants: { take: 1 } },
  });
  const variantId = mouthwash.variants[0].id;

  // find addToCartAction's id: the one returning ok:true for an ACTIVE variant
  const chunkDir = path.join(
    process.cwd(),
    ".next/static/chunks/app/(storefront)/trgovina",
  );
  const chunkFile = fs
    .readdirSync(chunkDir)
    .find((f) => f.startsWith("page-") && f.endsWith(".js"))!;
  const ids = [
    ...new Set(
      [
        ...fs
          .readFileSync(path.join(chunkDir, chunkFile), "utf8")
          .matchAll(/"([0-9a-f]{40,})"/g),
      ].map((m) => m[1]),
    ),
  ];

  let atcId: string | null = null;
  for (const id of ids) {
    const res = await request.post("/trgovina", {
      headers: { "Next-Action": id, "content-type": "text/plain;charset=UTF-8" },
      data: `[{"variantId":"${variantId}","quantity":1}]`,
    });
    const text = await res.text();
    if (/"ok":true/.test(text)) {
      atcId = id;
      break;
    }
  }
  expect(atcId).toBeTruthy();

  // DRAFT → button gone from catalog + action rejects
  await prisma.product.update({
    where: { id: mouthwash.id },
    data: { status: "DRAFT" },
  });
  try {
    const html = await (await request.get("/trgovina")).text();
    expect(html).not.toContain("Ustna voda za globinsko čiščenje");

    const res = await request.post("/trgovina", {
      headers: {
        "Next-Action": atcId!,
        "content-type": "text/plain;charset=UTF-8",
      },
      data: `[{"variantId":"${variantId}","quantity":1}]`,
    });
    expect(await res.text()).toContain('"ok":false');
  } finally {
    await prisma.product.update({
      where: { id: mouthwash.id },
      data: { status: "ACTIVE" },
    });
  }

  // hiddenDeal → action rejects even though ACTIVE
  await prisma.product.update({
    where: { id: mouthwash.id },
    data: { hiddenDeal: true },
  });
  try {
    const res = await request.post("/trgovina", {
      headers: {
        "Next-Action": atcId!,
        "content-type": "text/plain;charset=UTF-8",
      },
      data: `[{"variantId":"${variantId}","quantity":1}]`,
    });
    expect(await res.text()).toContain('"ok":false');
  } finally {
    await prisma.product.update({
      where: { id: mouthwash.id },
      data: { hiddenDeal: false },
    });
  }
});

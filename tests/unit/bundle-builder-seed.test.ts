import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bundleBuilderSchema, DEFAULT_BUNDLE_BUILDER } from "@/lib/admin/cms-schemas";

/**
 * Bundle builder (/sestavi-paket): the seed writes the `bundle.builder` Setting for a fresh
 * database and 20260920100000_bundle_builder_setting inserts it into a deployed one. The two
 * must agree on the key and on every field but the coupon — a deployed database has no demo
 * coupon, so the migration ships an empty code rather than one the cart could not apply.
 * The repo has no jsdom and never renders components, so both files are read as text
 * (tests/unit/legal-drafts-migration.test.ts is the precedent).
 */

const root = join(__dirname, "..", "..");
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");
const seed = read("prisma", "seed.ts");
const sql = read("prisma", "migrations", "20260920100000_bundle_builder_setting", "migration.sql");

/** The object literal that encloses `marker` in the seed source, brace-matched. */
function objectAround(source: string, marker: string): string {
  const at = source.indexOf(marker);
  if (at < 0) throw new Error(`missing ${marker}`);
  const start = source.lastIndexOf("{", at);
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}" && (depth -= 1) === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unbalanced literal around ${marker}`);
}

/** The seed is TypeScript, not JSON: drop line comments and `as T` casts, quote bare keys, drop trailing commas. */
function parseLiteral(literal: string): Record<string, unknown> {
  return JSON.parse(
    literal
      .replace(/^[ \t]*\/\/.*$/gm, "")
      .replace(/\s+as\s+[^,\n}]+/g, "")
      .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
      .replace(/,(\s*[}\]])/g, "$1"),
  );
}

const settingEntry = parseLiteral(objectAround(seed, 'key: "bundle.builder"'));
const seededValue = settingEntry.value;
const coupon = parseLiteral(objectAround(seed, 'code: "PAKET20"'));

const insert = sql.slice(sql.indexOf('INSERT INTO "Setting"'));
const inserted = /\(\s*'([a-z.]+)',\s*'([\s\S]*?)'::jsonb/.exec(insert);
if (!inserted) throw new Error("no Setting row in the migration");
const migrationValue = JSON.parse(inserted[2]) as unknown;

describe("bundle.builder Setting", () => {
  it("inserts the key the seed writes, and writes nothing else", () => {
    expect(inserted[1]).toBe(settingEntry.key);
    expect(inserted[1]).toBe("bundle.builder");
    expect(insert).toContain('ON CONFLICT ("key") DO NOTHING');
    const other = sql.split(/;\s*\n/).filter((statement) => /^\s*(UPDATE|DELETE|ALTER|CREATE|DROP|INSERT INTO "(?!Setting")\w+)\b/m.test(statement));
    expect(other).toEqual([]);
  });

  it("ships an empty coupon code to deployed databases, the demo code only in the seed", () => {
    expect((migrationValue as { couponCode: string }).couponCode).toBe("");
    expect((seededValue as { couponCode: string }).couponCode).toBe("PAKET20");
    // A production Setting naming a coupon that is not there renders no discount at best.
    expect(insert).not.toContain("PAKET20");
    expect(bundleBuilderSchema.parse(migrationValue)).toEqual(DEFAULT_BUNDLE_BUILDER);
  });

  it("seeds a value the admin schema accepts unchanged", () => {
    const parsed = bundleBuilderSchema.parse(seededValue);
    expect(parsed).toEqual({ ...DEFAULT_BUNDLE_BUILDER, couponCode: "PAKET20" });
    // Quantities of the base variant (1/2/3), not multipack SKUs.
    expect(parsed.offerUnits).toEqual([1, 2, 3]);
    expect(parsed.enabled).toBe(true);
    expect(parsed.subscriptionRow).toBe(true);
  });
});

describe("PAKET20 coupon", () => {
  it("is an active 20 % PERCENT coupon the builder can price", () => {
    expect(coupon.type).toBe("PERCENT");
    expect(coupon.percentOff).toBe(20);
    expect(seed).toMatch(/prisma\.coupon\.upsert\(\{\s*\n\s*where: \{ code: coupon\.code \}/); // idempotent, like the rest of the seed
  });

  it("carries no usage limit, customer limit, email list or end date", () => {
    // Each of these prices in the builder but can be refused at the checkout, and a coupon
    // the order cannot honour fails order creation (lib/orders/create.ts).
    expect(coupon.usageLimitTotal).toBeNull();
    expect(coupon.usageLimitPerCustomer).toBeNull();
    expect(coupon).not.toHaveProperty("endsAt");
    expect(coupon).not.toHaveProperty("eligibleEmails");
    expect(coupon).not.toHaveProperty("eligibility");
    const seedCoupons = seed.slice(seed.indexOf("async function seedCoupons("));
    expect(seedCoupons.slice(0, seedCoupons.indexOf("\n}")), "seedCoupons writes none of them").not.toMatch(/endsAt|eligibility|eligibleEmails/);
  });

  it("sets a minimum spend the smallest offer reaches", () => {
    const seeded = [...seed.matchAll(/sku: "([A-Z0-9-]+)",\s*\n\s*priceCents: (\d+)/g)].map((match) => ({ sku: match[1], priceCents: Number(match[2]) }));
    expect(seeded).toHaveLength(5); // the offers are quantities of an existing product: no SKU was added
    expect(seed.match(/prisma\.bundle\.upsert/g)).toHaveLength(1);
    // The builder's base is any product that is not itself a bundle; one unit of the cheapest is the floor.
    const cheapestUnit = Math.min(...seeded.filter((item) => item.sku !== "NAS-PAK-RUTINA").map((item) => item.priceCents));
    expect(typeof coupon.minSpendCents).toBe("number");
    expect(coupon.minSpendCents as number).toBeLessThanOrEqual(cheapestUnit);
    expect(coupon.minSpendCents as number).toBeGreaterThan(0);
  });
});

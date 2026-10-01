import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PDP_CONTENT } from "@/prisma/seed-pdp";

/**
 * QA 2026-09-30: stock state is computed (the sold-out pill, OutOfStock availability, the
 * "Obvestite me" capture, the low-stock line) and never typed into copy or badges — a typed
 * "Trenutno razprodano" stayed on the page after a restock (AGENTS §8.23). The seed carries
 * the corrected copy for fresh databases; 20260930110000_qa_seed_stock_claims moves unedited
 * rows of upgraded ones. Both files are read as text (claims-copy.test.ts is the precedent).
 */

const root = join(__dirname, "..", "..");
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");
const seed = read("prisma", "seed.ts");
const sql = read("prisma", "migrations", "20260930110000_qa_seed_stock_claims", "migration.sql");

/** Typed stock or scarcity wording; the computed hooks state these facts. */
const TYPED_STOCK = /razprodan|zadnji kos|samo še \d|kdaj bo .* spet na zalogi/i;

describe("seeded copy carries no typed stock state", () => {
  it("in the product seed (descriptions and badges)", () => {
    const products = seed.slice(seed.indexOf("const PRODUCTS = ["), seed.indexOf("] as const;"));
    expect(products).not.toMatch(TYPED_STOCK);
  });

  it("in the PDP content (SEO, custom fields, accordions, FAQ, education)", () => {
    for (const [slug, content] of Object.entries(PDP_CONTENT)) {
      expect(JSON.stringify(content), slug).not.toMatch(TYPED_STOCK);
    }
  });
});

describe("20260930110000_qa_seed_stock_claims", () => {
  const travel = PDP_CONTENT["belilni-trakci-potovalni-7"];

  it("writes exactly the values the seed now carries", () => {
    expect(sql).toContain(`SET "description" = 'Potovalno pakiranje belilnih trakov: 7 uporab za na pot.'`);
    expect(seed).toContain(`"Potovalno pakiranje belilnih trakov: 7 uporab za na pot.",`);
    expect(sql).toContain(`SET "seoDescription" = '${travel.seoDescription}'`);
    expect(sql).toContain(`to_jsonb('${travel.faq[0].q}'::text)`);
    expect(sql).toContain(`to_jsonb('${travel.faq[0].a}'::text)`);
    expect(sql).toContain(`SET "badges" = '[{"label":"NOVO","style":"outline"}]'::jsonb`);
  });

  it("touches a row only while it still holds the exact old seed value, in one transaction", () => {
    const guards = [
      `"description" = 'Potovalno pakiranje belilnih trakov: 7 uporab za na pot. Trenutno razprodano.'`,
      `"seoDescription" = 'Potovalno pakiranje belilnih trakov Nasmeh.si: 7 uporab za na pot. Trenutno razprodano — prijavite se na obvestilo o zalogi.'`,
      `"faq"::jsonb #>> '{0,q}' = 'Kdaj bo izdelek spet na zalogi?'`,
      `"badges"::jsonb = '[{"label":"NOVO","style":"outline"},{"label":"RAZPRODANO","style":"grey"}]'::jsonb`,
    ];
    for (const guard of guards) expect(sql).toContain(guard);
    expect(sql.match(/WHERE "slug" = 'belilni-trakci-potovalni-7'/g)).toHaveLength(4);
    expect(sql).toContain("BEGIN;");
    expect(sql.trim().endsWith("COMMIT;")).toBe(true);
  });
});

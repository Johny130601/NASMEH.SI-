import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * QA 2026-09-29 T1-19: the seeded footer "Paketi" link and the marquee link moved. The seed
 * writes the new values for a fresh database and 20260930100000_qa_storefront_links moves an
 * upgraded database's rows — but only rows still holding the exact old seed value, so an
 * operator's edited menu or marquee is never touched. Both files are read as text
 * (tests/unit/bundle-builder-seed.test.ts is the precedent).
 */

const root = join(__dirname, "..", "..");
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");
const seed = read("prisma", "seed.ts");
const sql = read("prisma", "migrations", "20260930100000_qa_storefront_links", "migration.sql");

describe("storefront links migration (QA T1-19)", () => {
  it("seeds the new destinations and no longer the old ones", () => {
    expect(seed).toContain(`{ key: "marquee.href", value: "/trgovina" }`);
    expect(seed).not.toContain(`{ key: "marquee.href", value: "/checkout" }`);
    expect(seed).toContain(`{ label: "Paketi", href: "/trgovina?kolekcija=paketi" }`);
    expect(seed).not.toContain(`{ label: "Paketi", href: "/izdelek/paket-popolna-rutina" }`);
  });

  it("moves only rows that still hold the exact old seed value", () => {
    expect(sql).toMatch(/WHERE "key" = 'marquee\.href' AND "value" = '"\/checkout"'::jsonb;/);
    expect(sql).toContain(`'"/trgovina"'::jsonb`);
    expect(sql).toContain(`WHERE "handle" = 'footer-trgovina'`);
    expect(sql).toContain(`"items" @> '[{"label":"Paketi","href":"/izdelek/paket-popolna-rutina"}]'::jsonb`);
    expect(sql).toContain(`entry.item->>'label' = 'Paketi' AND entry.item->>'href' = '/izdelek/paket-popolna-rutina'`);
    expect(sql).toContain(`'"/trgovina?kolekcija=paketi"'::jsonb`);
  });

  it("keeps the menu's item order and runs in one transaction", () => {
    expect(sql).toContain("WITH ORDINALITY");
    expect(sql).toContain("ORDER BY entry.position");
    expect(sql.trim().startsWith("--")).toBe(true);
    expect(sql).toContain("BEGIN;");
    expect(sql.trim().endsWith("COMMIT;")).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_TOKENS, fillToken } from "@/lib/content/tokens";

/**
 * QA 2026-10-03 T6-04/T6-05: a figure in merchandising text is a token the
 * server fills, never typed — the marquee's free-shipping amount follows the
 * shipping Setting and the popup names the code it applies. The seed writes
 * the tokens for a fresh database; 20261003120000_content_tokens moves an
 * upgraded database's rows only while they hold the exact old seed text.
 */

const root = join(__dirname, "..", "..");
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

describe("fillToken", () => {
  it("replaces every occurrence and leaves a text without the token as typed", () => {
    expect(fillToken("Brezplačna dostava pri naročilih od {prag}", CONTENT_TOKENS.threshold, "60,00 €")).toBe("Brezplačna dostava pri naročilih od 60,00 €");
    expect(fillToken("{koda} — ponovno: {koda}", CONTENT_TOKENS.code, "TEST10")).toBe("TEST10 — ponovno: TEST10");
    expect(fillToken("Dobrodošli na Nasmeh.si", CONTENT_TOKENS.threshold, "60,00 €")).toBe("Dobrodošli na Nasmeh.si");
  });

  it("is filled where the texts are rendered", () => {
    expect(read("components", "storefront", "chrome", "SiteHeader.tsx")).toContain(`fillToken(typeof marqueeText === "string" ? marqueeText : home.marqueeFallback, CONTENT_TOKENS.threshold, formatEUR(freeThresholdCents))`);
    const layout = read("app", "(storefront)", "layout.tsx");
    for (const field of ["title", "body", "thankYouTitle", "thankYouBody"]) expect(layout).toContain(`${field}: popupText(welcomePopup.${field})`);
  });
});

describe("content tokens migration", () => {
  const seed = read("prisma", "seed.ts");
  const sql = read("prisma", "migrations", "20261003120000_content_tokens", "migration.sql");

  it("seeds the tokens and no longer the typed figures", () => {
    expect(seed).toContain(`value: "Brezplačna dostava pri naročilih od {prag}"`);
    expect(seed).not.toContain("Brezplačna dostava pri naročilih od 45 €\"");
    expect(seed).toContain(`"Preverite nabiralnik in potrdite prijavo. Koda {koda} je že shranjena za blagajno."`);
    expect(seed).not.toContain("Koda WELCOME10 je že shranjena");
  });

  it("moves only rows that still hold the exact old seed text, in one transaction", () => {
    expect(sql).toContain(`WHERE "key" = 'marquee.text' AND "value" = '"Brezplačna dostava pri naročilih od 45 €"'::jsonb;`);
    expect(sql).toContain(`'"Brezplačna dostava pri naročilih od {prag}"'::jsonb`);
    expect(sql).toContain(`AND "value" ->> 'thankYouBody' = 'Preverite nabiralnik in potrdite prijavo. Koda WELCOME10 je že shranjena za blagajno.';`);
    expect(sql).toContain(`'"Preverite nabiralnik in potrdite prijavo. Koda {koda} je že shranjena za blagajno."'::jsonb`);
    expect(sql.trim().startsWith("--")).toBe(true);
    expect(sql).toContain("BEGIN;");
    expect(sql.trim().endsWith("COMMIT;")).toBe(true);
  });
});

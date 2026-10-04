import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { legal, sellerBlockLines } from "@/lib/copy/legal";
import { companyPlaceholderFields, COMPANY_SEED_PLACEHOLDERS } from "@/lib/settings-schemas";

/**
 * Review finding C1: the legal bodies say the seller's details are "navedeni
 * zgoraj" (terms §1/§2, privacy §1/§16, withdrawal §1), but no legal route
 * rendered them. The block now comes from the `company` Setting above every
 * body and above the texts attached to the order confirmation, and says so
 * honestly when the Setting is absent or still a seed placeholder (G4).
 */

const company = {
  name: "Nasmeh d.o.o.",
  address: "Prešernova 1, 1000 Ljubljana",
  registrationNumber: "1234567000",
  vatId: "SI12345678",
  email: "info@nasmeh.si",
};

const ROUTES: Array<[string, string[]]> = [
  ["ContentPage LEGAL (pogoji-poslovanja, politika-zasebnosti)", ["app", "(storefront)", "[slug]", "page.tsx"]],
  ["odstop-od-pogodbe", ["app", "(storefront)", "odstop-od-pogodbe", "page.tsx"]],
  ["reklamacije", ["app", "(storefront)", "reklamacije", "page.tsx"]],
  ["politika-piskotkov", ["app", "(storefront)", "politika-piskotkov", "page.tsx"]],
];

const read = (...segments: string[]) => readFileSync(join(__dirname, "..", "..", ...segments), "utf8");

describe("sellerBlockLines", () => {
  it("prints the identity in the order the block renders it", () => {
    expect(sellerBlockLines(company, companyPlaceholderFields(company))).toEqual([
      "Nasmeh d.o.o.",
      "Prešernova 1, 1000 Ljubljana",
      `${legal.seller.registration}: 1234567000 · ${legal.seller.vatId}: SI12345678`,
      `${legal.seller.email}: info@nasmeh.si`,
    ]);
  });

  it("adds the telephone only when one is set", () => {
    expect(sellerBlockLines({ ...company, phone: " +386 1 234 56 78 " })?.at(-1)).toBe(
      `${legal.seller.phone}: +386 1 234 56 78`,
    );
    expect(sellerBlockLines({ ...company, phone: "   " })).toHaveLength(4);
  });

  it("falls back honestly: no Setting and a seed placeholder both claim no identity", () => {
    expect(sellerBlockLines(null)).toBeNull();
    const seeded = {
      ...company,
      ...COMPANY_SEED_PLACEHOLDERS,
      address: `${COMPANY_SEED_PLACEHOLDERS.address} 1, 1000 Ljubljana`,
    };
    expect(companyPlaceholderFields(seeded).length).toBeGreaterThan(0);
    expect(sellerBlockLines(seeded, companyPlaceholderFields(seeded))).toBeNull();
  });
});

describe("the block is server-rendered above the body", () => {
  it.each(ROUTES)("%s", (_route, segments) => {
    const source = read(...segments);
    expect(source).toContain("getCompany()");
    expect(source).toContain("sellerBlockLines(company, companyPlaceholderFields(company))");
    // the missing line is what the route prints instead of an identity it does not have
    expect(source).toContain("legal.seller.missing");
    const block = source.indexOf("data-seller-block");
    expect(block).toBeGreaterThan(-1);
    expect(source.indexOf("dangerouslySetInnerHTML")).toBeGreaterThan(block);
  });

  it("the footer applies the same placeholder rule and prints the same missing line (AGENTS §22, QA 2026-10-03 T1-03)", () => {
    const source = read("components", "storefront", "chrome", "SiteFooter.tsx");
    expect(source).toContain("getCompany()");
    expect(source).toContain("companyPlaceholderFields(company).length === 0");
    expect(source).toContain("legal.seller.missing");
    // every printed field comes from the gated identity, never from the raw Setting
    // (copy.company.* are the labels, not the Setting)
    expect(source).not.toMatch(/(?<!copy\.)\bcompany\??\.(name|address|registrationNumber|vatId|email|phone)\b/);
    expect(source).toContain("identity.registrationNumber");
  });

  it("the legal-texts PDF prints the block before the texts it belongs to", () => {
    const source = read("lib", "invoice", "legal-texts-pdf.ts");
    const block = source.indexOf("sellerBlockLines(input.seller)");
    expect(block).toBeGreaterThan(-1);
    expect(source.indexOf("input.documents.forEach")).toBeGreaterThan(block);
    expect(source).toContain("legal.seller.missing");
    // A caller that passes no seller at all prints no block: the confirmation is
    // only built with a valid company Setting, so "not available" would be false.
    expect(source.indexOf("input.seller !== undefined")).toBeLessThan(block);
  });
});

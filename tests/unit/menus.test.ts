import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { footerColumnTitle, utilityMenuItems, withLegalLinks } from "@/lib/menus";
import { DEFAULT_LEGAL_LINKS } from "@/lib/settings-schemas";

/** QA 2026-09-29 M16, T7-F3, T7-F21: what the header and footer make of the menu rows. */
describe("utilityMenuItems", () => {
  const guest = { label: "Prijava", href: "/prijava" };
  const customer = { label: "Moj račun", href: "/racun" };

  it("keeps the operator's links in order and makes the sign-in link session-aware", () => {
    const menu = [{ label: "Pomoč", href: "/kontakt" }, { label: "Vpis", href: "/prijava" }, { label: "Akcija", href: "/trgovina?kolekcija=paketi", color: "sale" }];
    expect(utilityMenuItems(menu, guest)).toEqual([
      { label: "Pomoč", href: "/kontakt" }, { label: "Prijava", href: "/prijava", account: true }, { label: "Akcija", href: "/trgovina?kolekcija=paketi", color: "sale" },
    ]);
    expect(utilityMenuItems(menu, customer)[1]).toEqual({ label: "Moj račun", href: "/racun", account: true });
  });

  it("adds the account link when the menu has none and shows it once when it has two", () => {
    expect(utilityMenuItems([], guest)).toEqual([{ ...guest, account: true }]);
    expect(utilityMenuItems([{ label: "Sledi", href: "/sledi" }], customer)).toEqual([{ label: "Sledi", href: "/sledi" }, { ...customer, account: true }]);
    expect(utilityMenuItems([{ label: "A", href: "/racun" }, { label: "B", href: "/prijava?x=1" }], guest)).toEqual([{ ...guest, account: true }]);
  });
});

describe("footerColumnTitle", () => {
  it("uses the operator's menu title and keeps the default heading for the seeded admin label or an empty title", () => {
    expect(footerColumnTitle(" Nakupovanje ", "Noga — Trgovina", "Trgovina")).toBe("Nakupovanje");
    expect(footerColumnTitle("Noga — Trgovina", "Noga — Trgovina", "Trgovina")).toBe("Trgovina");
    expect(footerColumnTitle("", "Noga — Trgovina", "Trgovina")).toBe("Trgovina");
  });
});

describe("withLegalLinks", () => {
  const items = [{ label: "Pogoji poslovanja", href: "/pogoji-poslovanja" }, { label: "Reklamacije", href: "/reklamacije" }, { label: "Odstop", href: "/odstop-od-pogodbe" }];

  it("sends links to a default legal path where the legal-link mapping now points", () => {
    expect(withLegalLinks(items, { ...DEFAULT_LEGAL_LINKS, terms: "/splosni-pogoji" })).toEqual([
      { label: "Pogoji poslovanja", href: "/splosni-pogoji" }, items[1], items[2],
    ]);
  });

  it("leaves every link alone while the mapping is the default", () => {
    expect(withLegalLinks(items, DEFAULT_LEGAL_LINKS)).toBe(items);
  });
});

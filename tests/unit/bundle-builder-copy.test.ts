import { describe, expect, it } from "vitest";
import {
  bundle,
  bundleContents,
  dodatekForm,
  izbranForm,
  izdelekForm,
  selectedLine,
} from "@/lib/copy/bundle";

/**
 * Bundle-builder copy (AGENTS §8.5, §8.23). Two things are asserted here as
 * data, not as prose: Slovenian number agreement through the hundreds cycle,
 * and the compliance property that gives the module its shape — not one
 * price, percentage or saving is typed into the copy. Every figure arrives
 * already computed and formatted from the server, so the helpers take
 * strings and counts and the static strings carry no figure at all.
 */

/** Every static string in the module, with the path that produced it. */
function copyStrings(node: unknown, path = "bundle"): Array<[string, string]> {
  if (typeof node === "string") return [[path, node]];
  // Functions are the figure carriers: they are given what to say (below).
  if (typeof node !== "object" || node === null) return [];
  return Object.entries(node).flatMap(([key, value]) => copyStrings(value, `${path}.${key}`));
}

const STRINGS = copyStrings(bundle);
/** A number followed by a percent sign or a euro sign: a claim, not a label. */
const FIGURE = /\d[\d\s.,]*\s*(%|€)/;

describe("Slovenian number agreement", () => {
  const counts = [1, 2, 3, 4, 5, 21, 22, 101];

  it("declines izdelek through singular, dual, plural and the hundreds cycle", () => {
    expect(counts.map(izdelekForm)).toEqual([
      "izdelek", "izdelka", "izdelki", "izdelki", "izdelkov", "izdelkov", "izdelkov", "izdelek",
    ]);
  });

  it("declines dodatek the same way", () => {
    expect(counts.map(dodatekForm)).toEqual([
      "dodatek", "dodatka", "dodatki", "dodatki", "dodatkov", "dodatkov", "dodatkov", "dodatek",
    ]);
  });

  it("agrees the adjective izbran with the noun it follows", () => {
    expect(counts.map(izbranForm)).toEqual([
      "izbran", "izbrana", "izbrani", "izbrani", "izbranih", "izbranih", "izbranih", "izbran",
    ]);
  });

  it("counts nothing selected in the genitive, like the rest of the shop", () => {
    expect([izdelekForm(0), dodatekForm(0), izbranForm(0)]).toEqual([
      "izdelkov", "dodatkov", "izbranih",
    ]);
  });
});

describe("the counter and the recap", () => {
  it("writes the add-on counter with both words agreeing", () => {
    expect(selectedLine(0)).toBe("0 dodatkov izbranih");
    expect(selectedLine(1)).toBe("1 dodatek izbran");
    expect(selectedLine(2)).toBe("2 dodatka izbrana");
    expect(selectedLine(3)).toBe("3 dodatki izbrani");
  });

  it("names what is in the bundle, and drops the add-on clause when there is none", () => {
    expect(bundleContents(1, 0)).toBe("1 izdelek");
    expect(bundleContents(2, 0)).toBe("2 izdelka");
    expect(bundleContents(3, 0)).toBe("3 izdelki");
    expect(bundleContents(1, 1)).toBe("1 izdelek + 1 dodatek");
    expect(bundleContents(2, 2)).toBe("2 izdelka + 2 dodatka");
    expect(bundleContents(2, 3)).toBe("2 izdelka + 3 dodatki");
  });

  it("claims no product category: the builder opens from any product (QA C2-F19)", () => {
    expect(bundle.title).not.toMatch(/beljenj/i);
    for (const [units, addOns] of [[1, 0], [2, 3]]) expect(bundleContents(units, addOns)).not.toMatch(/beljenj/i);
  });

  it("is the same helper the copy object hands the page", () => {
    expect(bundle.addOns.selected).toBe(selectedLine);
    expect(bundle.summary.contents).toBe(bundleContents);
  });

  it("states the offer's units in kosi, the shop's own form", () => {
    expect([1, 2, 3].map(bundle.offers.units)).toEqual(["1 kos", "2 kosa", "3 kosi"]);
  });
});

describe("the figures the copy is given", () => {
  it("carries the server's formatted amounts through untouched", () => {
    expect(bundle.summary.discountCode("PAKET20")).toBe("s kodo PAKET20");
    expect(bundle.summary.otherLines(2)).toBe("Vključuje 2 izdelka že v košarici");
    expect(bundle.summary.mainLine("Belilni trakci", 3)).toBe("Belilni trakci × 3");
    expect(bundle.product.variantLabel("NAS-TRK-14")).toBe("Šifra: NAS-TRK-14");
    expect(bundle.addOns.toggleLabel("Zobna nitka")).toBe("Dodaj k paketu: Zobna nitka");
  });

  it("states no figure of its own anywhere in the static copy", () => {
    // the whole module walked: a price, a percentage or a saving typed into
    // copy is a claim nothing computes, and the one the cart would contradict
    expect(STRINGS.filter(([, text]) => FIGURE.test(text))).toEqual([]);
    expect(STRINGS.length).toBeGreaterThan(20); // the walk really reached the copy
    // the regex is the gate it claims to be
    expect(FIGURE.test("Prihranite 4,20 €")).toBe(true);
    expect(FIGURE.test("Popust na paket (12 %)")).toBe(true);
  });

  it("keeps the cap notice and the empty state free of numbers", () => {
    expect(bundle.notices.capped).not.toMatch(/\d/);
    expect(bundle.notices.failed).not.toMatch(/\d/);
    expect(Object.values(bundle.empty).join(" ")).not.toMatch(/\d/);
  });

  it("promises no gift and no extra unit, which nothing in the data could prove", () => {
    // UCPD Annex I point 20: "free" wording for something that is not free
    expect(STRINGS.filter(([, text]) => /darilo|darila|gratis/i.test(text))).toEqual([]);
  });
});

describe("the monthly-delivery row is interest capture only", () => {
  it("exposes no percentage, and no key that would carry one", () => {
    expect(Object.keys(bundle.subscription).some((key) => /percent|odstot|popust|save|prihran/i.test(key))).toBe(false);
    expect(Object.values(bundle.subscription).join(" ")).not.toMatch(/\d/);
    expect(STRINGS.filter(([path]) => path.startsWith("bundle.subscription")).length).toBe(
      Object.keys(bundle.subscription).length,
    );
  });

  it("says plainly what ticking it does not do", () => {
    expect(bundle.subscription.note).toBe("Redna dostava izdelka še ni na voljo.");
    expect(bundle.subscription.acknowledged).toContain("Na ceno paketa to ne vpliva.");
  });
});

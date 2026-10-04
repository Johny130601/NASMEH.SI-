import { describe, expect, it } from "vitest";
import { headingText, slugifyHeading, withHeadingIds } from "@/lib/content/toc";
import { sanitizeContentHtml } from "@/lib/security/html-sanitizer";
import { LEGAL_PAGES } from "@/prisma/seed-legal";

/**
 * QA 2026-10-03 T1-04: the LEGAL pages carry a table of contents (spec §12.5
 * "legal w/ TOC"). The ids are added to the SANITIZED body from the heading
 * text alone, so they are stable, unique and can never carry operator markup.
 */

const h2Count = (html: string) => html.match(/<h2[\s>]/g)?.length ?? 0;

describe("slugifyHeading", () => {
  it("folds Slovenian diacritics and joins words with single hyphens", () => {
    expect(slugifyHeading("1. Splošne določbe")).toBe("1-splosne-dolocbe");
    expect(slugifyHeading("7. Odstop od pogodbe in reklamacije")).toBe("7-odstop-od-pogodbe-in-reklamacije");
    expect(slugifyHeading("Čiščenje & Žličke — Đurđa, ćevapi")).toBe("ciscenje-zlicke-durda-cevapi");
    expect(slugifyHeading("  --Zaščita obrazcev pred roboti--  ")).toBe("zascita-obrazcev-pred-roboti");
  });

  it("is empty for a heading with no letter or digit, and bounded for a long one", () => {
    expect(slugifyHeading("§ — !")).toBe("");
    const long = slugifyHeading("Zelo dolg naslov ".repeat(10));
    expect(long.length).toBeLessThanOrEqual(64);
    expect(long).not.toMatch(/-$/);
    expect(long).toMatch(/^zelo-dolg-naslov-/);
  });
});

describe("headingText", () => {
  it("shows what the reader sees: tags dropped, entity references decoded, spaces collapsed", () => {
    expect(headingText("<strong>Po</strong>datki &amp; pravice")).toBe("Podatki & pravice");
    expect(headingText("Varstvo &#269;lovekovih pravic &scaron;e")).toBe("Varstvo človekovih pravic še");
    expect(headingText("Prva vrstica<br />druga   vrstica")).toBe("Prva vrstica druga vrstica");
    expect(headingText("Neznano &bogus; ostane")).toBe("Neznano &bogus; ostane");
  });
});

describe("withHeadingIds", () => {
  it("gives every h2 an id and lists them in order, leaving the rest of the body as it was", () => {
    const body = sanitizeContentHtml(`<p>Uvod</p><h2>1. Prvi del</h2><p>a</p><h2 dir="ltr">2. Drugi del</h2><h3>Podrazdelek</h3>`);
    const { html, toc } = withHeadingIds(body);
    expect(toc).toEqual([
      { id: "1-prvi-del", text: "1. Prvi del" },
      { id: "2-drugi-del", text: "2. Drugi del" },
    ]);
    expect(html).toBe(`<p>Uvod</p><h2 id="1-prvi-del">1. Prvi del</h2><p>a</p><h2 dir="ltr" id="2-drugi-del">2. Drugi del</h2><h3>Podrazdelek</h3>`);
    // only ids were added: removing them gives back the sanitized body
    expect(html.replace(/ id="[^"]*"/g, "")).toBe(body);
  });

  it("keeps ids unique when a heading repeats", () => {
    const { toc } = withHeadingIds(sanitizeContentHtml("<h2>Roki</h2><h2>Roki</h2><h2>Roki 2</h2>"));
    expect(toc.map((entry) => entry.id)).toEqual(["roki", "roki-2", "roki-2-2"]);
  });

  it("skips an empty heading and numbers a heading whose text has no slug", () => {
    const { html, toc } = withHeadingIds(sanitizeContentHtml("<h2></h2><h2>§</h2><h2>Pravice</h2>"));
    expect(toc).toEqual([{ id: "section-1", text: "§" }, { id: "pravice", text: "Pravice" }]);
    expect(html.startsWith("<h2></h2>")).toBe(true);
  });

  it("never turns operator text into markup: the id is a slug, whatever the heading says", () => {
    const attack = sanitizeContentHtml(`<h2 id="x" onclick="alert(1)">"><img src=x onerror=alert(1)> Napad</h2>`);
    const { html, toc } = withHeadingIds(attack);
    expect(toc).toHaveLength(1);
    expect(toc[0].id).toMatch(/^[a-z0-9-]+$/);
    expect(html).not.toMatch(/onclick|onerror/);
    expect(html.match(/ id="/g)).toHaveLength(1);
  });

  it.each(LEGAL_PAGES.map((page) => [page.slug, page.body] as const))("covers every section of the seeded %s draft", (_slug, raw) => {
    const { html, toc } = withHeadingIds(sanitizeContentHtml(raw));
    expect(toc).toHaveLength(h2Count(raw));
    const ids = toc.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9-]+$/);
      expect(html.split(`id="${id}"`)).toHaveLength(2);
    }
  });

  it("gives the privacy policy one anchor per numbered section", () => {
    const privacy = LEGAL_PAGES.find((page) => page.slug === "politika-zasebnosti")!;
    const { toc } = withHeadingIds(sanitizeContentHtml(privacy.body));
    expect(toc.length).toBe(16);
    expect(toc[0]).toEqual({ id: "1-upravljavec", text: "1. Upravljavec" });
    expect(toc.at(-1)?.id).toBe("16-vase-pravice");
  });
});

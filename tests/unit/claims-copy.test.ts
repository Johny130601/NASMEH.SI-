import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GUARANTEE_HTML, PDP_CONTENT } from "@/prisma/seed-pdp";
import { admin, catalog, home, pdp } from "@/lib/copy";

/**
 * Phase 9 step 4 claims discipline (Reg. 655/2013): the seeded PDP and homepage copy stays
 * qualitative and qualified until the responsible person supplies substantiation (D4), and
 * the data migration brings unedited databases to exactly the seed text.
 */

const root = join(__dirname, "..", "..");
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

/** Removed wording that must not come back through the seed: figures, mechanism, absolutes, translated lines, static price terms. */
const REMOVED = [
  "n = ", "89 %", "96 %", "60 %", "neodvisni", "aktivni belilni kompleks", "aktivni sestavinski kompleks", "razgradi", "globlje madeže",
  "ne čutijo", "brez pekočega občutka", "ne da bi dražil", "brez draženja", "zasnovana prav za občutljive", "trajno",
  "do 12 ur", "dokaz", "dobesedno", "parabenov", "ni nobenega tveganja", "Prihranite", "brezplačn",
  "74,97", "šampon", "ščetka zamudi", "pusti za seboj", "Vzdržuje belino", "Vidno svetlejši", "vidno svetlejš",
];

describe("seeded PDP copy", () => {
  const all = JSON.stringify(PDP_CONTENT);

  it("carries none of the removed claims", () => {
    for (const phrase of REMOVED) expect(all.includes(phrase), phrase).toBe(false);
  });

  it("resolves every * marker to a qualified notes accordion and keeps markers out of snippets and FAQ answers", () => {
    for (const [slug, content] of Object.entries(PDP_CONTENT)) {
      const claims = [...content.customFields.uspChips, ...content.customFields.bullets, content.customFields.intro];
      if (claims.some((claim) => claim.includes("*"))) {
        expect(content.accordions.tested.startsWith("<p>*"), slug).toBe(true);
      }
      expect(content.accordions.tested, slug).toMatch(/rezultati (?:se )?lahko razlikujejo/i);
      expect(content.seoTitle + content.seoDescription, slug).not.toMatch(/[*^]/);
      for (const { a } of content.faq) expect(a, slug).not.toMatch(/[*^]/);
    }
  });

  it("keeps unqualifiable instant-effect and duration claims out of SEO titles and descriptions", () => {
    // Snippets, <title> and Product JSON-LD cannot carry a marker, so the claim is left out rather than left unqualified.
    for (const [slug, content] of Object.entries(PDP_CONTENT)) {
      expect(content.seoTitle + content.seoDescription, slug).not.toMatch(/takoj|traja|do naslednjega|\bur\b/i);
    }
    const serum = PDP_CONTENT["serum-korektor-barve-zob"];
    expect(serum.seoTitle).toBe("Serum korektor barve zob — začasna optična korekcija");
    // The starred chip stays qualified by its notes accordion.
    expect(serum.customFields.uspChips).toContain("Takojšen učinek*");
    expect(serum.accordions.tested.startsWith("<p>*Učinek je optičen in začasen")).toBe(true);
  });

  it("uses original, factual serum bullets instead of a competitor's re-apply line", () => {
    const bullets = PDP_CONTENT["serum-korektor-barve-zob"].customFields.bullets;
    expect(bullets.some((bullet) => /po potrebi|ponovite/i.test(bullet))).toBe(false);
    expect(bullets).toContain("Približno 30 nanosov v pakiranju");
  });

  it("summarises the guarantee, links its terms page and keeps statutory rights", () => {
    expect(GUARANTEE_HTML).toContain('href="/garancija-vracila-denarja"');
    expect(GUARANTEE_HTML).toContain("ne vpliva na vaše zakonske pravice");
    expect(GUARANTEE_HTML).not.toMatch(/tveganj|Odstop od pogodbe|info@/);
    for (const content of Object.values(PDP_CONTENT)) expect(content.accordions.guarantee).toBe(GUARANTEE_HTML);
  });

  it("gives pregnancy and sensitivity questions a neutral consult-first answer", () => {
    const faq = PDP_CONTENT["belilni-trakci-za-zobe"].faq;
    expect(faq.find((item) => item.q.includes("nosečnostjo"))?.a).toBe("Med nosečnostjo in dojenjem se pred uporabo posvetujte z zdravnikom.");
    expect(faq.find((item) => item.q.includes("občutljivih"))?.a).toMatch(/^Če imate občutljive zobe, se pred uporabo posvetujte z zobozdravnikom\./);
  });
});

describe("UI copy", () => {
  it("homepage, catalog and PDP strings carry original, unqualified-claim-free wording", () => {
    expect(home.routineBanner.title).not.toMatch(/urejena|vsakodnevna rutina beljenja/i);
    expect(home.routineBanner.footnote.startsWith("*")).toBe(false); // the banner has no marker to resolve
    expect(home.hero.subtitle).not.toMatch(/zvezdnik|[*^]/);
    expect(catalog.seoBlock.more).not.toMatch(/tveganj|občutljive|brezplačn|preizkus/);
    // The teaser is also the /trgovina meta description, where no marker can resolve.
    expect(catalog.seoBlock.teaser).not.toMatch(/takoj|[*^]/i);
    expect(catalog.seoBlock.teaser).toContain("serum korektor za začasno optično korekcijo");
    expect(pdp.accordions.tested).not.toMatch(/Testirano/);
  });

  it("the admin product editor names the claim-notes field as the storefront does", () => {
    const label = admin.catalog.editor.content.accordions.tested;
    expect(label).not.toMatch(/Testirano/);
    expect(label).toBe(`${pdp.accordions.tested.replace(/^\*/, "")} (HTML)`);
    expect(admin.catalog.editor.content.testedHint).toMatch(/\* ali \^/);
    expect(admin.catalog.editor.content.testedHint).toMatch(/dokazila/);
  });
});

describe("20260913120000_phase9_claims_copy", () => {
  const sql = read("prisma", "migrations", "20260913120000_phase9_claims_copy", "migration.sql");
  const phase7 = read("prisma", "migrations", "20260910180000_phase7_cms", "migration.sql");
  const seed = read("prisma", "seed.ts");
  const unquote = (literal: string) => literal.replace(/''/g, "'");
  const at = (value: unknown, path: string) => path.split(",").reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], value);

  it("updates the routine banner only while it holds the phase 7 default, to the copy fallback", () => {
    const phase7Default = JSON.parse(/\('home\.routineBanner', '(\{[\s\S]*?\})'::jsonb/.exec(phase7)![1]) as { title: string; footnote: string };
    const title = /'\{title\}', to_jsonb\('((?:[^']|'')*)'::text\)\),[\s\S]*?AND "value"->>'title' = '((?:[^']|'')*)';/.exec(sql)!;
    expect(unquote(title[1])).toBe(home.routineBanner.title);
    expect(unquote(title[2])).toBe(phase7Default.title);
    const footnote = /'\{footnote\}', to_jsonb\('((?:[^']|'')*)'::text\)\),[\s\S]*?AND "value"->>'footnote' = '((?:[^']|'')*)';/.exec(sql)!;
    expect(unquote(footnote[1])).toBe(home.routineBanner.footnote);
    expect(unquote(footnote[2])).toBe(phase7Default.footnote);
    expect(seed).toContain(`title: ${JSON.stringify(home.routineBanner.title)}`);
    expect(seed).toContain(`footnote: ${JSON.stringify(home.routineBanner.footnote)}`);
  });

  it("gives an unedited hero the seeded subtitle and footnote, never replacing an existing footnote", () => {
    const hero = /'\{subtitle\}', to_jsonb\('((?:[^']|'')*)'::text\)\),\s*'\{footnote\}', to_jsonb\('((?:[^']|'')*)'::text\)\),[\s\S]*?WHERE "key" = 'home\.hero'\s+AND "value"->>'subtitle' = '((?:[^']|'')*)'\s+AND coalesce\("value"->>'footnote', ''\) = '';/.exec(sql)!;
    expect(seed).toContain(JSON.stringify(unquote(hero[1])));
    expect(seed).toContain(JSON.stringify(unquote(hero[2])));
    expect(unquote(hero[1])).toContain("*");
    expect(unquote(hero[2]).startsWith("*")).toBe(true);
    expect(seed).not.toContain(unquote(hero[3]));
  });

  it("corrects the seeded shipping estimate to the seed's grammatical text, only on methods that still hold the exact old string", () => {
    const statement = /UPDATE "Setting"\s+SET "value" = \([\s\S]*?\);\s*(?=\r?\n)/.exec(sql.slice(sql.indexOf("-- Copy fix, not a claim")))?.[0] ?? "";
    expect(statement).toContain(`WHERE "key" = 'shipping.methods'`);
    const replaced = [...statement.matchAll(/method->>'estimate' = '((?:[^']|'')*)'/g)].map((match) => unquote(match[1]));
    expect(replaced).toEqual(["2–4 delovna dneva", "2–4 delovna dneva"]); // the CASE and the EXISTS guard
    const next = /jsonb_set\(method, '\{estimate\}', to_jsonb\('((?:[^']|'')*)'::text\)\)/.exec(statement)![1];
    expect(unquote(next)).toBe("2–4 delovne dni");
    // Order kept, other elements passed through unchanged.
    expect(statement).toMatch(/ELSE method END\s+ORDER BY ord\)/);
    expect(statement).toContain("WITH ORDINALITY");
    expect(seed).toContain(`estimate: ${JSON.stringify(unquote(next))}`);
    expect(seed).not.toContain(`estimate: ${JSON.stringify(replaced[0])}`);
    expect(seed).toContain('estimate: "1–2 delovna dneva"'); // correct dual form, left alone
  });

  it("sets every product field to the seed value, guarded by an old value the seed no longer carries", () => {
    const statements = sql.split(/;\r?\n/).filter((statement) => statement.includes('UPDATE "Product"'));
    expect(statements.length).toBeGreaterThan(40);
    const all = JSON.stringify(PDP_CONTENT);
    const lit = "'((?:[^']|'')*)'";
    for (const statement of statements) {
      const slug = /WHERE "slug" = '([a-z0-9-]+)'/.exec(statement)![1];
      const content = PDP_CONTENT[slug];
      expect(content, slug).toBeDefined();
      let match: RegExpExecArray | null;
      if ((match = new RegExp(`SET "(\\w+)" = jsonb_set\\("\\w+", '\\{([^}]*)\\}', to_jsonb\\(${lit}::text\\)\\)[\\s\\S]*#>> '\\{[^}]*\\}' = ${lit}$`).exec(statement))) {
        const [, column, path, next, previous] = match;
        expect(at(content[column as keyof typeof content], path), `${slug} ${column}.${path}`).toBe(unquote(next));
        expect(all.includes(JSON.stringify(unquote(previous)).slice(1, -1)), `${slug} ${column}.${path} guard`).toBe(false);
      } else if ((match = new RegExp(`SET "(\\w+)" = jsonb_set\\("\\w+", '\\{([^}]*)\\}', ${lit}::jsonb\\)[\\s\\S]*#> '\\{[^}]*\\}' = ${lit}::jsonb$`).exec(statement))) {
        const [, column, path, next, previous] = match;
        expect(at(content[column as keyof typeof content], path), `${slug} ${column}.${path}`).toEqual(JSON.parse(unquote(next)));
        expect(at(content[column as keyof typeof content], path)).not.toEqual(JSON.parse(unquote(previous)));
      } else if ((match = new RegExp(`SET "(\\w+)" = ${lit}, "updatedAt"[\\s\\S]*AND "\\w+" = ${lit}$`).exec(statement))) {
        const [, column, next, previous] = match;
        if (column === "description") {
          expect(seed, slug).toContain(JSON.stringify(unquote(next)));
          expect(seed, slug).not.toContain(unquote(previous));
        } else {
          expect(content[column as "seoTitle" | "seoDescription"], `${slug} ${column}`).toBe(unquote(next));
          expect(all.includes(unquote(previous))).toBe(false);
        }
      } else {
        throw new Error(`unrecognised statement: ${statement.slice(0, 160)}`);
      }
    }
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LEGAL_PAGES } from "@/prisma/seed-legal";

/**
 * Phase 9 step 5: 20260915100000_phase9_legal_pages_bootstrap inserts the five legal pages a fresh
 * production database lacks (the guarantee page comes from the phase 6 migration), only when the slug
 * is missing, with exactly the seed text. The seed stays the single source of the draft wording.
 */
const sql = readFileSync(path.join(process.cwd(), "prisma/migrations/20260915100000_phase9_legal_pages_bootstrap/migration.sql"), "utf8");
const unquote = (value: string) => value.replace(/''/g, "'");
const statements = sql.split(/;\s*\n/).filter((statement) => statement.includes('INSERT INTO "ContentPage"'));
const inserts = statements.map((statement) => {
  const match =
    /INSERT INTO "ContentPage" \("id", "title", "slug", "body", "template", "seoDescription", "published", "reviewed", "createdAt", "updatedAt"\)\s+SELECT\s+'cp_' \|\| md5\(random\(\)::text \|\| clock_timestamp\(\)::text\),\s+'((?:[^']|'')*)',\s+'((?:[^']|'')*)',\s+'((?:[^']|'')*)',\s+'LEGAL',\s+'((?:[^']|'')*)',\s+true,\s+false,\s+CURRENT_TIMESTAMP,\s+CURRENT_TIMESTAMP\s+WHERE NOT EXISTS \(SELECT 1 FROM "ContentPage" WHERE "slug" = '((?:[^']|'')*)'\)/.exec(statement);
  if (!match) throw new Error(`unparsed statement: ${statement.slice(0, 120)}`);
  return { title: unquote(match[1]), slug: unquote(match[2]), body: unquote(match[3]), seoDescription: unquote(match[4]), guardSlug: unquote(match[5]) };
});

describe("legal pages bootstrap migration", () => {
  it("inserts every seeded legal page except the guarantee page, guarded on its own slug", () => {
    const expected = LEGAL_PAGES.filter((page) => page.slug !== "garancija-vracila-denarja").map((page) => page.slug).sort();
    expect(inserts.map((insert) => insert.slug).sort()).toEqual(expected);
    for (const insert of inserts) expect(insert.guardSlug).toBe(insert.slug);
    expect(sql.startsWith("-- ") && sql.includes("\nBEGIN;\n") && sql.trimEnd().endsWith("COMMIT;")).toBe(true);
  });

  it("carries exactly the seed text, published and unreviewed", () => {
    for (const insert of inserts) {
      const page = LEGAL_PAGES.find((candidate) => candidate.slug === insert.slug)!;
      expect(insert.title, insert.slug).toBe(page.title);
      expect(insert.body, insert.slug).toBe(page.body);
      expect(insert.seoDescription, insert.slug).toBe(page.seoDescription);
    }
  });

  it("does not write anything else", () => {
    const other = sql.split(/;\s*\n/).filter((statement) => /^\s*(UPDATE|DELETE|ALTER|CREATE|DROP)\b/m.test(statement));
    expect(other).toEqual([]);
  });
});

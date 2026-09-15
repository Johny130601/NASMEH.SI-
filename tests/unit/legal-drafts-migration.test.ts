import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LEGAL_PAGES } from "@/prisma/seed-legal";

/**
 * Phase 9 step 4: 20260913110000_phase9_legal_drafts rewrites unreviewed draft sentences in
 * existing databases; prisma/seed-legal.ts must carry the same resulting text for fresh ones.
 */
const sql = readFileSync(path.join(process.cwd(), "prisma/migrations/20260913110000_phase9_legal_drafts/migration.sql"), "utf8");
const unquote = (value: string) => value.replace(/''/g, "'");
const page = (slug: string) => LEGAL_PAGES.find((candidate) => candidate.slug === slug);

const statements = sql.split(/;\s*\n/).filter((statement) => statement.includes('UPDATE "ContentPage"'));
const replacements = statements.flatMap((statement) => {
  const match = /replace\("body",\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)'\)[\s\S]*?WHERE "slug" = '([^']+)' AND "reviewed" = false\s+AND strpos\("body", '((?:[^']|'')*)'\) > 0/.exec(statement);
  return match ? [{ from: unquote(match[1]), to: unquote(match[2]), slug: match[3], guard: unquote(match[4]), statement }] : [];
});

describe("legal draft data migration", () => {
  it("guards every body statement on an unreviewed page that still holds the exact old sentence", () => {
    const bodyStatements = statements.filter((statement) => statement.includes('SET "body"'));
    expect(replacements).toHaveLength(bodyStatements.length);
    expect(replacements.length).toBeGreaterThanOrEqual(18);
    for (const replacement of replacements) {
      expect(replacement.guard).toBe(replacement.from);
      expect(replacement.statement).toContain('"updatedAt" = CURRENT_TIMESTAMP');
    }
  });

  it.each([
    ["reklamacije", "consumers/odr"],
    ["pogoji-poslovanja", "Klarna"],
    ["politika-piskotkov", "Svoj izbiro"],
    ["odstop-od-pogodbe", "(ZVPot)"],
    ["odstop-od-pogodbe", "odpečateni oz. odprti"],
    ["odstop-od-pogodbe", "od prejema vrnjenega blaga"],
    ["odstop-od-pogodbe", "podaljšana garancija"],
  ])("leaves no outdated wording on %s (%s)", (slug, outdated) => {
    expect(page(slug)?.body).not.toContain(outdated);
  });

  it("mirrors each replacement in the seed text for fresh databases", () => {
    for (const { slug, from, to } of replacements) {
      const body = page(slug)?.body ?? "";
      expect(body, `${slug}: new text`).toContain(to);
      if (from.trim() && !to.includes(from)) expect(body, `${slug}: old text`).not.toContain(from);
    }
    const seoStatements = [...sql.matchAll(/SET "seoDescription" = '((?:[^']|'')*)'[\s\S]*?WHERE "slug" = '([^']+)'/g)];
    expect(seoStatements.length).toBeGreaterThanOrEqual(2);
    for (const seo of seoStatements) expect(page(seo[2])?.seoDescription, `${seo[2]}: seoDescription`).toBe(unquote(seo[1]));
  });
});

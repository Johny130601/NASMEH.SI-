import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * Phase 9 step 4 (S11): the ConsentLog subject-reference lookup has one partial expression index per
 * reference key, and every index matches the expression and predicate consentReferenceQuery filters on,
 * so a change to either side is caught here instead of silently falling back to a sequential scan.
 */

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/support/photos", () => ({ removeSupportPhotos: vi.fn() }));

import { consentReferenceQuery } from "@/lib/admin/customers";

const migration = readFileSync(
  join(__dirname, "..", "..", "prisma", "migrations", "20260913130000_phase9_consent_reference_indexes", "migration.sql"),
  "utf8",
);
const schema = readFileSync(join(__dirname, "..", "..", "prisma", "schema.prisma"), "utf8");
const KEYS = ["orderNumber", "subscriberId", "subscriptionId"] as const;

describe("20260913130000_phase9_consent_reference_indexes", () => {
  const statements = migration.split(/\r?\n/).filter((line) => line.startsWith("CREATE INDEX"));

  it("creates exactly one guarded, partial expression index per reference key", () => {
    expect(statements).toEqual(KEYS.map((key) =>
      `CREATE INDEX IF NOT EXISTS "ConsentLog_choices_${key}_idx" ON "ConsentLog" (("choices"->>'${key}')) WHERE "kind" <> 'cookie';`));
    // Data-free and schema-engine-invisible: no other DDL, and every index keeps its predicate
    // (the schema engine only skips partial indexes; a plain expression index would be diffed as drift).
    const ddl = migration.split(/\r?\n/).filter((line) => line.trim() && !line.startsWith("--"));
    expect(ddl).toEqual(statements);
    for (const statement of statements) expect(statement).toMatch(/ WHERE "kind" <> 'cookie';$/);
  });

  it("matches the expressions and the kind predicate of consentReferenceQuery", () => {
    const sql = consentReferenceQuery({ orderNumbers: ["NS-1"], subscriberIds: ["s1"], subscriptionIds: ["b1"] })!.text.replace(/\s+/g, " ");
    // The query's WHERE implies the index predicate, so the planner may use the partial indexes.
    expect(sql).toContain(`WHERE "kind" <> 'cookie'`);
    for (const key of KEYS) expect(sql).toContain(`("choices"->>'${key}') = ANY(`);
  });

  it("the ConsentLog model declares no index of the same name that Prisma would manage", () => {
    const model = /model ConsentLog \{[\s\S]*?\n\}/.exec(schema)![0];
    expect(model).not.toMatch(/choices_\w+_idx/);
  });
});

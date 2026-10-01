import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * QA 2026-10-01: `lib/copy/index.ts` re-exports every copy module, and webpack cannot
 * drop the unused ones from a client bundle — so one `import { cart } from "@/lib/copy"`
 * in a client component shipped all Slovenian copy, admin screens included, to every
 * storefront page (≈ 30 kB of first-load JavaScript, and mobile LCP tracks script
 * evaluation). Code that can reach a client bundle imports the module it needs
 * (`@/lib/copy/cart`); only server-only route files may use the barrel (AGENTS §8.5).
 */

const root = join(__dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const BARREL = /from\s+["']@\/lib\/copy["']/;

describe("copy imports stay per module wherever a client bundle can reach them", () => {
  it("components/ and lib/ never import the @/lib/copy barrel", () => {
    const offenders = [...walk(join(root, "components")), ...walk(join(root, "lib"))]
      .filter((file) => !file.includes(join("lib", "copy")))
      .filter((file) => BARREL.test(readFileSync(file, "utf8")))
      .map((file) => relative(root, file));
    expect(offenders).toEqual([]);
  });

  it("no \"use client\" file under app/ imports the barrel", () => {
    const offenders = walk(join(root, "app"))
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return /^\s*["']use client["']/.test(source) && BARREL.test(source);
      })
      .map((file) => relative(root, file));
    expect(offenders).toEqual([]);
  });
});

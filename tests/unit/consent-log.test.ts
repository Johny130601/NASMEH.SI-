import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  CONSENT_KINDS,
  consentRecordSchema,
  lastLoggedCookieChoice,
  marketingVersion,
  marketingWording,
  recordConsent,
  wordingVersion,
} from "@/lib/consent-log";

const root = join(__dirname, "..", "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("recordConsent", () => {
  it("writes a validated row and returns the create call", () => {
    const create = vi.fn().mockReturnValue("pending");
    const result = recordConsent({ consentLog: { create } } as never, {
      kind: "cookie", version: "3", visitorId: "5f0c", choices: { analytics: true, marketing: false },
    });
    expect(result).toBe("pending");
    expect(create).toHaveBeenCalledWith({ data: {
      kind: "cookie", version: "3", choices: { analytics: true, marketing: false }, userId: null, visitorId: "5f0c",
    } });
  });

  it.each([
    ["an empty version", { kind: "cookie", version: " ", choices: { analytics: true, marketing: true } }],
    ["empty choices", { kind: "marketing-email", version: "t-1", choices: {} }],
    ["a cookie row without categories", { kind: "cookie", version: "1", choices: { analytics: true } }],
    ["a marketing row without the marketing choice", { kind: "marketing-checkout", version: "t-1", choices: { orderNumber: "NS-1" } }],
    ["a back-in-stock row without the product", { kind: "back-in-stock", version: "t-1", choices: { marketing: false } }],
    ["an unknown kind", { kind: "terms", version: "1", choices: { marketing: true } }],
  ])("refuses %s before writing", (_label, input) => {
    const create = vi.fn();
    expect(() => recordConsent({ consentLog: { create } } as never, input as never)).toThrow();
    expect(create).not.toHaveBeenCalled();
  });

  it("accepts every kind with its minimum choices", () => {
    for (const kind of CONSENT_KINDS) {
      const choices = kind === "cookie" ? { analytics: false, marketing: false }
        : kind === "back-in-stock" ? { productSlug: "serum" } : { marketing: false };
      expect(consentRecordSchema.safeParse({ kind, version: "1", choices }).success).toBe(true);
    }
  });
});

describe("lastLoggedCookieChoice", () => {
  it("reads the newest cookie row of a consent id and ignores rows without both categories", async () => {
    const findFirst = vi.fn().mockResolvedValue({ choices: { analytics: true, marketing: false, ts: 5 } });
    const client = { consentLog: { findFirst } } as never;
    expect(await lastLoggedCookieChoice(client, "id-1")).toEqual({ analytics: true, marketing: false });
    expect(findFirst).toHaveBeenCalledWith({
      where: { visitorId: "id-1", kind: "cookie" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { choices: true },
    });
    findFirst.mockResolvedValue({ choices: { analytics: "yes" } });
    expect(await lastLoggedCookieChoice(client, "id-1")).toBeNull();
    findFirst.mockResolvedValue(null);
    expect(await lastLoggedCookieChoice(client, "id-1")).toBeNull();
  });
});

describe("marketing wording versions", () => {
  it("derives the version from the wording, so a copy change changes the version", () => {
    expect(wordingVersion("Želim prejemati e-novice.")).toMatch(/^t-[0-9a-f]{12}$/);
    expect(wordingVersion("Želim prejemati e-novice.")).not.toBe(wordingVersion("Želim prejemati e-novice in ponudbe."));
    for (const kind of CONSENT_KINDS.filter((k) => k !== "cookie")) {
      expect(marketingWording(kind).trim().length).toBeGreaterThan(0);
      expect(marketingVersion(kind)).toBe(wordingVersion(marketingWording(kind)));
    }
  });
});

describe("consent-log audit: single write path", () => {
  it("no code outside lib/consent-log.ts writes ConsentLog directly", () => {
    const offenders = ["app", "lib", "components", "prisma"]
      .flatMap((dir) => sourceFiles(join(root, dir)))
      .filter((file) => relative(root, file).split(sep).join("/") !== "lib/consent-log.ts")
      .filter((file) => /consentLog\.(create|createMany|upsert|update|updateMany)\s*\(/.test(readFileSync(file, "utf8")))
      .map((file) => relative(root, file).split(sep).join("/"));
    expect(offenders).toEqual([]);
  });
});

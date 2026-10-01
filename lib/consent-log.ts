import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { account } from "@/lib/copy/account";
import { auth } from "@/lib/copy/auth";
import { backInStock } from "@/lib/copy/backInStock";
import { checkout } from "@/lib/copy/checkout";
import { footer } from "@/lib/copy/footer";

/**
 * The single write path to ConsentLog (GDPR Art. 7(1): the controller must be
 * able to show what was consented to, when and in which wording). Every row
 * carries a kind, a non-empty version and non-empty choices; the unit suite
 * refuses any `consentLog.create` outside this module.
 */

export const CONSENT_KINDS = [
  "cookie",
  "marketing-checkout",
  "marketing-register",
  "marketing-activation",
  "marketing-preference",
  "marketing-email",
  "back-in-stock",
] as const;

export type ConsentKind = (typeof CONSENT_KINDS)[number];

/** Short, stable fingerprint of the wording a person saw. */
export function wordingVersion(text: string): string {
  return `t-${createHash("sha256").update(text.normalize("NFC"), "utf8").digest("hex").slice(0, 12)}`;
}

/**
 * Wording shown next to each marketing choice. The logged version is derived
 * from the text, so a copy change produces a new version without a manual bump
 * and the version resolves to a tracked string in git history. Cookie consent
 * is versioned by the `consent.version` Setting instead (admin bump).
 */
export function marketingWording(kind: Exclude<ConsentKind, "cookie">): string {
  switch (kind) {
    case "marketing-checkout":
      return checkout.contact.marketingOptIn;
    case "marketing-register":
    case "marketing-activation":
      return auth.register.marketing;
    case "marketing-preference":
      return account.addresses.marketing;
    case "marketing-email":
      return footer.newsletter.note;
    case "back-in-stock":
      return backInStock.note;
  }
}

export function marketingVersion(kind: Exclude<ConsentKind, "cookie">): string {
  return wordingVersion(marketingWording(kind));
}

const choiceValue = z.union([z.boolean(), z.string().max(200), z.number(), z.null()]);

export const consentRecordSchema = z
  .object({
    kind: z.enum(CONSENT_KINDS),
    version: z.string().trim().min(1).max(64),
    choices: z.record(z.string(), choiceValue),
    userId: z.string().min(1).nullish(),
    visitorId: z.string().min(1).max(64).nullish(),
  })
  .superRefine((row, ctx) => {
    const keys = Object.keys(row.choices);
    if (keys.length === 0) {
      ctx.addIssue({ code: "custom", path: ["choices"], message: "empty choices" });
      return;
    }
    if (row.kind === "cookie") {
      for (const key of ["analytics", "marketing"] as const) {
        if (typeof row.choices[key] !== "boolean") {
          ctx.addIssue({ code: "custom", path: ["choices", key], message: "cookie category missing" });
        }
      }
    } else if (row.kind === "back-in-stock") {
      if (typeof row.choices.productSlug !== "string") {
        ctx.addIssue({ code: "custom", path: ["choices", "productSlug"], message: "product missing" });
      }
    } else if (typeof row.choices.marketing !== "boolean") {
      ctx.addIssue({ code: "custom", path: ["choices", "marketing"], message: "marketing choice missing" });
    }
  });

export type ConsentRecord = z.input<typeof consentRecordSchema>;

type ConsentClient = Pick<Prisma.TransactionClient, "consentLog">;

/**
 * Validates and returns the create call un-awaited, so it works inside an
 * interactive transaction (`await recordConsent(tx, …)`) and in the array
 * form of `db.$transaction([...])`. Invalid input throws before any write.
 */
export function recordConsent(client: ConsentClient, input: ConsentRecord) {
  const row = consentRecordSchema.parse(input);
  return client.consentLog.create({
    data: {
      kind: row.kind,
      version: row.version,
      choices: row.choices as Prisma.InputJsonObject,
      userId: row.userId ?? null,
      visitorId: row.visitorId ?? null,
    },
  });
}

const loggedCookieChoiceSchema = z.object({ analytics: z.boolean(), marketing: z.boolean() });

/**
 * The categories of the newest cookie-consent row for a consent id, or null
 * when the log holds none. The consent action uses it to tell a withdrawal of
 * a logged grant (always recorded) from a forged cookie (rate limited).
 */
export async function lastLoggedCookieChoice(
  client: Pick<Prisma.TransactionClient, "consentLog">,
  visitorId: string,
): Promise<{ analytics: boolean; marketing: boolean } | null> {
  const row = await client.consentLog.findFirst({
    where: { visitorId, kind: "cookie" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { choices: true },
  });
  const parsed = loggedCookieChoiceSchema.safeParse(row?.choices);
  return parsed.success ? parsed.data : null;
}

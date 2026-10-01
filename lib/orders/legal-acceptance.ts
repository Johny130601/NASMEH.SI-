import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { checkout } from "@/lib/copy/checkout";
import { wordingVersion } from "@/lib/consent-log";

/**
 * Which terms and withdrawal texts were in force when an order was placed
 * (Order.legalAcceptance, Phase 9 step 4). ContentPage bodies are edited in
 * place, so the order keeps each page's slug, updatedAt, title and the
 * published body HTML itself next to its SHA-256: the confirmation's copy of
 * the texts is rendered from that stored body, not from the page as it reads
 * when the mail goes out. Orders placed before the body was stored carry only
 * the hash (lib/invoice/legal-texts-pdf.ts falls back to the live page for
 * them). A missing or unpublished page is recorded with null hash instead of
 * failing the order.
 */

export const LEGAL_ACCEPTANCE_KEYS = ["terms", "withdrawal"] as const;
export type LegalAcceptanceKey = (typeof LEGAL_ACCEPTANCE_KEYS)[number];

export type LegalAcceptancePage = {
  key: LegalAcceptanceKey;
  path: string;
  slug: string | null;
  updatedAt: string | null;
  sha256: string | null;
  /** The page title and body HTML as published at placement; null when no page was found. */
  title: string | null;
  body: string | null;
};

export type LegalAcceptance = {
  acceptedAt: string;
  /** Fingerprint of the notice shown above the order button. */
  noticeVersion: string;
  pages: LegalAcceptancePage[];
};

type LegalPageClient = Pick<Prisma.TransactionClient, "contentPage">;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `/pogoji-poslovanja?e2e=1#top` → `/pogoji-poslovanja`. */
export function legalLinkPath(href: string): string {
  return href.trim().split(/[?#]/, 1)[0] || "/";
}

/** The single-segment ContentPage slug a path names, or null when no page can serve it. */
export function legalLinkSlug(path: string): string | null {
  const slug = path.startsWith("/") ? path.slice(1).replace(/\/+$/, "") : "";
  return SLUG_PATTERN.test(slug) ? slug : null;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** The review-step notice as the shopper reads it (CheckoutWizard renders the same parts). */
export function legalNoticeText(): string {
  const legal = checkout.review.legal;
  return `${legal.termsLead} ${legal.termsLink}. ${legal.withdrawalLead} ${legal.withdrawalLink} ${legal.withdrawalTail}`;
}

export async function resolveLegalAcceptance(
  client: LegalPageClient,
  links: Record<LegalAcceptanceKey, string>,
  acceptedAt: Date,
): Promise<LegalAcceptance> {
  const pages: LegalAcceptancePage[] = [];
  for (const key of LEGAL_ACCEPTANCE_KEYS) {
    const path = legalLinkPath(links[key]);
    const slug = legalLinkSlug(path);
    // The storefront routes serve only published pages, so an unpublished draft was not what the shopper could open.
    const page = slug
      ? await client.contentPage.findFirst({ where: { slug, published: true }, select: { title: true, body: true, updatedAt: true } })
      : null;
    pages.push({
      key, path, slug,
      updatedAt: page ? page.updatedAt.toISOString() : null,
      sha256: page ? sha256Hex(page.body) : null,
      title: page?.title ?? null,
      body: page?.body ?? null,
    });
  }
  return { acceptedAt: acceptedAt.toISOString(), noticeVersion: wordingVersion(legalNoticeText()), pages };
}

"use server";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { variantIsPurchasable } from "@/lib/cart/visibility";
import { isSoldOut, sellableStock } from "@/lib/bundle/availability";
import { lineQuantityCap } from "@/lib/cart/hydrate";
import {
  addToCart,
  ensureCartLines,
  getCartLines,
  removeLine,
  setLineQuantity,
} from "@/lib/cart/server";
import { cartLineSchema, type CartLine } from "@/lib/cart/codec";
import { applyKodaCode, readKodaCode } from "@/lib/koda";
import { getBundleBuilder } from "@/lib/settings";

export interface CartActionResult {
  ok: boolean;
  count: number;
  message?: string;
  /** The line already sat at its per-order cap: nothing was added. */
  capped?: boolean;
  /**
   * Nothing was added because the product sold out (`soldOut`) or can no longer be bought at all
   * (`unavailable`: archived, drafted, a withdrawn bundle) since the page was rendered — said as
   * such, not as a failure to retry (QA 2026-10-03 T5-07).
   */
  soldOut?: boolean;
  unavailable?: boolean;
  /**
   * Units this add really stored, which is less than the quantity asked for
   * when the cap clamped it. Only the add paths (add and "Kupi zdaj") set it;
   * it is what may be announced to the shopper and reported to analytics.
   */
  addedQuantity?: number;
}

/**
 * What the gates read about a variant: its cap and stock, and the product's
 * purchasability — including a fixed bundle's "Aktiven" switch and its
 * components' stock (lib/bundle/availability), because a bundle's own stock
 * row is never decremented.
 */
const VARIANT_GATE_SELECT = {
  id: true,
  maxCartQuantity: true,
  stock: true,
  allowBackorder: true,
  product: {
    select: {
      status: true,
      hiddenDeal: true,
      bundle: {
        select: {
          active: true,
          items: { select: { quantity: true, variant: { select: { stock: true, allowBackorder: true } } } },
        },
      },
    },
  },
} as const;

interface GatedVariant {
  maxCartQuantity: number;
  stock: number;
  allowBackorder: boolean;
  product: {
    status: "DRAFT" | "ACTIVE" | "ARCHIVED";
    hiddenDeal: boolean;
    bundle?: {
      active: boolean;
      items: Array<{ quantity: number; variant: { stock: number; allowBackorder: boolean } }>;
    } | null;
  };
}

/** The shared purchasability rule (lib/cart/visibility), a withdrawn bundle included. */
function isPurchasable(variant: GatedVariant): boolean {
  const { status, hiddenDeal, bundle } = variant.product;
  return variantIsPurchasable({ status, hiddenDeal, bundle: bundle ?? null });
}

/** The stock the shopper can buy: a bundle's is what its components can fill. */
function availabilityOf(variant: GatedVariant) {
  return sellableStock(variant, variant.product.bundle ?? null);
}

/**
 * The most units a line may hold: the per-line cap and no more than the stock
 * (a bundle's components) can fill unless backorders are allowed. It is the
 * very cap the cart reads every line back under (lib/cart/hydrate), so an add
 * the cart would shrink is answered as capped, never confirmed (AGENTS §8.23).
 */
function lineCapOf(variant: GatedVariant): number {
  return lineQuantityCap(variant.maxCartQuantity, variant, variant.product.bundle ?? null);
}

/**
 * Cart mutations (AGENTS §5.2): the client sends INTENT — variant id +
 * quantity ONLY. Prices/maxCartQuantity/stock are re-read from the DB on
 * every call; a client-sent price is ignored by design (zod strips it).
 */
async function resolveVariant(variantId: string) {
  const variant = await db.variant.findUnique({
    where: { id: variantId },
    select: VARIANT_GATE_SELECT,
  });
  if (!variant || !isPurchasable(variant)) return null;
  return variant;
}

function countOf(lines: Array<{ quantity: number }>): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export async function addToCartAction(input: unknown): Promise<CartActionResult> {
  const parsed = cartLineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, count: 0 };

  const variant = await resolveVariant(parsed.data.variantId);
  if (!variant) return { ok: false, count: 0, unavailable: true };
  if (isSoldOut(availabilityOf(variant))) return { ok: false, count: 0, soldOut: true };

  const session = await auth();
  const { lines, addedQuantity } = await addToCart(
    session?.user?.id ?? null,
    parsed.data,
    lineCapOf(variant),
  );
  // The cap clamps silently: an add that changed nothing must not answer ok.
  if (addedQuantity <= 0) return { ok: false, count: countOf(lines), capped: true };
  return { ok: true, count: countOf(lines), addedQuantity };
}

/**
 * "Kupi zdaj" on the PDP: the line is raised to AT LEAST the quantity asked
 * for, never by it (`ensureCartLines`), so a product the shopper already holds
 * — or a second click — reaches the checkout as asked, not doubled. `ok` means
 * the line holds the full quantity and the button continues to the checkout,
 * with `addedQuantity` the units this click added (0 when the cart already
 * held them). A cap or stock that stops the line short answers `capped` with
 * the units that did land: the PDP reports them, and nothing short of the ask
 * is carried silently into the checkout (AGENTS §8.23).
 */
export async function buyNowAction(input: unknown): Promise<CartActionResult> {
  const parsed = cartLineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, count: 0 };

  const variant = await resolveVariant(parsed.data.variantId);
  if (!variant) return { ok: false, count: 0, unavailable: true };
  if (isSoldOut(availabilityOf(variant))) return { ok: false, count: 0, soldOut: true };

  const session = await auth();
  const { lines, results } = await ensureCartLines(
    session?.user?.id ?? null,
    [parsed.data],
    new Map([[parsed.data.variantId, lineCapOf(variant)]]),
  );
  const result = results[0];
  const addedQuantity = result?.addedQuantity ?? 0;
  if (!result || result.storedQuantity < parsed.data.quantity) {
    return { ok: false, count: countOf(lines), capped: true, ...(addedQuantity > 0 ? { addedQuantity } : {}) };
  }
  return { ok: true, count: countOf(lines), addedQuantity };
}

export async function updateCartLineAction(input: unknown): Promise<CartActionResult> {
  const parsed = cartLineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, count: 0 };

  const variant = await resolveVariant(parsed.data.variantId);
  if (!variant) return { ok: false, count: 0 };

  const session = await auth();
  // A line that sold out in the cart may be lowered or removed, never raised. Its cap
  // falls back to the per-line cap (hydration keeps the stored quantity so order
  // creation names the stock-out), so the stored quantity is the limit here.
  if (isSoldOut(availabilityOf(variant))) {
    const current = await getCartLines(session?.user?.id ?? null);
    const stored = current.find((line) => line.variantId === parsed.data.variantId)?.quantity ?? 0;
    if (parsed.data.quantity > stored) return { ok: false, count: countOf(current), capped: true };
  }
  const lines = await setLineQuantity(
    session?.user?.id ?? null,
    parsed.data.variantId,
    parsed.data.quantity,
    // a line never outgrows what its stock or components can fill (at least 1, so a line is lowered, never removed here)
    Math.max(1, lineCapOf(variant)),
  );
  return { ok: true, count: countOf(lines) };
}

export async function removeCartLineAction(input: unknown): Promise<CartActionResult> {
  const parsed = z
    .object({ variantId: z.string().min(1).max(64) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, count: 0 };

  const session = await auth();
  const lines = await removeLine(session?.user?.id ?? null, parsed.data.variantId);
  return { ok: true, count: countOf(lines) };
}

export interface BundleLineResult {
  variantId: string;
  /** Units this submit really added to that line. */
  addedQuantity: number;
  /** The line could not take everything asked for (cap, stock or refused). */
  short: boolean;
}

export interface BundleAddResult {
  ok: boolean;
  count: number;
  /** At least one line landed short of the selection (AGENTS §8.23). */
  capped?: boolean;
  lines?: BundleLineResult[];
  /** The code this submit applied, so the page can name it. */
  appliedCode?: string;
}

const bundleSubmitSchema = z.object({
  baseVariantId: z.string().min(1).max(64),
  units: z.number().int().min(1).max(20),
  addOnVariantIds: z.array(z.string().min(1).max(64)).max(3),
});

/**
 * Bundle builder submit (/sestavi-paket): one gesture, one write.
 *
 * The client sends INTENT only — which variant, how many units, which add-ons
 * (AGENTS §5.2/§8.3). Prices, caps and stock are re-read here, and the coupon
 * code comes from the Setting, never from the browser. Lines are raised to at
 * least the selection and never lowered, so a shopper who already holds more
 * keeps it and a repeated submit is a no-op.
 *
 * A submit where nothing landed is not a success: `ok` stays false and the
 * page renders the cap notice instead of the confirmation.
 */
export async function addBundleToCartAction(input: unknown): Promise<BundleAddResult> {
  const parsed = bundleSubmitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, count: 0 };

  const { baseVariantId, units } = parsed.data;
  const addOnIds = [...new Set(parsed.data.addOnVariantIds)].filter((id) => id !== baseVariantId);

  // One round trip for the whole set, with the same gates the single add applies.
  const variants = await db.variant.findMany({
    where: { id: { in: [baseVariantId, ...addOnIds] } },
    select: VARIANT_GATE_SELECT,
  });
  const byId = new Map(variants.map((variant) => [variant.id, variant]));

  const wanted: CartLine[] = [
    { variantId: baseVariantId, quantity: units },
    ...addOnIds.map((variantId) => ({ variantId, quantity: 1 })),
  ];
  const lines = wanted.filter((line) => {
    const variant = byId.get(line.variantId);
    if (!variant || !isPurchasable(variant)) return false;
    return !isSoldOut(availabilityOf(variant));
  });
  if (lines.length === 0) return { ok: false, count: 0 };

  const maxByVariant = new Map(
    lines.map((line) => [line.variantId, lineCapOf(byId.get(line.variantId)!)]),
  );

  const session = await auth();
  const outcome = await ensureCartLines(session?.user?.id ?? null, lines, maxByVariant);

  const results: BundleLineResult[] = outcome.results.map((result) => {
    const asked = lines.find((line) => line.variantId === result.variantId)?.quantity ?? 0;
    return {
      variantId: result.variantId,
      addedQuantity: result.addedQuantity,
      short: result.storedQuantity < asked,
    };
  });
  // Lines the gates refused never reached the write, so they are short too.
  for (const line of wanted) {
    if (!lines.some((kept) => kept.variantId === line.variantId)) {
      results.push({ variantId: line.variantId, addedQuantity: 0, short: true });
    }
  }

  const base = results.find((result) => result.variantId === baseVariantId);
  const landed = results.some((result) => result.addedQuantity > 0);
  const short = results.some((result) => result.short);
  // The bundle is only "added" when its own product is in the cart at the
  // quantity the shopper approved; add-ons alone are not the bundle.
  const ok = base !== undefined && !base.short && (landed || base.addedQuantity === 0);
  if (!ok) return { ok: false, count: countOf(outcome.lines), capped: true, lines: results };

  // The configured code is applied only when the shopper is not already
  // carrying one: one code per order, and theirs is not ours to replace.
  let appliedCode: string | undefined;
  const config = await getBundleBuilder();
  if (config.couponCode && !(await readKodaCode())) {
    const applied = await applyKodaCode(config.couponCode);
    if (applied.ok) appliedCode = applied.code;
  }

  return {
    ok: true,
    count: countOf(outcome.lines),
    ...(short ? { capped: true } : {}),
    lines: results,
    ...(appliedCode ? { appliedCode } : {}),
  };
}

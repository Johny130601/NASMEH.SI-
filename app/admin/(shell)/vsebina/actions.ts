"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin/access";
import { saveSettingValue } from "@/lib/admin/cms";
import {
  bundleBannerSchema, bundleBuilderSchema, heroSchema, homeSectionsSchema, marqueeSchema, routineBannerSchema, welcomePopupSchema,
  type BundleBannerInput, type BundleBuilderInput, type HeroInput, type HomeSectionsInput, type MarqueeInput, type RoutineBannerInput, type WelcomePopupInput,
} from "@/lib/admin/cms-schemas";
import { SETTING_KEYS } from "@/lib/settings";
import { unavailableProductLinks, type UnavailableLink } from "@/lib/content-links";

/**
 * `unavailableLinks`: saved links that lead to a product page answering 404 (QA v-a). The value is
 * stored — the block shows its link again once the product is back on sale — and the storefront
 * leaves the block out (a banner, the promo line) or sends it elsewhere (the hero button, to the
 * shop; the marquee, without a link) until then, so the editor names them.
 */
export type CmsActionResult =
  | { ok: true; unavailableLinks?: UnavailableLink[] }
  | { ok: false; error: "invalid" | "couponUnknown" | "productUnknown" | "videoExternal" };

async function savedWithLinks(hrefs: Array<string | null | undefined>): Promise<CmsActionResult> {
  const unavailableLinks = await unavailableProductLinks(hrefs);
  return unavailableLinks.length ? { ok: true, unavailableLinks } : { ok: true };
}

function refreshHome() {
  revalidatePath("/");
  revalidatePath("/admin/vsebina/domov");
}

/** Hero fields: empty media/link fields are stored as absent so the storefront keeps its fallbacks. */
export async function saveHeroAction(input: HeroInput): Promise<CmsActionResult> {
  await requirePermission("content:manage");
  const parsed = heroSchema.safeParse(input);
  if (!parsed.success) {
    // A video from another origin is blocked by the media policy: say so instead of "check your input" (QA M13).
    const videoField = parsed.error.issues.some((issue) => issue.path[0] === "videoDesktop" || issue.path[0] === "videoMobile");
    return { ok: false, error: videoField ? "videoExternal" : "invalid" };
  }
  const hero = Object.fromEntries(Object.entries(parsed.data).filter(([, value]) => value !== null && value !== ""));
  await saveSettingValue(SETTING_KEYS.homeHero, hero);
  refreshHome();
  return savedWithLinks([parsed.data.ctaHref, parsed.data.promoOverlayHref]);
}

export async function saveHomeSectionsAction(input: HomeSectionsInput): Promise<CmsActionResult> {
  await requirePermission("content:manage");
  const parsed = homeSectionsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await saveSettingValue(SETTING_KEYS.homeSections, parsed.data);
  refreshHome();
  return { ok: true };
}

export async function saveBundleBannerAction(input: BundleBannerInput): Promise<CmsActionResult> {
  await requirePermission("content:manage");
  const parsed = bundleBannerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await saveSettingValue(SETTING_KEYS.homeBundleBanner, parsed.data);
  refreshHome();
  return savedWithLinks([parsed.data.href]);
}

export async function saveRoutineBannerAction(input: RoutineBannerInput): Promise<CmsActionResult> {
  await requirePermission("content:manage");
  const parsed = routineBannerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await saveSettingValue(SETTING_KEYS.homeRoutineBanner, parsed.data);
  refreshHome();
  return savedWithLinks([parsed.data.href]);
}

/** Marquee text, link and switch; the header reads all three on every request. */
export async function saveMarqueeAction(input: MarqueeInput): Promise<CmsActionResult> {
  await requirePermission("content:manage");
  const parsed = marqueeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await Promise.all([
    saveSettingValue(SETTING_KEYS.marqueeText, parsed.data.text),
    saveSettingValue(SETTING_KEYS.marqueeHref, parsed.data.href ?? ""),
    saveSettingValue(SETTING_KEYS.marqueeActive, parsed.data.active),
  ]);
  revalidatePath("/", "layout");
  revalidatePath("/admin/vsebina/oglasna-vrstica");
  return savedWithLinks([parsed.data.href]);
}

/** The popup code must be an active coupon: the thank-you state auto-applies it at checkout. */
export async function savePopupAction(input: WelcomePopupInput): Promise<CmsActionResult> {
  await requirePermission("content:manage");
  const parsed = welcomePopupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const coupon = await db.coupon.findUnique({ where: { code: parsed.data.couponCode }, select: { active: true } });
  if (!coupon?.active) return { ok: false, error: "couponUnknown" };
  await saveSettingValue("welcomePopup", parsed.data);
  revalidatePath("/", "layout");
  revalidatePath("/admin/vsebina/popup");
  return { ok: true };
}

/**
 * Bundle builder (/sestavi-paket). The module holds no figure of its own: the
 * discount line it shows is whatever the promo engine decides for this code
 * and this selection, so a code checkout would refuse must never be storable —
 * it has to exist, be active and be PERCENT. The add-on slugs must name active
 * products for the same reason: a slug that resolves to nothing silently
 * empties the add-on row.
 */
export async function saveBundleBuilderAction(input: BundleBuilderInput): Promise<CmsActionResult> {
  await requirePermission("content:manage");
  const parsed = bundleBuilderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (parsed.data.couponCode) {
    const coupon = await db.coupon.findUnique({ where: { code: parsed.data.couponCode }, select: { active: true, type: true } });
    if (!coupon?.active || coupon.type !== "PERCENT") return { ok: false, error: "couponUnknown" };
  }
  const slugs = [...new Set(parsed.data.addOnSlugs)];
  if (slugs.length > 0) {
    const products = await db.product.findMany({ where: { slug: { in: slugs }, status: "ACTIVE" }, select: { slug: true } });
    if (products.length !== slugs.length) return { ok: false, error: "productUnknown" };
  }
  await saveSettingValue(SETTING_KEYS.bundleBuilder, parsed.data);
  // Every product page reads the setting to decide whether it hands off here.
  revalidatePath("/", "layout");
  revalidatePath("/admin/vsebina/paket");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/admin/access";
import { saveSettingValue } from "@/lib/admin/cms";
import {
  bundleBannerSchema, heroSchema, homeSectionsSchema, marqueeSchema, routineBannerSchema, welcomePopupSchema,
  type BundleBannerInput, type HeroInput, type HomeSectionsInput, type MarqueeInput, type RoutineBannerInput, type WelcomePopupInput,
} from "@/lib/admin/cms-schemas";
import { SETTING_KEYS } from "@/lib/settings";

export type CmsActionResult = { ok: true } | { ok: false; error: "invalid" | "couponUnknown" };

function refreshHome() {
  revalidatePath("/");
  revalidatePath("/admin/vsebina/domov");
}

/** Hero fields: empty media/link fields are stored as absent so the storefront keeps its fallbacks. */
export async function saveHeroAction(input: HeroInput): Promise<CmsActionResult> {
  await requirePermission("content:manage");
  const parsed = heroSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const hero = Object.fromEntries(Object.entries(parsed.data).filter(([, value]) => value !== null && value !== ""));
  await saveSettingValue(SETTING_KEYS.homeHero, hero);
  refreshHome();
  return { ok: true };
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
  return { ok: true };
}

export async function saveRoutineBannerAction(input: RoutineBannerInput): Promise<CmsActionResult> {
  await requirePermission("content:manage");
  const parsed = routineBannerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await saveSettingValue(SETTING_KEYS.homeRoutineBanner, parsed.data);
  refreshHome();
  return { ok: true };
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
  return { ok: true };
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

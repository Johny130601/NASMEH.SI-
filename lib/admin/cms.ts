import type { ContentPage } from "@prisma/client";
import { db } from "@/lib/db";
import { home } from "@/lib/copy/home";
import { getSetting, SETTING_KEYS, type BundleBannerSetting, type HeroSlotSetting, type HomeSectionSetting, type RoutineBannerSetting } from "@/lib/settings";
import {
  linkedProductSlug, menuHrefs, unavailableMenuTargets, unavailableProductLinks, type UnavailableFeatured, type UnavailableLink,
} from "@/lib/content-links";
import type { WelcomePopupSetting } from "@/lib/settings-types";
import { EMAIL_TEMPLATE_DEFS, EMAIL_TEMPLATE_KEYS, type EmailTemplateKey } from "@/lib/email/template-defs";
import { HOME_SECTION_IDS, MENU_HANDLES, type HeroInput, type MarqueeInput, type WelcomePopupInput } from "./cms-schemas";

/** CMS queries (§14.10, §14.11): settings with copy fallbacks, pages, menus, media library, mail overrides. */

const text = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

/** Every section once, in the stored order, unknown ids dropped and missing ones appended visible. */
export function normaliseHomeSections(value: unknown): HomeSectionSetting[] {
  const stored = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const sections: HomeSectionSetting[] = [];
  for (const entry of stored) {
    const id = (entry as { id?: unknown })?.id;
    if (typeof id === "string" && (HOME_SECTION_IDS as readonly string[]).includes(id) && !seen.has(id)) {
      seen.add(id);
      sections.push({ id: id as HomeSectionSetting["id"], visible: (entry as { visible?: unknown }).visible !== false });
    }
  }
  for (const id of HOME_SECTION_IDS) if (!seen.has(id)) sections.push({ id, visible: true });
  return sections;
}

export function heroToInput(hero: HeroSlotSetting | null): HeroInput {
  return {
    kicker: text(hero?.kicker, home.hero.kicker), title: text(hero?.title, home.hero.title), subtitle: text(hero?.subtitle, home.hero.subtitle),
    footnote: text(hero?.footnote), ctaLabel: text(hero?.ctaLabel, home.hero.cta), ctaHref: text(hero?.ctaHref, "#izdelki"), videoDesktop: text(hero?.videoDesktop), videoMobile: text(hero?.videoMobile),
    poster: text(hero?.poster), imageAlt: text(hero?.imageAlt), promoOverlayText: text(hero?.promoOverlayText), promoOverlayHref: text(hero?.promoOverlayHref),
  };
}

export function bundleBannerWithDefaults(value: BundleBannerSetting | null): BundleBannerSetting {
  return { title: text(value?.title, home.bundleBanner.title), cta: text(value?.cta, home.bundleBanner.cta), href: text(value?.href, "/trgovina?kolekcija=paketi") };
}

export function routineBannerWithDefaults(value: RoutineBannerSetting | null): RoutineBannerSetting {
  return {
    title: text(value?.title, home.routineBanner.title), href: text(value?.href, "/izdelek/paket-popolna-rutina"),
    image: text(value?.image, "/uploads/placeholder-rutina-wide.svg"), imageAlt: text(value?.imageAlt, home.routineBanner.imageAlt),
    footnote: text(value?.footnote, home.routineBanner.footnote),
  };
}

export async function loadHomeEditor() {
  const [hero, sections, bundleBanner, routineBanner] = await Promise.all([
    getSetting<HeroSlotSetting>(SETTING_KEYS.homeHero), getSetting<unknown>(SETTING_KEYS.homeSections),
    getSetting<BundleBannerSetting>(SETTING_KEYS.homeBundleBanner), getSetting<RoutineBannerSetting>(SETTING_KEYS.homeRoutineBanner),
  ]);
  const heroInput = heroToInput(hero);
  const bundle = bundleBannerWithDefaults(bundleBanner);
  const routine = routineBannerWithDefaults(routineBanner);
  // Links that lead to a product page answering 404 (QA v-a), named in each block's editor on load.
  const unavailable = await unavailableProductLinks([heroInput.ctaHref, heroInput.promoOverlayHref, bundle.href, routine.href]);
  const within = (...hrefs: Array<string | null | undefined>) => unavailable.filter((link) => hrefs.includes(link.href));
  return {
    hero: heroInput, sections: normaliseHomeSections(sections),
    bundleBanner: bundle, routineBanner: routine,
    unavailableLinks: { hero: within(heroInput.ctaHref, heroInput.promoOverlayHref), bundleBanner: within(bundle.href), routineBanner: within(routine.href) },
  };
}

export async function loadMarquee(): Promise<MarqueeInput> {
  const [marqueeText, href, active] = await Promise.all([
    getSetting<string>(SETTING_KEYS.marqueeText), getSetting<string>(SETTING_KEYS.marqueeHref), getSetting<boolean>(SETTING_KEYS.marqueeActive),
  ]);
  return { text: text(marqueeText, home.marqueeFallback), href: text(href), active: active !== false };
}

export type BuilderCouponProblem = "missing" | "inactive" | "notPercent" | "notStarted" | "expired" | "usedUp";

/**
 * Why the bundle builder's coupon would not discount today, or null when it
 * would. The code is checked only when it is saved, and a coupon switched off,
 * expired or used up in Kuponi afterwards silently stops the builder's
 * discount (the cart and the checkout agree, so nothing is overcharged); the
 * settings page says so (QA 2026-10-03 T5-13).
 */
export async function builderCouponProblem(code: string, now = new Date()): Promise<BuilderCouponProblem | null> {
  if (!code) return null;
  const coupon = await db.coupon.findUnique({
    where: { code },
    select: { active: true, type: true, startsAt: true, endsAt: true, usageLimitTotal: true, usedCount: true },
  });
  if (!coupon) return "missing";
  if (!coupon.active) return "inactive";
  if (coupon.type !== "PERCENT") return "notPercent";
  if (coupon.startsAt && coupon.startsAt > now) return "notStarted";
  if (coupon.endsAt && coupon.endsAt <= now) return "expired";
  if (coupon.usageLimitTotal !== null && coupon.usedCount >= coupon.usageLimitTotal) return "usedUp";
  return null;
}

export async function loadPopup(): Promise<WelcomePopupInput> {
  const popup = await getSetting<WelcomePopupSetting>("welcomePopup");
  return {
    active: popup?.active ?? false, delaySeconds: typeof popup?.delaySeconds === "number" ? popup.delaySeconds : 55, couponCode: text(popup?.couponCode, "WELCOME10"),
    title: text(popup?.title), body: text(popup?.body), cta: text(popup?.cta), thankYouTitle: text(popup?.thankYouTitle), thankYouBody: text(popup?.thankYouBody),
  };
}

/** Content blocks outside the menus that link to products; with the menu handles, the places `contentLinksToProducts` names. */
export const CONTENT_LINK_BLOCKS = ["hero", "bundleBanner", "routineBanner", "marquee"] as const;
export type ContentLinkPlace = (typeof MENU_HANDLES)[number] | (typeof CONTENT_LINK_BLOCKS)[number];

/** The featured slugs of a stored menu tree, strings only. */
function storedFeaturedSlugs(items: unknown[]): string[] {
  return items.flatMap((item) => {
    const slugs = (item as { featured?: unknown } | null)?.featured;
    return Array.isArray(slugs) ? slugs.filter((slug): slug is string => typeof slug === "string") : [];
  });
}

/**
 * Where operator content links to any of these product slugs (QA v-a): each menu by handle (its links,
 * dropdown links and featured cards), the hero, the two home banners (with the storefront's defaults)
 * and the marquee. A product save that takes the product off sale or renames it, and a bundle save that
 * withdraws it, report these places: the storefront leaves those links out from then on.
 */
export async function contentLinksToProducts(slugs: Iterable<string>): Promise<ContentLinkPlace[]> {
  const wanted = new Set(slugs);
  if (wanted.size === 0) return [];
  const [menus, hero, bundleBanner, routineBanner, marqueeHref] = await Promise.all([
    db.menu.findMany({ select: { handle: true, items: true } }),
    getSetting<HeroSlotSetting>(SETTING_KEYS.homeHero),
    getSetting<BundleBannerSetting>(SETTING_KEYS.homeBundleBanner),
    getSetting<RoutineBannerSetting>(SETTING_KEYS.homeRoutineBanner),
    getSetting<string>(SETTING_KEYS.marqueeHref),
  ]);
  const links = (hrefs: unknown[]) => hrefs.some((href) => wanted.has(linkedProductSlug(href) ?? ""));
  const places: ContentLinkPlace[] = [];
  for (const handle of MENU_HANDLES) {
    const stored = menus.find((menu) => menu.handle === handle)?.items;
    const items: unknown[] = Array.isArray(stored) ? stored : [];
    if (links(menuHrefs(items)) || storedFeaturedSlugs(items).some((slug) => wanted.has(slug))) places.push(handle);
  }
  const heroSetting = hero && typeof hero === "object" ? hero : null;
  if (links([heroSetting?.ctaHref, heroSetting?.promoOverlayHref])) places.push("hero");
  if (links([bundleBannerWithDefaults(bundleBanner).href])) places.push("bundleBanner");
  if (links([routineBannerWithDefaults(routineBanner).href])) places.push("routineBanner");
  if (links([marqueeHref])) places.push("marquee");
  return places;
}

/**
 * A stored menu's links and featured cards that lead to a page answering 404 (QA v-a), kept apart:
 * the storefront hides such a link and the save stores it, while the save refuses such a featured
 * card — the check is the save's own (`unavailableMenuTargets`), so the editor's warning matches it.
 */
export async function unavailableMenuLinks(items: unknown[]): Promise<{ links: UnavailableLink[]; featured: UnavailableFeatured[] }> {
  return unavailableMenuTargets(menuHrefs(items), storedFeaturedSlugs(items));
}

export async function saveSettingValue(key: string, value: unknown) {
  await db.setting.upsert({ where: { key }, create: { key, value: value as object }, update: { value: value as object } });
}

// ---------- pages ----------

export async function listPages() {
  return db.contentPage.findMany({ orderBy: [{ published: "desc" }, { title: "asc" }] });
}

export async function loadPage(id: string): Promise<ContentPage | null> {
  return db.contentPage.findUnique({ where: { id } });
}

// ---------- menus ----------

export async function listMenus() {
  const rows = await db.menu.findMany({ orderBy: { handle: "asc" } });
  return MENU_HANDLES.map((handle) => {
    const row = rows.find((entry) => entry.handle === handle);
    const items = Array.isArray(row?.items) ? row.items : [];
    return { handle, title: row?.title ?? "", itemCount: items.length, updatedAt: row?.updatedAt ?? null, exists: !!row };
  });
}

export async function loadMenu(handle: string) {
  if (!(MENU_HANDLES as readonly string[]).includes(handle)) return null;
  const row = await db.menu.findUnique({ where: { handle } });
  return { handle, title: row?.title ?? "", items: Array.isArray(row?.items) ? (row.items as unknown[]) : [] };
}

// ---------- media library ----------

export async function listMediaAssets() {
  const assets = await db.mediaAsset.findMany({ orderBy: { createdAt: "desc" } });
  const references = await mediaReferenceMap(assets.map((asset) => asset.url));
  return assets.map((asset) => ({ ...asset, references: references.get(asset.url) ?? 0 }));
}

/**
 * How many settings, pages, collection banners, product media rows, product HTML/content fields
 * (description, accordions, FAQ, education, metafields, badges) and e-mail template overrides point
 * at each URL. A library image pasted into a product accordion or a mail body counts as used, so it
 * cannot be deleted from under the PDP or the next mail (QA T6-08).
 */
export async function mediaReferenceMap(urls: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>(urls.map((url) => [url, 0]));
  if (urls.length === 0) return map;
  const bump = (url: string) => map.set(url, (map.get(url) ?? 0) + 1);
  const [settings, pages, collections, media, products, templates] = await Promise.all([
    db.setting.findMany({ select: { value: true } }),
    db.contentPage.findMany({ select: { body: true } }),
    db.collection.findMany({ select: { bannerImage: true, bannerImageMobile: true } }),
    db.mediaImage.findMany({ where: { url: { in: urls } }, select: { url: true } }),
    db.product.findMany({ select: { description: true, accordions: true, faq: true, education: true, customFields: true, badges: true } }),
    db.emailTemplate.findMany({ select: { bodyHtml: true } }),
  ]);
  const productTexts = products.map((product) => JSON.stringify(product));
  for (const url of urls) {
    for (const setting of settings) if (JSON.stringify(setting.value).includes(url)) bump(url);
    for (const page of pages) if (page.body.includes(url)) bump(url);
    for (const collection of collections) if (collection.bannerImage === url || collection.bannerImageMobile === url) bump(url);
    for (const row of media) if (row.url === url) bump(url);
    for (const text of productTexts) if (text.includes(url)) bump(url);
    for (const template of templates) if (template.bodyHtml.includes(url)) bump(url);
  }
  return map;
}

// ---------- e-mail templates ----------

export async function listEmailTemplates() {
  const overrides = await db.emailTemplate.findMany();
  return EMAIL_TEMPLATE_KEYS.map((key) => {
    const override = overrides.find((row) => row.key === key);
    return { key, label: EMAIL_TEMPLATE_DEFS[key].label, description: EMAIL_TEMPLATE_DEFS[key].description, overridden: !!override, updatedAt: override?.updatedAt ?? null };
  });
}

export async function loadEmailTemplate(key: EmailTemplateKey) {
  const override = await db.emailTemplate.findUnique({ where: { key } });
  const def = EMAIL_TEMPLATE_DEFS[key];
  return { key, def, overridden: !!override, subject: override?.subject ?? def.defaultSubject, bodyHtml: override?.bodyHtml ?? def.defaultBody, updatedAt: override?.updatedAt ?? null };
}

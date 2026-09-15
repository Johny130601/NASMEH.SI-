import type { ContentPage } from "@prisma/client";
import { db } from "@/lib/db";
import { home } from "@/lib/copy";
import { getSetting, SETTING_KEYS, type BundleBannerSetting, type HeroSlotSetting, type HomeSectionSetting, type RoutineBannerSetting } from "@/lib/settings";
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
  return {
    hero: heroToInput(hero), sections: normaliseHomeSections(sections),
    bundleBanner: bundleBannerWithDefaults(bundleBanner), routineBanner: routineBannerWithDefaults(routineBanner),
  };
}

export async function loadMarquee(): Promise<MarqueeInput> {
  const [marqueeText, href, active] = await Promise.all([
    getSetting<string>(SETTING_KEYS.marqueeText), getSetting<string>(SETTING_KEYS.marqueeHref), getSetting<boolean>(SETTING_KEYS.marqueeActive),
  ]);
  return { text: text(marqueeText, home.marqueeFallback), href: text(href), active: active !== false };
}

export async function loadPopup(): Promise<WelcomePopupInput> {
  const popup = await getSetting<WelcomePopupSetting>("welcomePopup");
  return {
    active: popup?.active ?? false, delaySeconds: typeof popup?.delaySeconds === "number" ? popup.delaySeconds : 55, couponCode: text(popup?.couponCode, "WELCOME10"),
    title: text(popup?.title), body: text(popup?.body), cta: text(popup?.cta), thankYouTitle: text(popup?.thankYouTitle), thankYouBody: text(popup?.thankYouBody),
  };
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

/** How many settings, pages, collection banners or product media rows point at each URL. */
export async function mediaReferenceMap(urls: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>(urls.map((url) => [url, 0]));
  if (urls.length === 0) return map;
  const bump = (url: string) => map.set(url, (map.get(url) ?? 0) + 1);
  const [settings, pages, collections, media] = await Promise.all([
    db.setting.findMany({ select: { value: true } }),
    db.contentPage.findMany({ select: { body: true } }),
    db.collection.findMany({ select: { bannerImage: true, bannerImageMobile: true } }),
    db.mediaImage.findMany({ where: { url: { in: urls } }, select: { url: true } }),
  ]);
  for (const url of urls) {
    for (const setting of settings) if (JSON.stringify(setting.value).includes(url)) bump(url);
    for (const page of pages) if (page.body.includes(url)) bump(url);
    for (const collection of collections) if (collection.bannerImage === url || collection.bannerImageMobile === url) bump(url);
    for (const row of media) if (row.url === url) bump(url);
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

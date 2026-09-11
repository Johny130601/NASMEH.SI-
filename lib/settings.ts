import { db } from "@/lib/db";

/** Config-driven merchandising: storefront config is Setting data, not code. */
export async function getSetting<T>(key: string): Promise<T | null> {
  const row = await db.setting.findUnique({ where: { key } });
  return (row?.value as T | undefined) ?? null;
}

export const SETTING_KEYS = {
  freeShippingThresholdCents: "shipping.freeThresholdCents",
  vatRatePercent: "vat.ratePercent",
  marqueeText: "marquee.text",
  marqueeHref: "marquee.href",
  marqueeActive: "marquee.active",
  homeSections: "home.sections",
  homeBundleBanner: "home.bundleBanner",
  homeRoutineBanner: "home.routineBanner",
  company: "company",
  homeHero: "home.hero",
  gtmId: "analytics.gtmId",
  googleVerification: "seo.googleVerification",
  maintenance: "maintenance",
} as const;

export interface CompanySetting {
  name: string;
  address: string;
  registrationNumber: string;
  vatId: string;
  email: string;
}

/** Homepage hero content slot (§4.1, admin-swappable in Phase 7). */
export interface HeroSlotSetting {
  kicker?: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  videoDesktop?: string;
  videoMobile?: string;
  poster?: string;
  imageAlt?: string;
  promoOverlayText?: string;
  promoOverlayHref?: string;
}

/** Homepage composition (§14.10): order and visibility of the four P1 sections. */
export type HomeSectionId = "hero" | "rail" | "bundleBanner" | "routineBanner";
export interface HomeSectionSetting {
  id: HomeSectionId;
  visible: boolean;
}

export interface BundleBannerSetting {
  title: string;
  cta: string;
  href: string;
}

export interface RoutineBannerSetting {
  title: string;
  href: string;
  image: string;
  imageAlt: string;
  footnote: string;
}

export interface MaintenanceSetting {
  enabled: boolean;
  password?: string;
  message?: string;
}

export interface MenuItem {
  label: string;
  href: string;
  color?: string;
  children?: MenuItem[];
  /** product slugs for mega-menu featured media cards */
  featured?: string[];
}

export async function getMenu(handle: string): Promise<MenuItem[]> {
  const row = await db.menu.findUnique({ where: { handle } });
  return (row?.items as MenuItem[] | undefined) ?? [];
}

import { z } from "zod";

/** CMS form schemas (§14.10, §14.11), safe to import from client components. */

const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => z.string().trim().min(1).max(max);
/** Same-site paths (with query/hash), same-page anchors or absolute http(s) links; no javascript: or protocol-relative URLs. */
export const linkSchema = z.string().trim().min(1).max(500).regex(/^(?:\/(?!\/)[^\s]*|#[a-z0-9-]+|https?:\/\/[^\s]+)$/);
const optionalLink = z.union([z.literal(""), linkSchema]).transform((value) => value || null);
const optionalMedia = z.union([z.literal(""), linkSchema]).transform((value) => value || null);

// ---------- homepage ----------

export const HOME_SECTION_IDS = ["hero", "rail", "bundleBanner", "routineBanner"] as const;

export const homeSectionsSchema = z.array(z.object({ id: z.enum(HOME_SECTION_IDS), visible: z.boolean() }))
  .length(HOME_SECTION_IDS.length)
  .refine((sections) => new Set(sections.map((section) => section.id)).size === HOME_SECTION_IDS.length, { message: "sections" });
export type HomeSectionsInput = z.input<typeof homeSectionsSchema>;

export const heroSchema = z.object({
  kicker: text(40),
  title: required(120),
  subtitle: text(400),
  ctaLabel: required(40),
  ctaHref: linkSchema,
  videoDesktop: optionalMedia,
  videoMobile: optionalMedia,
  poster: optionalMedia,
  imageAlt: text(200),
  promoOverlayText: text(120),
  promoOverlayHref: optionalLink,
});
export type HeroInput = z.input<typeof heroSchema>;

export const bundleBannerSchema = z.object({ title: required(120), cta: required(40), href: linkSchema });
export type BundleBannerInput = z.input<typeof bundleBannerSchema>;

export const routineBannerSchema = z.object({
  title: required(160), href: linkSchema, image: linkSchema, imageAlt: required(200), footnote: text(600),
});
export type RoutineBannerInput = z.input<typeof routineBannerSchema>;

export const marqueeSchema = z.object({ text: required(160), href: optionalLink, active: z.boolean() });
export type MarqueeInput = z.input<typeof marqueeSchema>;

export const welcomePopupSchema = z.object({
  active: z.boolean(),
  delaySeconds: z.number().int().min(0).max(600),
  couponCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{2,23}$/),
  title: required(120),
  body: required(600),
  cta: required(40),
  thankYouTitle: required(120),
  thankYouBody: required(600),
});
export type WelcomePopupInput = z.input<typeof welcomePopupSchema>;

// ---------- menus ----------

export const MENU_HANDLES = ["header", "utility", "footer-trgovina", "footer-pomoc", "footer-sledite", "footer-pravno", "mobile"] as const;
export const MENU_COLORS = ["", "sale"] as const;

const menuLeafSchema = z.object({
  label: required(60),
  href: linkSchema,
  color: z.enum(MENU_COLORS).optional(),
});
export const menuItemSchema = menuLeafSchema.extend({
  children: z.array(menuLeafSchema).max(12).optional(),
  featured: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).max(4).optional(),
});
export const menuItemsSchema = z.array(menuItemSchema).max(20);
export type MenuItemInput = z.input<typeof menuItemSchema>;

/** Drops empty optional fields so the stored JSON stays the shape the header reads. */
export function normaliseMenuItems(items: z.output<typeof menuItemsSchema>) {
  return items.map((item) => ({
    label: item.label,
    href: item.href,
    ...(item.color ? { color: item.color } : {}),
    ...(item.children?.length ? { children: item.children.map((child) => ({ label: child.label, href: child.href, ...(child.color ? { color: child.color } : {}) })) } : {}),
    ...(item.featured?.length ? { featured: [...new Set(item.featured)] } : {}),
  }));
}

// ---------- pages ----------

export const CONTENT_TEMPLATES = ["DEFAULT", "LEGAL", "CONTACT", "LANDING"] as const;

/** First path segments owned by code (storefront routes, redirects, system paths); a page may not take them. */
export const RESERVED_SLUGS = new Set([
  "admin", "api", "uploads", "vzdrzevanje", "sitemap.xml", "robots.txt", "_next", "favicon.ico",
  "cart", "checkout", "dostava", "iskanje", "izdelek", "koda", "kontakt", "o-nas", "oceni", "odjava-zaloga", "odstop-od-pogodbe",
  "paketi", "politika-piskotkov", "pomoc", "ponastavi-geslo", "potrdi", "potrdi-racun", "potrdi-zalogo", "potrditev", "pozabljeno-geslo",
  "prijava", "prijava-nezelenega-ucinka", "racun", "razisli", "registracija", "reklamacije", "sledi", "trgovina",
]);

/** Static routes that render the content page of the same slug inside their own template. */
export const SHADOWED_SLUGS = new Set(["politika-piskotkov", "odstop-od-pogodbe", "reklamacije"]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug) && !SHADOWED_SLUGS.has(slug);
}

export const pageSlugSchema = z.string().trim().toLowerCase().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const contentPageSchema = z.object({
  title: required(160),
  slug: pageSlugSchema,
  template: z.enum(CONTENT_TEMPLATES),
  body: z.string().max(200_000),
  seoTitle: text(200).transform((value) => value || null),
  seoDescription: text(320).transform((value) => value || null),
  published: z.boolean(),
  reviewed: z.boolean(),
});
export type ContentPageInput = z.input<typeof contentPageSchema>;

// ---------- media ----------

export const mediaAltSchema = z.object({ alt: text(200) });

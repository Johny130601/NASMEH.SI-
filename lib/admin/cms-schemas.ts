import { z } from "zod";
import { MAX_FEATURED_CARDS } from "@/lib/featured-cards";

/** CMS form schemas (§14.10, §14.11), safe to import from client components. */

const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => z.string().trim().min(1).max(max);
/**
 * Same-site paths (with query/hash), same-page anchors or absolute https links — what every CMS hint
 * promises (QA T7-F15); no plain http, javascript: or protocol-relative URLs.
 */
export const linkSchema = z.string().trim().min(1).max(500).regex(/^(?:\/(?!\/)[^\s]*|#[a-z0-9-]+|https:\/\/[^\s]+)$/);
const optionalLink = z.union([z.literal(""), linkSchema]).transform((value) => value || null);
const optionalMedia = z.union([z.literal(""), linkSchema]).transform((value) => value || null);
/**
 * A hero video is a same-site file (the media library serves /uploads/media/…): the content security
 * policy allows media only from the store's own origin, so an external video URL would never play
 * (QA M13). It is refused with its own message instead of being stored and silently blocked.
 */
export const siteVideoPathSchema = z.string().trim().max(500).regex(/^\/(?!\/)[^\s?#]+$/);
const optionalVideo = z.union([z.literal(""), siteVideoPathSchema]).transform((value) => value || null);

/** Library files a hero video field lists (by extension; the library stores videos as uploaded). */
export function isVideoPath(url: string): boolean {
  return /\.(?:mp4|webm)$/i.test(url);
}

/**
 * What one library upload may weigh. A Server Action request carries at most 10 MB
 * (next.config.ts bodySizeLimit), so the library sends one file per request and a
 * video stays under that with room for the multipart envelope (QA T7-F6).
 */
export const MEDIA_UPLOAD_LIMITS = { imageBytes: 4 * 1024 * 1024, videoBytes: 9 * 1024 * 1024 } as const;

// ---------- homepage ----------

export const HOME_SECTION_IDS = ["hero", "rail", "bundleBanner", "routineBanner"] as const;

export const homeSectionsSchema = z.array(z.object({ id: z.enum(HOME_SECTION_IDS), visible: z.boolean() }))
  .length(HOME_SECTION_IDS.length)
  .refine((sections) => new Set(sections.map((section) => section.id)).size === HOME_SECTION_IDS.length, { message: "sections" });
export type HomeSectionsInput = z.input<typeof homeSectionsSchema>;

/** Hero fields HeroSection renders as visible text; a claim can sit in any of them. */
export const HERO_CLAIM_FIELDS = ["kicker", "title", "subtitle", "ctaLabel", "promoOverlayText"] as const;

/**
 * A `*` or `^` claim marker in any visible hero text has nothing to resolve to without a footnote
 * (§12.6 claims discipline). Media paths, links and the image alt are not checked.
 */
export function heroClaimLacksFootnote(
  hero: Partial<Record<(typeof HERO_CLAIM_FIELDS)[number] | "footnote", string | null>>,
): boolean {
  return HERO_CLAIM_FIELDS.some((key) => /[*^]/.test(hero[key] ?? "")) && !(hero.footnote ?? "").trim();
}

export const heroSchema = z.object({
  kicker: text(40),
  title: required(120),
  subtitle: text(400),
  /** Plain-text qualifier rendered as small live text under the subtitle; optional unless a visible hero text carries a claim marker. */
  footnote: text(300).default(""),
  ctaLabel: required(40),
  ctaHref: linkSchema,
  videoDesktop: optionalVideo,
  videoMobile: optionalVideo,
  poster: optionalMedia,
  imageAlt: text(200),
  promoOverlayText: text(120),
  promoOverlayHref: optionalLink,
}).refine((hero) => !heroClaimLacksFootnote(hero), { message: "footnote", path: ["footnote"] });
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

/**
 * Bundle builder (/sestavi-paket) — the step between a product page and the
 * cart. Merchandising config, so it lives here with the other CMS settings
 * and is written under `content:manage`.
 *
 * It holds NO price, percentage or claim: every figure the module renders is
 * computed at request time from the variants it resolves and from the promo
 * engine's decision for that exact selection (AGENTS §8.23). The offers are
 * quantities of the product the shopper came from — not separate SKUs — so
 * the coupon engine can price them and nothing is left orphaned in the cart.
 */
export const bundleBuilderSchema = z.object({
  /** Gates the hand-off FROM a product page; /sestavi-paket itself always renders. */
  enabled: z.boolean(),
  /** Unit counts the offer row shows. Stored ascending and deduped. */
  offerUnits: z.array(z.number().int().min(1).max(20)).min(1).max(4)
    .transform((units) => [...new Set(units)].sort((a, b) => a - b))
    .refine((units) => units[0] === 1, { message: "first offer must be 1" }),
  /** Add-ons to prefer, in order; empty means "derive from the base product's collections". */
  addOnSlugs: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).max(3),
  /**
   * An existing active PERCENT coupon, applied to the cart when the bundle is
   * added so the cart and the checkout charge exactly what the module showed.
   * Empty means no discount line anywhere — never a discount we cannot honour.
   */
  couponCode: z.union([z.literal(""), z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{2,23}$/)]),
  /**
   * The monthly-delivery row. Interest capture only: there is no recurring
   * payment path in this store, so the row carries no percentage, changes no
   * figure and is never sent to the cart.
   */
  subscriptionRow: z.boolean(),
});
export type BundleBuilderInput = z.input<typeof bundleBuilderSchema>;
export type BundleBuilderSetting = z.output<typeof bundleBuilderSchema>;

export const DEFAULT_BUNDLE_BUILDER: BundleBuilderSetting = {
  enabled: true,
  offerUnits: [1, 2, 3],
  addOnSlugs: [],
  // No coupon until an operator names one: an unconfigured module shows plain
  // prices rather than a discount the cart would not apply.
  couponCode: "",
  subscriptionRow: true,
};

// ---------- menus ----------

export const MENU_HANDLES = ["header", "utility", "footer-trgovina", "footer-pomoc", "footer-sledite", "footer-pravno", "mobile"] as const;
export const MENU_COLORS = ["", "sale"] as const;

const menuLeafSchema = z.object({
  label: required(60),
  href: linkSchema,
  color: z.enum(MENU_COLORS).optional(),
});
export { MAX_FEATURED_CARDS };
export const menuItemSchema = menuLeafSchema.extend({
  children: z.array(menuLeafSchema).max(12).optional(),
  featured: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).max(8)
    .refine((slugs) => new Set(slugs).size <= MAX_FEATURED_CARDS, { message: "featured" })
    .optional(),
});

/** Every featured slug of a menu tree, once each: the save action checks that each names a product a shopper can buy (QA T7-F4, v-a). */
export function featuredSlugs(items: Array<{ featured?: string[] }>): string[] {
  return [...new Set(items.flatMap((item) => item.featured ?? []))];
}
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
  "cart", "checkout", "dostava", "iskanje", "izdelek", "koda", "kontakt", "o-nas", "oceni", "odjava-novice", "odjava-zaloga", "odstop-od-pogodbe",
  "paketi", "politika-piskotkov", "pomoc", "ponastavi-geslo", "potrdi", "potrdi-racun", "potrdi-zalogo", "potrditev", "pozabljeno-geslo",
  "prijava", "prijava-nezelenega-ucinka", "racun", "razisli", "registracija", "reklamacije", "sestavi-paket", "sledi", "trgovina",
]);

/** Static routes that render the content page of the same slug inside their own template. */
export const SHADOWED_SLUGS = new Set(["politika-piskotkov", "odstop-od-pogodbe", "reklamacije"]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug) && !SHADOWED_SLUGS.has(slug);
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const pageSlugSchema = z.string().trim().toLowerCase().min(2).max(80).regex(SLUG_PATTERN);

/** Legal pages the footer menu, the checkout and the form privacy notices link to by their fixed slug. */
export const LEGAL_PAGE_SLUGS = new Set(["pogoji-poslovanja", "politika-zasebnosti", "garancija-vracila-denarja"]);

/** The page slug a same-site link names (`/pogoji-poslovanja?e2e=1#top` → `pogoji-poslovanja`); null when no single-segment page can serve it. */
export function linkedPageSlug(href: string): string | null {
  const [path] = href.trim().split(/[?#]/, 1);
  const slug = path.startsWith("/") ? path.slice(1).replace(/\/+$/, "") : "";
  return SLUG_PATTERN.test(slug) ? slug : null;
}

/**
 * Pages that can be neither deleted nor given another slug: the shadowed pages, the fixed legal pages and every
 * page a `legal.links` value points at. Renaming one would 404 the static route and every link to it, and a
 * renamed shadowed page would drop out of this set and become deletable.
 */
export function protectedPageSlugs(legalLinkHrefs: Iterable<string>): Set<string> {
  const slugs = new Set([...SHADOWED_SLUGS, ...LEGAL_PAGE_SLUGS]);
  for (const href of legalLinkHrefs) {
    const slug = linkedPageSlug(href);
    if (slug) slugs.add(slug);
  }
  return slugs;
}

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

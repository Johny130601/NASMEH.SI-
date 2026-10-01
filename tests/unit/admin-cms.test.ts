import { describe, expect, it, vi } from "vitest";

/** Phase 7 step 5 (§14.10): CMS form schemas, menu and section normalisation, reserved slugs, copy fallbacks. */

vi.mock("@/lib/db", () => ({ db: {} }));

import {
  CONTENT_TEMPLATES, HERO_CLAIM_FIELDS, HOME_SECTION_IDS, LEGAL_PAGE_SLUGS, RESERVED_SLUGS, SHADOWED_SLUGS, bundleBannerSchema, contentPageSchema, heroClaimLacksFootnote, heroSchema, homeSectionsSchema,
  featuredSlugs, isReservedSlug, isVideoPath, linkSchema, linkedPageSlug, marqueeSchema, menuItemsSchema, normaliseMenuItems, pageSlugSchema, protectedPageSlugs, routineBannerSchema, welcomePopupSchema,
} from "@/lib/admin/cms-schemas";
import { DEFAULT_LEGAL_LINKS } from "@/lib/settings-schemas";
import { bundleBannerWithDefaults, heroToInput, normaliseHomeSections, routineBannerWithDefaults } from "@/lib/admin/cms";
import { home } from "@/lib/copy";

describe("linkSchema", () => {
  it("accepts same-site paths, anchors and https links and refuses plain http, scripts and protocol-relative URLs (QA T7-F15)", () => {
    for (const link of ["/trgovina?kolekcija=paketi#top", "/", "#izdelki", "https://instagram.com/nasmeh", " /kontakt "]) {
      expect(linkSchema.safeParse(link).success, link).toBe(true);
    }
    for (const link of ["javascript:alert(1)", "//evil.example", "trgovina", "#Izdelki", "mailto:a@b.si", "", "/with space", "http://127.0.0.1:4317/x", "http://nasmeh.si/"]) {
      expect(linkSchema.safeParse(link).success, link).toBe(false);
    }
    expect(linkSchema.parse(" /kontakt ")).toBe("/kontakt");
  });
});

describe("homepage schemas", () => {
  it("requires every section exactly once", () => {
    const all = HOME_SECTION_IDS.map((id) => ({ id, visible: id !== "rail" }));
    expect(homeSectionsSchema.safeParse(all).success).toBe(true);
    expect(homeSectionsSchema.safeParse(all.slice(1)).success).toBe(false);
    expect(homeSectionsSchema.safeParse([...all.slice(0, 3), { id: "hero", visible: true }]).success).toBe(false);
    expect(homeSectionsSchema.safeParse([...all.slice(0, 3), { id: "quiz", visible: true }]).success).toBe(false);
  });

  it("normalises stored sections: order kept, unknown ids dropped, missing ones appended visible", () => {
    expect(normaliseHomeSections(null).map((section) => section.id)).toEqual([...HOME_SECTION_IDS]);
    expect(normaliseHomeSections([{ id: "routineBanner", visible: false }, { id: "quiz" }, { id: "routineBanner", visible: true }, { id: "rail" }])).toEqual([
      { id: "routineBanner", visible: false }, { id: "rail", visible: true }, { id: "hero", visible: true }, { id: "bundleBanner", visible: true },
    ]);
  });

  it("stores empty hero media and links as null and refuses unsafe links", () => {
    const parsed = heroSchema.parse({
      kicker: " NOVO ", title: "Naslov", subtitle: "", ctaLabel: "Kupi", ctaHref: "#izdelki", videoDesktop: "", videoMobile: "",
      poster: "/uploads/media/knjiznica-medijev/0123456789abcdef01234567.webp", imageAlt: "", promoOverlayText: "", promoOverlayHref: "",
    });
    expect(parsed).toMatchObject({ kicker: "NOVO", ctaHref: "#izdelki", videoDesktop: null, videoMobile: null, promoOverlayHref: null, poster: "/uploads/media/knjiznica-medijev/0123456789abcdef01234567.webp" });
    expect(heroSchema.safeParse({ ...parsed, poster: "javascript:x", videoDesktop: "", videoMobile: "", promoOverlayHref: "" }).success).toBe(false);
    expect(heroSchema.safeParse({ ...parsed, title: "", videoDesktop: "", videoMobile: "", poster: "", promoOverlayHref: "" }).success).toBe(false);
    expect(parsed.footnote).toBe("");
  });

  it("takes hero videos only from the store itself: the media policy blocks any other origin (QA M13)", () => {
    const base = { kicker: "", title: "Naslov", subtitle: "", ctaLabel: "Kupi", ctaHref: "#izdelki", videoDesktop: "", videoMobile: "", poster: "", imageAlt: "", promoOverlayText: "", promoOverlayHref: "" };
    const video = "/uploads/media/knjiznica-medijev/0123456789abcdef01234567.mp4";
    expect(heroSchema.parse({ ...base, videoMobile: video })).toMatchObject({ videoDesktop: null, videoMobile: video });
    for (const external of ["https://cdn.example.com/hero.mp4", "//cdn.example.com/hero.mp4", "http://nasmeh.si/hero.mp4", "hero.mp4"]) {
      const result = heroSchema.safeParse({ ...base, videoDesktop: external });
      expect(result.success, external).toBe(false);
      expect(result.error?.issues[0]?.path[0], external).toBe("videoDesktop");
    }
    // The poster is an image: https hosts stay allowed (img-src permits them).
    expect(heroSchema.safeParse({ ...base, poster: "https://cdn.example.com/hero.webp" }).success).toBe(true);
    expect(isVideoPath(video)).toBe(true);
    expect(isVideoPath("/uploads/media/knjiznica-medijev/0123456789abcdef01234567.webp")).toBe(false);
  });

  it("hero footnote: optional plain text up to 300 characters, required once the subtitle carries a claim marker", () => {
    const base = { kicker: "", title: "Naslov", subtitle: "Za svetlejši nasmeh", ctaLabel: "Kupi", ctaHref: "#izdelki", videoDesktop: "", videoMobile: "", poster: "", imageAlt: "", promoOverlayText: "", promoOverlayHref: "" };
    expect(heroSchema.safeParse(base).success).toBe(true);
    expect(heroSchema.parse({ ...base, footnote: " *Rezultati se razlikujejo. " }).footnote).toBe("*Rezultati se razlikujejo.");
    expect(heroSchema.safeParse({ ...base, footnote: "x".repeat(301) }).success).toBe(false);
    for (const subtitle of ["Za svetlejši nasmeh*", "Jamstvo^ vračila"]) {
      const missing = heroSchema.safeParse({ ...base, subtitle, footnote: "  " });
      expect(missing.success, subtitle).toBe(false);
      expect(missing.error?.issues[0]?.path).toEqual(["footnote"]);
      expect(heroSchema.safeParse({ ...base, subtitle, footnote: "*Rezultati se lahko razlikujejo." }).success, subtitle).toBe(true);
    }
    expect(heroClaimLacksFootnote({ subtitle: "Nasmeh*", footnote: undefined })).toBe(true);
    expect(heroClaimLacksFootnote({ subtitle: "Nasmeh*", footnote: "*Opomba" })).toBe(false);
    expect(heroClaimLacksFootnote({ subtitle: "Nasmeh", footnote: "" })).toBe(false);
  });

  it("hero footnote: a claim marker in any visible hero text needs the footnote, not only in the subtitle", () => {
    const base = { kicker: "NOVO", title: "Naslov", subtitle: "Za svetlejši nasmeh", ctaLabel: "Kupi", ctaHref: "#izdelki", videoDesktop: "", videoMobile: "", poster: "", imageAlt: "", promoOverlayText: "Dostava", promoOverlayHref: "" };
    expect(HERO_CLAIM_FIELDS).toEqual(["kicker", "title", "subtitle", "ctaLabel", "promoOverlayText"]);
    for (const [key, value] of [["kicker", "NOVO*"], ["title", "Belejši zobje v 14 dneh*"], ["subtitle", "Nasmeh^"], ["ctaLabel", "Kupi*"], ["promoOverlayText", "Dostava^"]] as const) {
      const missing = heroSchema.safeParse({ ...base, [key]: value, footnote: "" });
      expect(missing.success, key).toBe(false);
      expect(missing.error?.issues[0]?.path, key).toEqual(["footnote"]);
      expect(heroSchema.safeParse({ ...base, [key]: value, footnote: "*Rezultati se lahko razlikujejo." }).success, key).toBe(true);
      expect(heroClaimLacksFootnote({ ...base, [key]: value, footnote: " " }), key).toBe(true);
    }
    // Links, media paths and the image alt are not visible claim text.
    expect(heroSchema.safeParse({ ...base, imageAlt: "Trakci*", ctaHref: "/trgovina?x=*", footnote: "" }).success).toBe(true);
    expect(heroClaimLacksFootnote({ title: "Naslov", promoOverlayText: null })).toBe(false);
  });

  it("banner schemas require their copy and a valid link", () => {
    expect(bundleBannerSchema.safeParse({ title: "Paketi", cta: "Nakupuj", href: "/trgovina?kolekcija=paketi" }).success).toBe(true);
    expect(bundleBannerSchema.safeParse({ title: "Paketi", cta: "", href: "/trgovina" }).success).toBe(false);
    expect(routineBannerSchema.safeParse({ title: "Rutina", href: "/izdelek/paket-popolna-rutina", image: "/uploads/placeholder-rutina-wide.svg", imageAlt: "Paket", footnote: "" }).success).toBe(true);
    expect(routineBannerSchema.safeParse({ title: "Rutina", href: "/izdelek/paket-popolna-rutina", image: "", imageAlt: "Paket", footnote: "" }).success).toBe(false);
  });

  it("fills the editor from copy when no setting exists and keeps stored values otherwise", () => {
    expect(heroToInput(null)).toMatchObject({ title: home.hero.title, ctaLabel: home.hero.cta, ctaHref: "#izdelki", poster: "", videoDesktop: "", footnote: "" });
    expect(heroToInput({ title: "Moj", subtitle: "Nasmeh*", footnote: "*Opomba", ctaLabel: "Kupi", ctaHref: "/trgovina" })).toMatchObject({ subtitle: "Nasmeh*", footnote: "*Opomba" });
    expect(heroToInput({ title: "Moj", ctaLabel: "Kupi", ctaHref: "/trgovina", poster: "/p.webp" } as unknown as Parameters<typeof heroToInput>[0])).toMatchObject({ title: "Moj", subtitle: home.hero.subtitle, ctaHref: "/trgovina", poster: "/p.webp" });
    expect(bundleBannerWithDefaults(null)).toEqual({ title: home.bundleBanner.title, cta: home.bundleBanner.cta, href: "/trgovina?kolekcija=paketi" });
    expect(bundleBannerWithDefaults({ title: "X", cta: "Y", href: "/z" })).toEqual({ title: "X", cta: "Y", href: "/z" });
    expect(routineBannerWithDefaults(null)).toMatchObject({ image: "/uploads/placeholder-rutina-wide.svg", footnote: home.routineBanner.footnote });
  });
});

describe("marquee and popup schemas", () => {
  it("marquee needs text, keeps an empty link as null and a boolean switch", () => {
    expect(marqueeSchema.parse({ text: " Dostava ", href: "", active: false })).toEqual({ text: "Dostava", href: null, active: false });
    expect(marqueeSchema.safeParse({ text: "", href: "", active: true }).success).toBe(false);
    expect(marqueeSchema.safeParse({ text: "x", href: "javascript:1", active: true }).success).toBe(false);
  });

  it("popup normalises the code like a coupon and bounds the delay", () => {
    const base = { active: true, delaySeconds: 55, couponCode: "welcome10", title: "T", body: "B", cta: "C", thankYouTitle: "TT", thankYouBody: "TB" };
    expect(welcomePopupSchema.parse(base).couponCode).toBe("WELCOME10");
    expect(welcomePopupSchema.safeParse({ ...base, delaySeconds: 601 }).success).toBe(false);
    expect(welcomePopupSchema.safeParse({ ...base, delaySeconds: -1 }).success).toBe(false);
    expect(welcomePopupSchema.safeParse({ ...base, delaySeconds: 1.5 }).success).toBe(false);
    expect(welcomePopupSchema.safeParse({ ...base, couponCode: "AB" }).success).toBe(false);
    expect(welcomePopupSchema.safeParse({ ...base, couponCode: "A B" }).success).toBe(false);
    expect(welcomePopupSchema.safeParse({ ...base, title: "" }).success).toBe(false);
  });
});

describe("menu schema", () => {
  it("validates labels, links, colours, children and featured slugs, then drops empty optionals", () => {
    const parsed = menuItemsSchema.parse([
      { label: "TRGOVINA", href: "/trgovina", color: "", children: [{ label: "Trakci", href: "/izdelek/trakci", color: "" }], featured: [" Belilni-Trakci ", "serum", "serum"] },
      { label: "PAKETI", href: "/trgovina?kolekcija=paketi", color: "sale", children: [], featured: [] },
    ]);
    expect(normaliseMenuItems(parsed)).toEqual([
      { label: "TRGOVINA", href: "/trgovina", children: [{ label: "Trakci", href: "/izdelek/trakci" }], featured: ["belilni-trakci", "serum"] },
      { label: "PAKETI", href: "/trgovina?kolekcija=paketi", color: "sale" },
    ]);
    expect(menuItemsSchema.safeParse([{ label: "X", href: "javascript:void(0)" }]).success).toBe(false);
    expect(menuItemsSchema.safeParse([{ label: "", href: "/x" }]).success).toBe(false);
    expect(menuItemsSchema.safeParse([{ label: "X", href: "/x", color: "red" }]).success).toBe(false);
    // Two featured cards fit the mega-menu and the drawer; the editor hint says so (QA T7-F4).
    expect(menuItemsSchema.safeParse([{ label: "X", href: "/x", featured: ["a", "b", "c"] }]).success).toBe(false);
    expect(featuredSlugs([{ featured: ["a", "b"] }, {}, { featured: ["b", "c"] }])).toEqual(["a", "b", "c"]);
    expect(menuItemsSchema.safeParse([{ label: "X", href: "/x", featured: ["bad slug"] }]).success).toBe(false);
    expect(menuItemsSchema.safeParse(Array.from({ length: 21 }, () => ({ label: "X", href: "/x" }))).success).toBe(false);
  });
});

describe("page schema and reserved slugs", () => {
  it("lowercases slugs, blanks SEO fields to null and limits the template", () => {
    const parsed = contentPageSchema.parse({ title: " O nas ", slug: " Moja-Stran ", template: "LANDING", body: "<p>x</p>", seoTitle: "", seoDescription: " ", published: true, reviewed: false });
    expect(parsed).toEqual({ title: "O nas", slug: "moja-stran", template: "LANDING", body: "<p>x</p>", seoTitle: null, seoDescription: null, published: true, reviewed: false });
    expect(CONTENT_TEMPLATES).toEqual(["DEFAULT", "LEGAL", "CONTACT", "LANDING"]);
    expect(contentPageSchema.safeParse({ ...parsed, template: "HELP" }).success).toBe(false);
    for (const slug of ["a", "-x", "x-", "x--y", "x_y", "č", "a".repeat(81)]) expect(pageSlugSchema.safeParse(slug).success, slug).toBe(false);
  });

  it("refuses slugs owned by code routes but allows the pages static routes render", () => {
    for (const slug of ["admin", "api", "trgovina", "checkout", "sitemap.xml", "izdelek", "koda", "prijava"]) expect(isReservedSlug(slug), slug).toBe(true);
    for (const slug of SHADOWED_SLUGS) {
      expect(RESERVED_SLUGS.has(slug), slug).toBe(true);
      expect(isReservedSlug(slug), slug).toBe(false);
    }
    expect(isReservedSlug("pogoji-poslovanja")).toBe(false);
    expect(isReservedSlug("moja-stran")).toBe(false);
  });

  it("reads the page slug of a same-site legal link without its query string, hash or trailing slash", () => {
    expect(linkedPageSlug("/pogoji-poslovanja?e2e=abc")).toBe("pogoji-poslovanja");
    expect(linkedPageSlug(" /politika-zasebnosti#piskotki ")).toBe("politika-zasebnosti");
    expect(linkedPageSlug("/reklamacije/")).toBe("reklamacije");
    for (const href of ["/", "/pravno/pogoji", "pogoji-poslovanja", "https://nasmeh.si/pogoji-poslovanja", "/Pogoji", "?x=1"]) expect(linkedPageSlug(href), href).toBeNull();
  });

  it("protects the shadowed pages, the fixed legal pages and every page legal.links names", () => {
    const defaults = protectedPageSlugs(Object.values(DEFAULT_LEGAL_LINKS));
    for (const slug of [...SHADOWED_SLUGS, ...LEGAL_PAGE_SLUGS]) expect(defaults.has(slug), slug).toBe(true);
    expect([...LEGAL_PAGE_SLUGS]).toEqual(["pogoji-poslovanja", "politika-zasebnosti", "garancija-vracila-denarja"]);
    expect(defaults.has("moja-stran")).toBe(false);
    const moved = protectedPageSlugs(Object.values({ ...DEFAULT_LEGAL_LINKS, terms: "/pogoji-2026?e2e=1", privacy: "/pravno/zasebnost" }));
    expect(moved.has("pogoji-2026")).toBe(true);
    // The fixed slugs stay protected after a link moves away from them.
    expect(moved.has("pogoji-poslovanja")).toBe(true);
    expect(moved.has("pravno")).toBe(false);
  });
});

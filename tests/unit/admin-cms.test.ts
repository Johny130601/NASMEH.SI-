import { describe, expect, it, vi } from "vitest";

/** Phase 7 step 5 (§14.10): CMS form schemas, menu and section normalisation, reserved slugs, copy fallbacks. */

vi.mock("@/lib/db", () => ({ db: {} }));

import {
  CONTENT_TEMPLATES, HOME_SECTION_IDS, RESERVED_SLUGS, SHADOWED_SLUGS, bundleBannerSchema, contentPageSchema, heroSchema, homeSectionsSchema,
  isReservedSlug, linkSchema, marqueeSchema, menuItemsSchema, normaliseMenuItems, pageSlugSchema, routineBannerSchema, welcomePopupSchema,
} from "@/lib/admin/cms-schemas";
import { bundleBannerWithDefaults, heroToInput, normaliseHomeSections, routineBannerWithDefaults } from "@/lib/admin/cms";
import { home } from "@/lib/copy";

describe("linkSchema", () => {
  it("accepts same-site paths, anchors and http(s) links and refuses scripts and protocol-relative URLs", () => {
    for (const link of ["/trgovina?kolekcija=paketi#top", "/", "#izdelki", "https://instagram.com/nasmeh", "http://127.0.0.1:4317/x", " /kontakt "]) {
      expect(linkSchema.safeParse(link).success, link).toBe(true);
    }
    for (const link of ["javascript:alert(1)", "//evil.example", "trgovina", "#Izdelki", "mailto:a@b.si", "", "/with space"]) {
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
  });

  it("banner schemas require their copy and a valid link", () => {
    expect(bundleBannerSchema.safeParse({ title: "Paketi", cta: "Nakupuj", href: "/trgovina?kolekcija=paketi" }).success).toBe(true);
    expect(bundleBannerSchema.safeParse({ title: "Paketi", cta: "", href: "/trgovina" }).success).toBe(false);
    expect(routineBannerSchema.safeParse({ title: "Rutina", href: "/izdelek/paket-popolna-rutina", image: "/uploads/placeholder-rutina-wide.svg", imageAlt: "Paket", footnote: "" }).success).toBe(true);
    expect(routineBannerSchema.safeParse({ title: "Rutina", href: "/izdelek/paket-popolna-rutina", image: "", imageAlt: "Paket", footnote: "" }).success).toBe(false);
  });

  it("fills the editor from copy when no setting exists and keeps stored values otherwise", () => {
    expect(heroToInput(null)).toMatchObject({ title: home.hero.title, ctaLabel: home.hero.cta, ctaHref: "#izdelki", poster: "", videoDesktop: "" });
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
    expect(menuItemsSchema.safeParse([{ label: "X", href: "/x", featured: ["a", "b", "c", "d", "e"] }]).success).toBe(false);
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
});

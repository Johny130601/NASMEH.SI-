import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Phase 7 step 5: direct action calls for the CMS screens — every disallowed role is refused before any write. */

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), revalidate: vi.fn(), sendMail: vi.fn(),
  settingUpsert: vi.fn(), settingFindMany: vi.fn(), settingFindUnique: vi.fn(), couponFindUnique: vi.fn(), productFindMany: vi.fn(),
  pageCreate: vi.fn(), pageUpdate: vi.fn(), pageFindUnique: vi.fn(), pageDelete: vi.fn(), pageFindMany: vi.fn(),
  menuUpsert: vi.fn(),
  assetFindUnique: vi.fn(), assetUpdateMany: vi.fn(), assetDelete: vi.fn(), assetDeleteMany: vi.fn(), assetCreate: vi.fn(),
  mediaImageFindMany: vi.fn(), collectionFindMany: vi.fn(),
  templateUpsert: vi.fn(), templateDeleteMany: vi.fn(), templateFindUnique: vi.fn(),
  prepareMedia: vi.fn(), saveMedia: vi.fn(), removeMedia: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/email/mailer", () => ({ sendMail: mocks.sendMail }));
vi.mock("@/lib/admin/media", () => ({
  InvalidMediaFile: class InvalidMediaFile extends Error { constructor(readonly reason: string) { super(reason); } },
  MEDIA_LIBRARY_OWNER_ID: "knjiznica-medijev",
  prepareMediaImage: mocks.prepareMedia, saveMediaImage: mocks.saveMedia, removeMediaImage: mocks.removeMedia,
}));
vi.mock("@/lib/db", () => ({ db: {
  setting: { upsert: mocks.settingUpsert, findMany: mocks.settingFindMany, findUnique: mocks.settingFindUnique },
  coupon: { findUnique: mocks.couponFindUnique },
  product: { findMany: mocks.productFindMany },
  contentPage: { create: mocks.pageCreate, update: mocks.pageUpdate, findUnique: mocks.pageFindUnique, delete: mocks.pageDelete, findMany: mocks.pageFindMany },
  menu: { upsert: mocks.menuUpsert },
  mediaAsset: { findUnique: mocks.assetFindUnique, updateMany: mocks.assetUpdateMany, delete: mocks.assetDelete, deleteMany: mocks.assetDeleteMany, create: mocks.assetCreate },
  mediaImage: { findMany: mocks.mediaImageFindMany },
  collection: { findMany: mocks.collectionFindMany },
  emailTemplate: { upsert: mocks.templateUpsert, deleteMany: mocks.templateDeleteMany, findUnique: mocks.templateFindUnique },
} }));

import {
  saveBundleBannerAction, saveBundleBuilderAction, saveHeroAction, saveHomeSectionsAction, saveMarqueeAction, savePopupAction, saveRoutineBannerAction,
} from "@/app/admin/(shell)/vsebina/actions";
import { createPageAction, deletePageAction, savePageAction } from "@/app/admin/(shell)/strani/actions";
import { saveMenuAction } from "@/app/admin/(shell)/navigacija/actions";
import { deleteMediaAssetAction, updateMediaAltAction, uploadMediaAssetsAction } from "@/app/admin/(shell)/mediji/actions";
import { resetEmailTemplateAction, saveEmailTemplateAction, sendTestEmailAction } from "@/app/admin/(shell)/e-posta/actions";

const session = (role: string, mfaEnrolled = true) => ({ user: { id: `cmf0${role.toLowerCase()}00000000000000001`, email: `${role.toLowerCase()}@nasmeh.si`, name: role, role, mfaEnrolled } });
const pageId = "cmf0page0000000000000001";
const assetId = "cmf0asset000000000000001";
const p2002 = new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "6", meta: { target: ["slug"] } });

const hero = { kicker: "NOVO", title: "Naslov", subtitle: "Pod", ctaLabel: "Kupi", ctaHref: "/trgovina", videoDesktop: "", videoMobile: "", poster: "", imageAlt: "", promoOverlayText: "", promoOverlayHref: "" };
const sections = [{ id: "hero" as const, visible: true }, { id: "rail" as const, visible: true }, { id: "bundleBanner" as const, visible: false }, { id: "routineBanner" as const, visible: true }];
const popup = { active: true, delaySeconds: 30, couponCode: "welcome10", title: "T", body: "B", cta: "C", thankYouTitle: "TT", thankYouBody: "TB" };
const bundleBuilder = { enabled: true, offerUnits: [1, 2, 3], addOnSlugs: [], couponCode: "", subscriptionRow: true };
const page = { title: "Stran", slug: "moja-stran", template: "DEFAULT" as const, body: "<p>x</p>", seoTitle: "", seoDescription: "", published: true, reviewed: false };
const menuItems = [{ label: "TRGOVINA", href: "/trgovina", color: "" as const, children: [{ label: "Trakci", href: "/izdelek/trakci", color: "" as const }], featured: ["trakci", "trakci"] }];
const template = { key: "resetPassword", subject: "Geslo", bodyHtml: "<p>{{resetUrl}}</p>" };
const emptyUpload = () => { const data = new FormData(); data.set("alt", "x"); return data; };

/** Every mutation with a valid input; each must succeed for OWNER and MANAGER and throw for the other roles. */
const actions: Array<[string, () => Promise<unknown>]> = [
  ["saveHeroAction", () => saveHeroAction(hero)],
  ["saveHomeSectionsAction", () => saveHomeSectionsAction(sections)],
  ["saveBundleBannerAction", () => saveBundleBannerAction({ title: "P", cta: "K", href: "/trgovina" })],
  ["saveRoutineBannerAction", () => saveRoutineBannerAction({ title: "R", href: "/izdelek/paket", image: "/uploads/x.svg", imageAlt: "A", footnote: "" })],
  ["saveMarqueeAction", () => saveMarqueeAction({ text: "Dostava", href: "", active: true })],
  ["savePopupAction", () => savePopupAction(popup)],
  ["saveBundleBuilderAction", () => saveBundleBuilderAction(bundleBuilder)],
  ["createPageAction", () => createPageAction({ title: "Nova", slug: "nova-stran", template: "DEFAULT" })],
  ["savePageAction", () => savePageAction({ pageId, page })],
  ["deletePageAction", () => deletePageAction({ pageId })],
  ["saveMenuAction", () => saveMenuAction({ handle: "header", title: "Glavni", items: menuItems })],
  ["updateMediaAltAction", () => updateMediaAltAction({ assetId, alt: "Nov alt" })],
  ["deleteMediaAssetAction", () => deleteMediaAssetAction({ assetId })],
  ["saveEmailTemplateAction", () => saveEmailTemplateAction(template)],
  ["resetEmailTemplateAction", () => resetEmailTemplateAction({ key: "resetPassword" })],
  ["sendTestEmailAction", () => sendTestEmailAction({ ...template, to: "test@nasmeh.si" })],
];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue(session("MANAGER"));
  mocks.settingUpsert.mockResolvedValue({});
  mocks.settingFindMany.mockResolvedValue([]);
  mocks.settingFindUnique.mockResolvedValue(null);
  mocks.couponFindUnique.mockResolvedValue({ active: true, type: "PERCENT" });
  mocks.productFindMany.mockResolvedValue([]);
  mocks.pageCreate.mockImplementation(async ({ data }) => ({ id: pageId, ...data }));
  mocks.pageUpdate.mockResolvedValue({});
  mocks.pageFindUnique.mockResolvedValue({ slug: "moja-stran" });
  mocks.pageDelete.mockResolvedValue({});
  mocks.pageFindMany.mockResolvedValue([]);
  mocks.menuUpsert.mockResolvedValue({});
  mocks.assetFindUnique.mockResolvedValue({ id: assetId, url: "/uploads/media/knjiznica-medijev/0123456789abcdef01234567.webp" });
  mocks.assetUpdateMany.mockResolvedValue({ count: 1 });
  mocks.assetDelete.mockResolvedValue({});
  mocks.mediaImageFindMany.mockResolvedValue([]);
  mocks.collectionFindMany.mockResolvedValue([]);
  mocks.templateUpsert.mockResolvedValue({});
  mocks.templateDeleteMany.mockResolvedValue({ count: 1 });
  mocks.templateFindUnique.mockResolvedValue(null);
  mocks.sendMail.mockResolvedValue({ messageId: "sent" });
  mocks.removeMedia.mockResolvedValue(undefined);
});

describe("CMS actions: permission boundary", () => {
  it("OWNER and MANAGER hold content:manage; SUPPORT, FULFILLMENT, customers and anonymous callers are refused before any write", async () => {
    for (const role of ["OWNER", "MANAGER"]) {
      mocks.auth.mockResolvedValue(session(role));
      for (const [name, run] of actions) expect(await run(), `${role} ${name}`).toEqual(expect.objectContaining({ ok: true }));
    }
    const writes = [mocks.settingUpsert, mocks.pageCreate, mocks.pageUpdate, mocks.pageDelete, mocks.menuUpsert, mocks.assetUpdateMany, mocks.assetDelete, mocks.templateUpsert, mocks.templateDeleteMany, mocks.sendMail];
    const counts = writes.map((write) => write.mock.calls.length);
    for (const role of ["SUPPORT", "FULFILLMENT", "CUSTOMER"]) {
      mocks.auth.mockResolvedValue(session(role));
      for (const [name, run] of actions) await expect(run(), `${role} ${name}`).rejects.toThrow("forbidden");
      await expect(uploadMediaAssetsAction(emptyUpload()), `${role} upload`).rejects.toThrow("forbidden");
    }
    mocks.auth.mockResolvedValue(null);
    for (const [name, run] of actions) await expect(run(), `anonymous ${name}`).rejects.toThrow("forbidden");
    mocks.auth.mockResolvedValue(session("OWNER", false));
    for (const [name, run] of actions) await expect(run(), `unenrolled ${name}`).rejects.toThrow("mfa_required");
    expect(writes.map((write) => write.mock.calls.length)).toEqual(counts);
  });
});

describe("homepage, marquee and popup actions", () => {
  it("stores the hero without empty media fields and refuses unsafe links", async () => {
    expect(await saveHeroAction(hero)).toEqual({ ok: true });
    expect(mocks.settingUpsert.mock.calls[0][0]).toMatchObject({ where: { key: "home.hero" }, create: { key: "home.hero", value: { kicker: "NOVO", title: "Naslov", ctaHref: "/trgovina" } } });
    expect(mocks.settingUpsert.mock.calls[0][0].create.value).not.toHaveProperty("poster");
    expect(await saveHeroAction({ ...hero, ctaHref: "javascript:alert(1)" })).toEqual({ ok: false, error: "invalid" });
    // A claim marker in the subtitle needs its footnote (§12.6); the footnote is stored with the hero.
    expect(await saveHeroAction({ ...hero, subtitle: "Pod*", footnote: "" })).toEqual({ ok: false, error: "invalid" });
    // The same holds for a marker in the heading, kicker or promo line, which the hero renders as live text too.
    for (const starred of [{ title: "Belejši zobje v 14 dneh*" }, { kicker: "NOVO^" }, { promoOverlayText: "Dostava*" }]) {
      expect(await saveHeroAction({ ...hero, ...starred, footnote: "" }), Object.keys(starred)[0]).toEqual({ ok: false, error: "invalid" });
    }
    expect(mocks.settingUpsert).toHaveBeenCalledTimes(1);
    mocks.settingUpsert.mockClear();
    expect(await saveHeroAction({ ...hero, subtitle: "Pod*", footnote: "*Rezultati se lahko razlikujejo." })).toEqual({ ok: true });
    expect(mocks.settingUpsert.mock.calls[0][0].create.value).toMatchObject({ subtitle: "Pod*", footnote: "*Rezultati se lahko razlikujejo." });
    expect(await saveHomeSectionsAction([sections[0], sections[0], sections[1], sections[2]])).toEqual({ ok: false, error: "invalid" });
    expect(mocks.revalidate).toHaveBeenCalledWith("/");
  });

  it("writes the three marquee settings and checks the popup code against the active coupons", async () => {
    expect(await saveMarqueeAction({ text: "Dostava", href: "", active: false })).toEqual({ ok: true });
    expect(mocks.settingUpsert.mock.calls.map((call) => [call[0].where.key, call[0].create.value])).toEqual([["marquee.text", "Dostava"], ["marquee.href", ""], ["marquee.active", false]]);
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
    mocks.settingUpsert.mockClear();
    expect(await savePopupAction(popup)).toEqual({ ok: true });
    expect(mocks.couponFindUnique).toHaveBeenCalledWith({ where: { code: "WELCOME10" }, select: { active: true } });
    expect(mocks.settingUpsert.mock.calls[0][0].create.value).toMatchObject({ couponCode: "WELCOME10", delaySeconds: 30 });
    mocks.couponFindUnique.mockResolvedValueOnce({ active: false });
    expect(await savePopupAction(popup)).toEqual({ ok: false, error: "couponUnknown" });
    mocks.couponFindUnique.mockResolvedValueOnce(null);
    expect(await savePopupAction(popup)).toEqual({ ok: false, error: "couponUnknown" });
    expect(await savePopupAction({ ...popup, delaySeconds: 999 })).toEqual({ ok: false, error: "invalid" });
    expect(mocks.settingUpsert).toHaveBeenCalledTimes(1);
  });
});

describe("bundle builder action", () => {
  it("stores a normalised config and refuses a code the checkout would not honour or a slug that names no active product", async () => {
    mocks.productFindMany.mockResolvedValue([{ slug: "trakci" }, { slug: "pasta" }]);
    expect(await saveBundleBuilderAction({ ...bundleBuilder, offerUnits: [3, 1, 3, 2], addOnSlugs: ["Trakci", " pasta "], couponCode: "paket15" })).toEqual({ ok: true });
    expect(mocks.couponFindUnique).toHaveBeenCalledWith({ where: { code: "PAKET15" }, select: { active: true, type: true } });
    expect(mocks.productFindMany.mock.calls[0][0]).toMatchObject({ where: { slug: { in: ["trakci", "pasta"] }, status: "ACTIVE" } });
    expect(mocks.settingUpsert.mock.calls[0][0]).toMatchObject({ where: { key: "bundle.builder" }, create: { value: { offerUnits: [1, 2, 3], addOnSlugs: ["trakci", "pasta"], couponCode: "PAKET15" } } });
    // The discount line is the promo engine's cents for this selection, so only an active PERCENT coupon may be stored.
    for (const coupon of [null, { active: false, type: "PERCENT" }, { active: true, type: "FIXED" }, { active: true, type: "FREE_SHIPPING" }]) {
      mocks.couponFindUnique.mockResolvedValueOnce(coupon);
      expect(await saveBundleBuilderAction({ ...bundleBuilder, couponCode: "paket15" }), JSON.stringify(coupon)).toEqual({ ok: false, error: "couponUnknown" });
    }
    mocks.productFindMany.mockResolvedValueOnce([{ slug: "trakci" }]);
    expect(await saveBundleBuilderAction({ ...bundleBuilder, addOnSlugs: ["trakci", "ni-izdelka"] })).toEqual({ ok: false, error: "productUnknown" });
    // The first offer is the single unit the shopper already chose; four counts and four add-ons are past the row's width.
    expect(await saveBundleBuilderAction({ ...bundleBuilder, offerUnits: [2, 3] })).toEqual({ ok: false, error: "invalid" });
    expect(await saveBundleBuilderAction({ ...bundleBuilder, addOnSlugs: ["trakci", "pasta", "ustnik", "nitka"] })).toEqual({ ok: false, error: "invalid" });
    expect(mocks.settingUpsert).toHaveBeenCalledTimes(1);
  });
});

describe("page actions", () => {
  it("creates unpublished pages, refuses code-owned slugs and maps duplicates", async () => {
    expect(await createPageAction({ title: "Nova", slug: "Nova-Stran", template: "LANDING" })).toEqual({ ok: true, id: pageId });
    expect(mocks.pageCreate.mock.calls[0][0].data).toEqual({ title: "Nova", slug: "nova-stran", template: "LANDING", published: false, reviewed: false });
    expect(await createPageAction({ title: "X", slug: "checkout", template: "DEFAULT" })).toEqual({ ok: false, error: "slugReserved" });
    expect(await createPageAction({ title: "X", slug: "x", template: "DEFAULT" })).toEqual({ ok: false, error: "invalid" });
    expect(await createPageAction({ title: "X", slug: "x-y", template: "HELP" })).toEqual({ ok: false, error: "invalid" });
    mocks.pageCreate.mockRejectedValueOnce(p2002);
    expect(await createPageAction({ title: "X", slug: "politika-piskotkov", template: "DEFAULT" })).toEqual({ ok: false, error: "slugTaken" });
    expect(mocks.pageCreate).toHaveBeenCalledTimes(2);
  });

  it("saves with a slug change guarded, reports missing pages, and protects the pages static routes render from deletion", async () => {
    expect(await savePageAction({ pageId, page: { ...page, slug: "admin" } })).toEqual({ ok: false, error: "slugReserved" });
    mocks.pageFindUnique.mockResolvedValueOnce(null);
    expect(await savePageAction({ pageId, page })).toEqual({ ok: false, error: "not_found" });
    mocks.pageUpdate.mockRejectedValueOnce(p2002);
    expect(await savePageAction({ pageId, page: { ...page, slug: "pogoji-poslovanja" } })).toEqual({ ok: false, error: "slugTaken" });
    expect(await savePageAction({ pageId, page })).toEqual({ ok: true });
    expect(mocks.pageUpdate.mock.calls[1][0]).toMatchObject({ where: { id: pageId }, data: { slug: "moja-stran", seoTitle: null, published: true } });
    expect(mocks.revalidate).toHaveBeenCalledWith("/moja-stran");
    mocks.pageFindUnique.mockResolvedValueOnce({ slug: "odstop-od-pogodbe" });
    expect(await deletePageAction({ pageId })).toEqual({ ok: false, error: "protected" });
    expect(mocks.pageDelete).not.toHaveBeenCalled();
    expect(await deletePageAction({ pageId })).toEqual({ ok: true });
    expect(mocks.pageDelete).toHaveBeenCalledWith({ where: { id: pageId } });
  });

  // Phase 9 step 4: legal pages keep their slug and cannot be deleted, whichever route or setting links to them.
  const legalPage = (slug: string, extra: Record<string, unknown> = {}) => ({ slug, title: "Pogoji", body: "<p>Besedilo</p>", template: "LEGAL", reviewed: false, ...extra });
  const legalInput = (slug: string) => ({ ...page, slug, title: "Pogoji", body: "<p>Besedilo</p>", template: "LEGAL" as const });

  it("refuses to rename a shadowed or fixed legal page, checking the stored slug rather than the new one", async () => {
    for (const slug of ["reklamacije", "odstop-od-pogodbe", "politika-piskotkov", "pogoji-poslovanja", "politika-zasebnosti", "garancija-vracila-denarja"]) {
      mocks.pageFindUnique.mockResolvedValueOnce(legalPage(slug));
      expect(await savePageAction({ pageId, page: legalInput("nov-slug") }), slug).toEqual({ ok: false, error: "protected" });
    }
    expect(mocks.pageUpdate).not.toHaveBeenCalled();
    // The same slug still saves: text edits on a legal page are allowed.
    mocks.pageFindUnique.mockResolvedValueOnce(legalPage("pogoji-poslovanja"));
    expect(await savePageAction({ pageId, page: { ...legalInput("pogoji-poslovanja"), body: "<p>Novo</p>" } })).toEqual({ ok: true });
    expect(mocks.pageUpdate).toHaveBeenCalledTimes(1);
  });

  it("refuses to delete the fixed legal pages, and a refused rename leaves no way round the delete guard", async () => {
    for (const slug of ["pogoji-poslovanja", "politika-zasebnosti", "garancija-vracila-denarja", "reklamacije"]) {
      mocks.pageFindUnique.mockResolvedValueOnce({ slug });
      expect(await deletePageAction({ pageId }), slug).toEqual({ ok: false, error: "protected" });
    }
    // Rename first, then delete: the rename is refused, so the stored slug stays protected.
    mocks.pageFindUnique.mockResolvedValueOnce(legalPage("reklamacije"));
    expect(await savePageAction({ pageId, page: legalInput("stara-reklamacija") })).toEqual({ ok: false, error: "protected" });
    mocks.pageFindUnique.mockResolvedValueOnce({ slug: "reklamacije" });
    expect(await deletePageAction({ pageId })).toEqual({ ok: false, error: "protected" });
    expect(mocks.pageUpdate).not.toHaveBeenCalled();
    expect(mocks.pageDelete).not.toHaveBeenCalled();
  });

  it("protects the page a legal.links value names at action time, ignoring its query string", async () => {
    mocks.settingFindUnique.mockResolvedValue({ key: "legal.links", value: { terms: "/pogoji-2026?e2e=abc#top", privacy: "/politika-zasebnosti", cookies: "/politika-piskotkov", withdrawal: "/odstop-od-pogodbe", complaints: "/reklamacije" } });
    mocks.pageFindUnique.mockResolvedValueOnce({ slug: "pogoji-2026" });
    expect(await deletePageAction({ pageId })).toEqual({ ok: false, error: "protected" });
    expect(mocks.settingFindUnique).toHaveBeenCalledWith({ where: { key: "legal.links" } });
    mocks.pageFindUnique.mockResolvedValueOnce(legalPage("pogoji-2026", { template: "DEFAULT" }));
    expect(await savePageAction({ pageId, page: { ...legalInput("pogoji-2025"), template: "DEFAULT" } })).toEqual({ ok: false, error: "protected" });
    expect(mocks.pageUpdate).not.toHaveBeenCalled();
    expect(mocks.pageDelete).not.toHaveBeenCalled();
    // An ordinary page still renames and deletes.
    mocks.pageFindUnique.mockResolvedValueOnce(legalPage("moja-stran", { template: "DEFAULT" }));
    expect(await savePageAction({ pageId, page: { ...legalInput("druga-stran"), template: "DEFAULT" } })).toEqual({ ok: true });
    mocks.pageFindUnique.mockResolvedValueOnce({ slug: "druga-stran" });
    expect(await deletePageAction({ pageId })).toEqual({ ok: true });
  });

  it("keeps a protected LEGAL page on the LEGAL template but lets a protected page move onto it", async () => {
    mocks.pageFindUnique.mockResolvedValueOnce(legalPage("reklamacije"));
    expect(await savePageAction({ pageId, page: { ...legalInput("reklamacije"), template: "DEFAULT" } })).toEqual({ ok: false, error: "protected" });
    expect(mocks.pageUpdate).not.toHaveBeenCalled();
    mocks.pageFindUnique.mockResolvedValueOnce(legalPage("pogoji-poslovanja", { template: "DEFAULT" }));
    expect(await savePageAction({ pageId, page: legalInput("pogoji-poslovanja") })).toEqual({ ok: true });
    expect(mocks.pageUpdate.mock.calls[0][0].data).toMatchObject({ template: "LEGAL" });
  });
});

describe("legal-review mark", () => {
  const stored = { slug: "pogoji-poslovanja", title: "Pogoji", body: "<p>Pregledano</p>", template: "LEGAL", reviewed: true };
  const input = { ...page, slug: "pogoji-poslovanja", title: "Pogoji", body: "<p>Pregledano</p>", template: "LEGAL" as const, reviewed: true };

  it("stores reviewed=false when a save changes the title, body or template, even if the same save ticks it", async () => {
    const changes = [{ body: "<p>Spremenjeno</p>" }, { title: "Pogoji poslovanja" }, { template: "LANDING" as const }];
    for (const change of changes) {
      // A template change on a protected LEGAL page is refused, so the template case uses an ordinary page.
      const slug = change.template ? "moja-stran" : stored.slug;
      mocks.pageFindUnique.mockResolvedValueOnce({ ...stored, slug });
      expect(await savePageAction({ pageId, page: { ...input, slug, ...change } }), JSON.stringify(change)).toEqual({ ok: true, reviewCleared: true });
      expect(mocks.pageUpdate.mock.lastCall?.[0].data).toMatchObject({ reviewed: false, ...change });
    }
    // A changed text that was not marked reviewed saves without the notice.
    mocks.pageFindUnique.mockResolvedValueOnce(stored);
    expect(await savePageAction({ pageId, page: { ...input, body: "<p>Osnutek</p>", reviewed: false } })).toEqual({ ok: true });
    expect(mocks.pageUpdate.mock.lastCall?.[0].data).toMatchObject({ reviewed: false });
  });

  it("marks or keeps the review only on a save of the unchanged text, and SEO or publication edits keep it", async () => {
    mocks.pageFindUnique.mockResolvedValueOnce({ ...stored, reviewed: false });
    expect(await savePageAction({ pageId, page: input })).toEqual({ ok: true });
    expect(mocks.pageUpdate.mock.lastCall?.[0].data).toMatchObject({ reviewed: true, body: "<p>Pregledano</p>" });
    mocks.pageFindUnique.mockResolvedValueOnce(stored);
    expect(await savePageAction({ pageId, page: { ...input, seoTitle: "Pogoji | Nasmeh.si", published: false } })).toEqual({ ok: true });
    expect(mocks.pageUpdate.mock.lastCall?.[0].data).toMatchObject({ reviewed: true, seoTitle: "Pogoji | Nasmeh.si", published: false });
    mocks.pageFindUnique.mockResolvedValueOnce(stored);
    expect(await savePageAction({ pageId, page: { ...input, reviewed: false } })).toEqual({ ok: true });
    expect(mocks.pageUpdate.mock.lastCall?.[0].data).toMatchObject({ reviewed: false });
  });
});

describe("menu, media and e-mail template actions", () => {
  it("normalises the menu tree and refuses unknown handles", async () => {
    expect(await saveMenuAction({ handle: "header", title: "Glavni", items: menuItems })).toEqual({ ok: true });
    expect(mocks.menuUpsert.mock.calls[0][0].update).toEqual({ title: "Glavni", items: [{ label: "TRGOVINA", href: "/trgovina", children: [{ label: "Trakci", href: "/izdelek/trakci" }], featured: ["trakci"] }] });
    expect(await saveMenuAction({ handle: "sidebar", title: "", items: [] })).toEqual({ ok: false, error: "invalid" });
    expect(await saveMenuAction({ handle: "footer-pravno", title: "", items: [{ label: "X", href: "//evil" }] })).toEqual({ ok: false, error: "invalid" });
    expect(mocks.menuUpsert).toHaveBeenCalledTimes(1);
  });

  it("keeps referenced library files, removes unreferenced ones and reports missing rows", async () => {
    const url = "/uploads/media/knjiznica-medijev/0123456789abcdef01234567.webp";
    mocks.settingFindMany.mockResolvedValueOnce([{ value: { poster: url } }]);
    expect(await deleteMediaAssetAction({ assetId })).toEqual({ ok: false, error: "referenced" });
    expect(mocks.assetDelete).not.toHaveBeenCalled();
    expect(mocks.removeMedia).not.toHaveBeenCalled();
    expect(await deleteMediaAssetAction({ assetId })).toEqual({ ok: true });
    expect(mocks.assetDelete).toHaveBeenCalledWith({ where: { id: assetId } });
    expect(mocks.removeMedia).toHaveBeenCalledWith(url);
    mocks.assetFindUnique.mockResolvedValueOnce(null);
    expect(await deleteMediaAssetAction({ assetId })).toEqual({ ok: false, error: "not_found" });
    mocks.assetUpdateMany.mockResolvedValueOnce({ count: 0 });
    expect(await updateMediaAltAction({ assetId, alt: "x" })).toEqual({ ok: false, error: "not_found" });
    expect(await uploadMediaAssetsAction(emptyUpload())).toEqual({ ok: false, error: "media" });
    expect(mocks.saveMedia).not.toHaveBeenCalled();
  });

  it("stores overrides only with known placeholders, resets them and sends a sample test mail", async () => {
    expect(await saveEmailTemplateAction(template)).toEqual({ ok: true });
    expect(mocks.templateUpsert.mock.calls[0][0]).toMatchObject({ where: { key: "resetPassword" }, update: { subject: "Geslo", bodyHtml: "<p>{{resetUrl}}</p>" } });
    expect(await saveEmailTemplateAction({ ...template, bodyHtml: "<p>{{resetUrl}} {{customer}}</p>" })).toEqual({ ok: false, error: "unknownPlaceholders", names: ["customer"] });
    expect(await saveEmailTemplateAction({ key: "orderConfirmation", subject: "{{items}}", bodyHtml: "<p>{{items}}</p>" })).toEqual({ ok: false, error: "unknownPlaceholders", names: ["items"] });
    expect(await saveEmailTemplateAction({ ...template, key: "welcome" })).toEqual({ ok: false, error: "invalid" });
    expect(await saveEmailTemplateAction({ ...template, subject: "" })).toEqual({ ok: false, error: "invalid" });
    expect(mocks.templateUpsert).toHaveBeenCalledTimes(1);
    expect(await resetEmailTemplateAction({ key: "resetPassword" })).toEqual({ ok: true });
    expect(mocks.templateDeleteMany).toHaveBeenCalledWith({ where: { key: "resetPassword" } });
    expect(await resetEmailTemplateAction({ key: "nope" })).toEqual({ ok: false, error: "invalid" });

    expect(await sendTestEmailAction({ ...template, to: "ni-naslov" })).toEqual({ ok: false, error: "invalid" });
    expect(await sendTestEmailAction({ key: "supportReceipt", subject: "Prejeto {{reference}}", bodyHtml: "<p>{{note}}</p>", to: "Test@Nasmeh.si" })).toEqual({ ok: true });
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(mocks.sendMail.mock.calls[0][0]).toMatchObject({ to: "test@nasmeh.si", subject: "[TEST] Prejeto POD-2026-00042" });
    expect(mocks.sendMail.mock.calls[0][0].html).toContain("Prejeli smo vaše obvestilo o odstopu od pogodbe");
    mocks.sendMail.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await sendTestEmailAction({ ...template, to: "test@nasmeh.si" })).toEqual({ ok: false, error: "send" });
    error.mockRestore();
  });
});

import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Phase 7 step 5: direct action calls for the CMS screens — every disallowed role is refused before any write. */

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), revalidate: vi.fn(), sendMail: vi.fn(),
  settingUpsert: vi.fn(), settingFindMany: vi.fn(), couponFindUnique: vi.fn(),
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
  setting: { upsert: mocks.settingUpsert, findMany: mocks.settingFindMany },
  coupon: { findUnique: mocks.couponFindUnique },
  contentPage: { create: mocks.pageCreate, update: mocks.pageUpdate, findUnique: mocks.pageFindUnique, delete: mocks.pageDelete, findMany: mocks.pageFindMany },
  menu: { upsert: mocks.menuUpsert },
  mediaAsset: { findUnique: mocks.assetFindUnique, updateMany: mocks.assetUpdateMany, delete: mocks.assetDelete, deleteMany: mocks.assetDeleteMany, create: mocks.assetCreate },
  mediaImage: { findMany: mocks.mediaImageFindMany },
  collection: { findMany: mocks.collectionFindMany },
  emailTemplate: { upsert: mocks.templateUpsert, deleteMany: mocks.templateDeleteMany, findUnique: mocks.templateFindUnique },
} }));

import {
  saveBundleBannerAction, saveHeroAction, saveHomeSectionsAction, saveMarqueeAction, savePopupAction, saveRoutineBannerAction,
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
  mocks.couponFindUnique.mockResolvedValue({ active: true });
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
    expect(mocks.sendMail.mock.calls[0][0].html).toContain("Odstop od pogodbe smo zabeležili");
    mocks.sendMail.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await sendTestEmailAction({ ...template, to: "test@nasmeh.si" })).toEqual({ ok: false, error: "send" });
    error.mockRestore();
  });
});

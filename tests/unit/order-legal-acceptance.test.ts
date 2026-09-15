import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { checkout, email, legal, pdp, returns } from "@/lib/copy";
import { wordingVersion } from "@/lib/consent-log";
import { LEGAL_PAGES } from "@/prisma/seed-legal";
import {
  legalLinkPath,
  legalLinkSlug,
  legalNoticeText,
  resolveLegalAcceptance,
} from "@/lib/orders/legal-acceptance";

const links = { terms: "/pogoji-poslovanja?e2e=abc#top", withdrawal: "/odstop-od-pogodbe" };
const acceptedAt = new Date("2026-09-13T10:00:00.000Z");

describe("legal link paths", () => {
  it.each([
    ["/pogoji-poslovanja?e2e=1#top", "/pogoji-poslovanja", "pogoji-poslovanja"],
    ["/odstop-od-pogodbe/", "/odstop-od-pogodbe/", "odstop-od-pogodbe"],
    ["/pravno/pogoji", "/pravno/pogoji", null],
    ["/?x=1", "/", null],
  ])("%s → path %s, slug %s", (href, path, slug) => {
    expect(legalLinkPath(href)).toBe(path);
    expect(legalLinkSlug(legalLinkPath(href))).toBe(slug);
  });
});

describe("resolveLegalAcceptance", () => {
  it("records each published page's slug, updatedAt, title, body and body hash, with the notice fingerprint", async () => {
    const updatedAt = new Date("2026-09-01T08:30:00.000Z");
    const findFirst = vi.fn(async ({ where }: { where: { slug: string } }) => ({ title: `Stran ${where.slug}`, body: `<p>${where.slug}</p>`, updatedAt }));
    const record = await resolveLegalAcceptance({ contentPage: { findFirst } } as never, links, acceptedAt);

    expect(findFirst).toHaveBeenCalledWith({ where: { slug: "pogoji-poslovanja", published: true }, select: { title: true, body: true, updatedAt: true } });
    expect(findFirst).toHaveBeenCalledWith({ where: { slug: "odstop-od-pogodbe", published: true }, select: { title: true, body: true, updatedAt: true } });
    expect(record).toEqual({
      acceptedAt: "2026-09-13T10:00:00.000Z",
      noticeVersion: wordingVersion(legalNoticeText()),
      pages: [
        { key: "terms", path: "/pogoji-poslovanja", slug: "pogoji-poslovanja", updatedAt: "2026-09-01T08:30:00.000Z",
          sha256: createHash("sha256").update("<p>pogoji-poslovanja</p>", "utf8").digest("hex"),
          title: "Stran pogoji-poslovanja", body: "<p>pogoji-poslovanja</p>" },
        { key: "withdrawal", path: "/odstop-od-pogodbe", slug: "odstop-od-pogodbe", updatedAt: "2026-09-01T08:30:00.000Z",
          sha256: createHash("sha256").update("<p>odstop-od-pogodbe</p>", "utf8").digest("hex"),
          title: "Stran odstop-od-pogodbe", body: "<p>odstop-od-pogodbe</p>" },
      ],
    });
  });

  it("stores exactly the body the hash was taken from, as the record the PDF later prints", async () => {
    const body = "<h2>1. Splošno</h2><p>Pogoji &scaron;t. 3</p>";
    const record = await resolveLegalAcceptance({ contentPage: { findFirst: async () => ({ title: "Pogoji", body, updatedAt: new Date() }) } } as never, links, acceptedAt);
    expect(record.pages[0].body).toBe(body);
    expect(record.pages[0].sha256).toBe(createHash("sha256").update(body, "utf8").digest("hex"));
    // Order.legalAcceptance is a JSON column: the record survives a JSON round trip unchanged.
    expect(JSON.parse(JSON.stringify(record))).toEqual(record);
  });

  it("changes the hash when the body is edited in place", async () => {
    const at = new Date();
    const first = await resolveLegalAcceptance({ contentPage: { findFirst: async () => ({ body: "a", updatedAt: at }) } } as never, links, acceptedAt);
    const second = await resolveLegalAcceptance({ contentPage: { findFirst: async () => ({ body: "b", updatedAt: at }) } } as never, links, acceptedAt);
    expect(first.pages[0].sha256).not.toBe(second.pages[0].sha256);
  });

  it("tolerates a missing page and a path no page can serve instead of failing the order", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const record = await resolveLegalAcceptance({ contentPage: { findFirst } } as never, { terms: "/pravno/pogoji", withdrawal: "/odstop-od-pogodbe" }, acceptedAt);
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(record.pages).toEqual([
      { key: "terms", path: "/pravno/pogoji", slug: null, updatedAt: null, sha256: null, title: null, body: null },
      { key: "withdrawal", path: "/odstop-od-pogodbe", slug: "odstop-od-pogodbe", updatedAt: null, sha256: null, title: null, body: null },
    ]);
  });
});

describe("review-step legal notice", () => {
  it("keeps terms acceptance and the withdrawal notice as separate sentences", () => {
    const text = legalNoticeText();
    expect(text).toContain(`${checkout.review.legal.termsLead} ${checkout.review.legal.termsLink}.`);
    expect(text).not.toMatch(/strinjate s[^.]*pravic/);
    expect(checkout.review.legal.withdrawalTail).toContain("14 dneh");
  });

  it("words the sealed-goods exception (Art. 16(e)) with one phrase on every surface", () => {
    expect(legal.sealedGoodsException).toBe(
      "zapečateno blago, ki zaradi varovanja zdravja ali higienskih razlogov ni primerno za vračilo in je bilo po dobavi odpečateno",
    );
    const exception = `ni mogoč za ${legal.sealedGoodsException}`;
    // The page bodies wrap "ni mogoč" in <strong>; compare the visible text.
    const visible = (slug: string) => LEGAL_PAGES.find((page) => page.slug === slug)?.body.replace(/<[^>]+>/g, "") ?? "";
    const surfaces: Record<string, string> = {
      "withdrawal page": visible("odstop-od-pogodbe"),
      "terms page": visible("pogoji-poslovanja"),
      "checkout notice": checkout.review.legal.withdrawalTail,
      "PDP delivery accordion": pdp.delivery.body,
      "order confirmation legal block": email.orderConfirmation.legal.withdrawal,
      "withdrawal form hint": returns.withdrawal.fields.itemsHint,
      "withdrawal receipt": returns.withdrawal.success.statutory,
      "model form PDF": returns.withdrawalPdf.hygieneNote,
    };
    for (const [name, text] of Object.entries(surfaces)) {
      expect(text, name).toContain(exception);
      // The pre-step-4 wording was wider than Art. 16(e).
      expect(text, name).not.toContain("odpečateni oz. odprti");
    }
  });
});

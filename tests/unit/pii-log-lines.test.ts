import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Operational logs never carry e-mail addresses, query strings or link tokens (GDPR Art. 5(1)(c), Art. 32). */

const mocks = vi.hoisted(() => ({
  findOrder: vi.fn(), findUser: vi.fn(), tx: vi.fn(), receipt: vi.fn(), issueToken: vi.fn(), mail: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/orders/access", () => ({ getOrderReceipt: mocks.receipt, currentCartVersion: vi.fn() }));
vi.mock("@/lib/cart/server", () => ({ getCartLines: vi.fn(), clearGuestCart: vi.fn() }));
vi.mock("@/lib/auth-tokens", () => ({ issueAuthToken: mocks.issueToken }));
vi.mock("@/lib/email/mailer", () => ({ sendVerifyAccountEmail: mocks.mail }));
vi.mock("@/lib/db", () => ({ db: { order: { findUnique: mocks.findOrder }, user: { findUnique: mocks.findUser }, $transaction: mocks.tx } }));

import { POST as cspReport } from "@/app/api/csp-report/route";
import { createPurchaserAccount } from "@/lib/orders/post-purchase";

const token = "a".repeat(64);
let client = 0;
const report = (body: Record<string, unknown>) => cspReport(new Request("https://nasmeh.example/api/csp-report", {
  method: "POST", body: JSON.stringify({ "csp-report": body }),
  headers: { "content-type": "application/csp-report", "x-forwarded-for": `192.0.2.${(client += 1)}` },
}));

beforeEach(() => { vi.resetAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe("CSP report log line", () => {
  it("keeps origin and path only, masking link tokens and dropping queries and fragments", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cases: Array<[string, string]> = [
      ["https://nasmeh.si/admin/stranke/gost?email=ana%40test.si#top", "https://nasmeh.si/admin/stranke/gost"],
      [`https://nasmeh.si/ponastavi-geslo/${token}`, "https://nasmeh.si/ponastavi-geslo/:token"],
      [`https://nasmeh.si/potrdi-racun/${token}?utm=1`, "https://nasmeh.si/potrdi-racun/:token"],
      [`https://nasmeh.si/potrdi/${token}`, "https://nasmeh.si/potrdi/:token"],
      ["https://nasmeh.si/odjava-zaloga/cmf0sub000000000000001.sig", "https://nasmeh.si/odjava-zaloga/:token"],
      ["https://nasmeh.si/odjava-novice/cmf0sub000000000000001-abc", "https://nasmeh.si/odjava-novice/:token"],
      ["https://nasmeh.si/oceni/hitro/eyJvcmRlckl0ZW1JZCI6IngifQ.sig", "https://nasmeh.si/oceni/hitro/:token"],
      ["https://nasmeh.si/sledi?email=ana@test.si&stevilka=NS-2026-00001", "https://nasmeh.si/sledi"],
      [`https://nasmeh.si/unknown/${"b1".repeat(20)}`, "https://nasmeh.si/unknown/:token"],
      ["https://user:secret@nasmeh.si/izdelek/belilni-trakci-za-zobe", "https://nasmeh.si/izdelek/belilni-trakci-za-zobe"],
    ];
    for (const [page] of cases) expect((await report({ "document-uri": page, "effective-directive": "script-src", "blocked-uri": "inline" })).status).toBe(204);
    cases.forEach(([, expected], index) => {
      expect(String(warn.mock.calls[index][0])).toBe(`[csp] report script-src blocked=inline page=${expected} source=-:-`);
    });
    const all = warn.mock.calls.map((call) => String(call[0])).join("\n");
    for (const secret of ["ana", "%40", token, "secret", "utm", "stevilka", "#top"]) expect(all).not.toContain(secret);
  });

  it("reduces blocked and source URIs the same way and keeps only the scheme of data and blob URIs", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await report({
      "effective-directive": "img-src", "document-uri": "https://nasmeh.si/racun?email=x@y.si",
      "blocked-uri": "data:image/png;base64,QUJD", "source-file": "https://cdn.example/app.js?user=x@y.si", "line-number": 3,
    });
    await report({ "effective-directive": "worker-src", "blocked-uri": "blob:https://nasmeh.si/5b1e", "document-uri": "not a url with x@y.si" });
    expect(String(warn.mock.calls[0][0])).toBe("[csp] report img-src blocked=data: page=https://nasmeh.si/racun source=https://cdn.example/app.js:3");
    expect(String(warn.mock.calls[1][0])).toBe("[csp] report worker-src blocked=blob: page=[invalid] source=-:-");
  });
});

describe("post-purchase activation failure log", () => {
  it("logs the error class, never the SMTP error that quotes the recipient", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.findOrder.mockResolvedValue({ id: "o1", number: "NS-2026-00001", status: "PAID", userId: "u1", email: "buyer@test.si", shippingAddress: {}, marketingOptIn: false });
    mocks.receipt.mockResolvedValue({ principal: null });
    mocks.findUser.mockResolvedValue({ id: "u1", email: "buyer@test.si", emailVerified: null });
    mocks.issueToken.mockResolvedValue("verification-token");
    const smtp = Object.assign(new Error("550 5.1.1 <buyer@test.si>: Recipient address rejected"), { name: "SmtpRejected", rejected: ["buyer@test.si"] });
    mocks.mail.mockRejectedValue(smtp);
    expect(await createPurchaserAccount({ orderNumber: "NS-2026-00001", password: "Password123!" })).toEqual({ ok: false, error: "account_failed" });
    expect(log).toHaveBeenCalledWith("post-purchase account activation failed", "SmtpRejected");
    expect(JSON.stringify(log.mock.calls)).not.toContain("buyer@test.si");
  });
});

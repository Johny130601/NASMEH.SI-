import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  configuredCarriers, deliveryEstimate, normalizeTrackingNumber, resolveShippingMethod, trackingUrl,
} from "@/lib/tracking";
const setting = vi.hoisted(() => vi.fn());
vi.mock("@/lib/settings", () => ({ getSetting: setting }));
beforeEach(() => setting.mockReset());

describe("configured carrier tracking links", () => {
  it.each(["Pošta Slovenije", "Posta Slovenije", "POŠTA SLOVENIJE"])("uses the postal template for %s and encodes query separators", async carrier => {
    setting.mockResolvedValue({ ps: "https://sledenje.posta.si/?code={number}" });
    expect(await trackingUrl(carrier, "SI 123&next=evil#fragment")).toBe("https://sledenje.posta.si/?code=SI%20123%26next%3Devil%23fragment");
  });
  it("uses the GLS template and replaces repeated placeholders", async () => {
    setting.mockResolvedValue({ gls: "https://gls.example/track/{number}?parcel={number}" });
    expect(await trackingUrl("GLS", "AB/12")).toBe("https://gls.example/track/AB%2F12?parcel=AB%2F12");
  });
  it.each([null, {}, { ps: 5 }, { ps: "javascript:alert('{number}')" }, { ps: "data:text/html,{number}" }, { ps: "http://carrier.test/{number}" }, { ps: "https://user:pass@carrier.test/{number}" }, { ps: "https://carrier.test/static" }, { ps: "bad {number}" }])("ignores missing, malformed or unsafe templates: %s", async templates => {
    setting.mockResolvedValue(templates);
    expect(await trackingUrl("Pošta Slovenije", "123")).toBeNull();
  });
  it("omits links without a known carrier or tracking number", async () => {
    expect(await trackingUrl(null, "123")).toBeNull();
    expect(await trackingUrl("GLS", null)).toBeNull();
    expect(setting).not.toHaveBeenCalled();
    setting.mockResolvedValue({ ps: "https://posta.test/{number}", gls: "https://gls.test/{number}" });
    expect(await trackingUrl("unknown carrier", "123")).toBeNull();
  });
});

describe("tracking number normalisation", () => {
  it.each([
    [" gls 1234 5678 ", "GLS12345678"],
    ["ab-12-cd-34", "AB-12-CD-34"],
    ["\tRR123456789SI\n", "RR123456789SI"],
  ])("normalises %j to %s", (input, expected) => {
    expect(normalizeTrackingNumber(input)).toBe(expected);
  });

  it.each(["", "   ", "abc", "12345", "x".repeat(41), "bad number!", "číslo1234", null, 42, undefined])("rejects %j", (value) => {
    expect(normalizeTrackingNumber(value)).toBeNull();
  });
});

describe("shipping method resolution", () => {
  const methods = [
    { id: "ps-standard", carrier: " Pošta Slovenije ", label: "Pošta Slovenije — standard", priceCents: 390, estimate: "2–4 delovna dneva" },
    { id: "ps-express", carrier: "Pošta Slovenije", label: "Pošta Slovenije — express", priceCents: 690, estimate: "1–2 delovna dneva" },
    { id: "gls", carrier: "GLS", label: "GLS — paketna dostava", priceCents: 490, estimate: "2–3 delovni dnevi" },
  ];

  it("matches the snapshotted label first, then the id, otherwise nothing", () => {
    expect(resolveShippingMethod("GLS — paketna dostava", methods)?.id).toBe("gls");
    expect(resolveShippingMethod("ps-express", methods)?.label).toBe("Pošta Slovenije — express");
    expect(resolveShippingMethod("DHL Express", methods)).toBeNull();
    expect(resolveShippingMethod(null, methods)).toBeNull();
    expect(resolveShippingMethod("gls", [])).toBeNull();
  });

  it("derives the delivery estimate and the distinct carrier list", () => {
    expect(deliveryEstimate("GLS — paketna dostava", methods)).toBe("2–3 delovni dnevi");
    expect(deliveryEstimate("unknown", methods)).toBeNull();
    expect(configuredCarriers(methods)).toEqual(["Pošta Slovenije", "GLS"]);
    expect(configuredCarriers([])).toEqual([]);
  });
});

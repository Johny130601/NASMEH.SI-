import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackingUrl } from "@/lib/tracking";
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

import { describe, expect, it } from "vitest";
import { contactInputSchema, contactLookupSchema, contactPayloadHash } from "@/lib/support/validation";
import { TOPIC_CODES, topicReasons } from "@/lib/support/topics";
import { contactSettingsSchema, DEFAULT_CONTACT_SETTINGS } from "@/lib/support/settings";

const input = { requestKey: "0ea827bf-3fd0-4b4d-af19-8f80d4661888", name: "Živa Ščuk", email: "ziva@example.test", topic: "ADVICE", reason: "HOW_TO_USE", message: "Prosim za pomoč pri uporabi izdelka.", privacyAccepted: true };
describe("contact input boundaries", () => {
  it.each(TOPIC_CODES)("accepts only matching reasons for %s", topic => {
    for (const reason of topicReasons[topic]) expect(contactInputSchema.safeParse({ ...input, topic, reason }).success).toBe(true);
    expect(contactInputSchema.safeParse({ ...input, topic, reason: "FORGED" }).success).toBe(false);
  });
  it.each([{ privacyAccepted: false }, { requestKey: "guessable" }, { name: "x\r\nBcc: victim@example.test" }, { message: "short" }, { message: "x".repeat(5001) }, { email: "a@b.test\r\nBcc:a@c.test" }, { orderNumber: "NS-2026-00001/../../" }])("rejects malformed required values: %s", patch => {
    expect(contactInputSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  });
  it("normalizes email and order context without putting private data in URLs", () => {
    expect(contactLookupSchema.parse({ email: " USER@EXAMPLE.TEST ", orderNumber: " ns-2026-00001 ", turnstileToken: "challenge" })).toEqual({ email: "user@example.test", orderNumber: "NS-2026-00001", turnstileToken: "challenge" });
  });
  it("binds replay identity to sender, actor, reason, order and each attachment", () => {
    const value = contactInputSchema.parse(input); const hash = contactPayloadHash(value, null, ["file"]);
    expect(contactPayloadHash({ ...value, requestKey: "new" }, null, ["file"])).toBe(hash);
    for (const patch of [{ email: "other@example.test" }, { message: "Changed message" }, { reason: "CHOOSING_PRODUCT" }, { orderNumber: "NS-2026-00001" }]) expect(contactPayloadHash({ ...value, ...patch }, null, ["file"])).not.toBe(hash);
    expect(contactPayloadHash(value, "other-user", ["file"])).not.toBe(hash);
    expect(contactPayloadHash(value, null, ["changed-file"])).not.toBe(hash);
  });
  it("validates routing config instead of accepting header injection or client recipients", () => {
    expect(contactSettingsSchema.safeParse(DEFAULT_CONTACT_SETTINGS).success).toBe(true);
    expect(contactSettingsSchema.safeParse({ ...DEFAULT_CONTACT_SETTINGS, supportEmail: "staff@example.test\r\nBcc:victim@example.test" }).success).toBe(false);
    expect(contactSettingsSchema.safeParse({ ...DEFAULT_CONTACT_SETTINGS, recipient: "forged@example.test" }).success).toBe(false);
  });
});

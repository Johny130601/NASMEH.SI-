import { describe, expect, it } from "vitest";
import {
  CONSENT_ALL_ACCEPTED,
  CONSENT_ALL_DENIED,
  decodeConsentCookie,
  encodeConsentCookie,
  parseConsent,
  serializeConsent,
} from "@/lib/consent";

describe("consent serialize/parse", () => {
  it("round-trips a valid choice", () => {
    const raw = serializeConsent(CONSENT_ALL_ACCEPTED, 1757400000000);
    const parsed = parseConsent(raw);
    expect(parsed).toEqual({
      v: 1,
      necessary: true,
      analytics: true,
      marketing: true,
      ts: 1757400000000,
    });
  });

  it("round-trips all-denied", () => {
    const raw = serializeConsent(CONSENT_ALL_DENIED, 1757400000000);
    expect(parseConsent(raw)).toMatchObject({
      analytics: false,
      marketing: false,
    });
  });

  it.each([
    ["undefined", undefined],
    ["empty string", ""],
    ["not json", "not-json{"],
    ["wrong shape", JSON.stringify({ hello: "world" })],
    ["wrong version", JSON.stringify({ v: 2, necessary: true, analytics: true, marketing: false, ts: 1 })],
    ["necessary false", JSON.stringify({ v: 1, necessary: false, analytics: true, marketing: false, ts: 1 })],
    ["missing ts", JSON.stringify({ v: 1, necessary: true, analytics: true, marketing: false })],
  ])("returns null for %s", (_label, raw) => {
    expect(parseConsent(raw)).toBeNull();
  });
});

describe("consent cookie wire codec (base64url)", () => {
  it("encode → decode → parse round-trip", () => {
    const json = serializeConsent(CONSENT_ALL_ACCEPTED, 1757400000000);
    const wire = encodeConsentCookie(json);
    expect(wire).not.toContain("{");
    expect(wire).not.toContain(",");
    expect(parseConsent(decodeConsentCookie(wire))).toMatchObject({
      analytics: true,
      marketing: true,
    });
  });

  it("decode returns null for garbage", () => {
    expect(decodeConsentCookie(null)).toBeNull();
  });
});

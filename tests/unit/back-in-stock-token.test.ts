import { describe, expect, it } from "vitest";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "@/lib/back-in-stock/unsubscribe-token";

const id = "cmf0restocksubscription01";
const secret = "unit-restock-secret";

describe("restock unsubscribe tokens", () => {
  it("round-trips a subscription id", () => {
    expect(verifyUnsubscribeToken(signUnsubscribeToken(id, secret), secret)).toBe(id);
  });

  it("rejects tampering, foreign secrets and malformed input", () => {
    const token = signUnsubscribeToken(id, secret);
    expect(verifyUnsubscribeToken(`${token.slice(0, -1)}x`, secret)).toBeNull();
    expect(verifyUnsubscribeToken(token, "other-secret")).toBeNull();
    expect(verifyUnsubscribeToken(`${id}2.${token.split(".")[1]}`, secret)).toBeNull();
    for (const bad of ["", "nodot", ".sig", `${id}.`, `${id}.short`, `${"x".repeat(200)}.${token.split(".")[1]}`, null, undefined]) {
      expect(verifyUnsubscribeToken(bad, secret)).toBeNull();
    }
  });

  it("refuses to sign anything that is not a subscription id", () => {
    expect(() => signUnsubscribeToken("../etc", secret)).toThrow();
    expect(() => signUnsubscribeToken("", secret)).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { signRatingToken, verifyRatingToken } from "@/lib/reviews/rating-token";

const SECRET = "rating-token-secret-32-chars-xxx";
const NOW = 1_800_000_000_000;

describe("rating tokens (HMAC-signed, expiring)", () => {
  it("sign → verify round-trip", () => {
    const token = signRatingToken({ orderItemId: "oi1", rating: 5 }, SECRET, 1000, NOW);
    expect(verifyRatingToken(token, SECRET, NOW + 500)).toEqual({
      orderItemId: "oi1",
      rating: 5,
      exp: NOW + 1000,
    });
  });

  it("tampered payload → null", () => {
    const token = signRatingToken({ orderItemId: "oi1", rating: 5 }, SECRET, 1000, NOW);
    const [b64, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ orderItemId: "oi1", rating: 1, exp: NOW + 1000 }),
    ).toString("base64url");
    expect(verifyRatingToken(`${forged}.${sig}`, SECRET, NOW)).toBeNull();
    expect(b64).not.toBe(forged);
  });

  it("expired → null", () => {
    const token = signRatingToken({ orderItemId: "oi1", rating: 5 }, SECRET, 1000, NOW);
    expect(verifyRatingToken(token, SECRET, NOW + 1001)).toBeNull();
  });

  it("wrong secret / garbage → null", () => {
    const token = signRatingToken({ orderItemId: "oi1", rating: 5 }, SECRET, 1000, NOW);
    expect(verifyRatingToken(token, "other-secret", NOW)).toBeNull();
    expect(verifyRatingToken("garbage", SECRET, NOW)).toBeNull();
    expect(verifyRatingToken(null, SECRET, NOW)).toBeNull();
  });
});

describe("rating capability boundaries", () => {
  it("expires exactly at exp and rejects oversized/unicode signatures without throwing", () => {
    const token = signRatingToken({ orderItemId: "oi1", rating: 5 }, SECRET, 1000, NOW);
    expect(verifyRatingToken(token, SECRET, NOW + 1000)).toBeNull();
    expect(verifyRatingToken(`${token.split(".")[0]}.${"é".repeat(43)}`, SECRET, NOW)).toBeNull();
    expect(verifyRatingToken("x".repeat(2000), SECRET, NOW)).toBeNull();
  });
  it("validates the payload before issuing an authoring capability", () => {
    expect(() => signRatingToken({ orderItemId: "oi1", rating: 6 }, SECRET)).toThrow();
    expect(() => signRatingToken({ orderItemId: "", rating: 5 }, SECRET)).toThrow();
  });
});

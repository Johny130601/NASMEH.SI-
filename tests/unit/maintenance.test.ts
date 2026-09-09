import { describe, expect, it } from "vitest";
import {
  isValidMaintenanceCookie,
  maintenanceCookieValue,
} from "@/lib/maintenance";

const SECRET = "test-secret-at-least-32-chars-long!!";

describe("maintenance cookie (HMAC-sha256 of fixed payload)", () => {
  it("validates a cookie produced with the same secret", () => {
    const value = maintenanceCookieValue(SECRET);
    expect(isValidMaintenanceCookie(value, SECRET)).toBe(true);
  });

  it("is deterministic and hex-shaped", () => {
    expect(maintenanceCookieValue(SECRET)).toBe(maintenanceCookieValue(SECRET));
    expect(maintenanceCookieValue(SECRET)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a cookie signed with a different secret", () => {
    const value = maintenanceCookieValue("other-secret-other-secret-32xxx");
    expect(isValidMaintenanceCookie(value, SECRET)).toBe(false);
  });

  it("rejects tampered/empty/short values", () => {
    const value = maintenanceCookieValue(SECRET);
    expect(isValidMaintenanceCookie(`${value.slice(0, -2)}00`, SECRET)).toBe(false);
    expect(isValidMaintenanceCookie("", SECRET)).toBe(false);
    expect(isValidMaintenanceCookie(undefined, SECRET)).toBe(false);
    expect(isValidMaintenanceCookie("abc", SECRET)).toBe(false);
  });
});

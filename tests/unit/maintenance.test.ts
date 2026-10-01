import { describe, expect, it } from "vitest";
import {
  MAINTENANCE_MAX_AGE_S,
  isValidMaintenanceCookie,
  maintenanceCookieValue,
} from "@/lib/maintenance";

const SECRET = "test-secret-at-least-32-chars-long!!";
const HASH = "$2a$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTU";

describe("maintenance cookie (HMAC-sha256 bound to the password hash and the issue time)", () => {
  it("validates a cookie produced with the same secret and hash", () => {
    const value = maintenanceCookieValue(SECRET, HASH);
    expect(isValidMaintenanceCookie(value, SECRET, HASH)).toBe(true);
  });

  it("is deterministic for one issue time and shaped <seconds>.<hex>", () => {
    const at = 1_790_000_000_000;
    expect(maintenanceCookieValue(SECRET, HASH, at)).toBe(maintenanceCookieValue(SECRET, HASH, at));
    expect(maintenanceCookieValue(SECRET, HASH, at)).toMatch(/^\d+\.[0-9a-f]{64}$/);
  });

  it("rejects a cookie signed with a different secret", () => {
    const value = maintenanceCookieValue("other-secret-other-secret-32xxx", HASH);
    expect(isValidMaintenanceCookie(value, SECRET, HASH)).toBe(false);
  });

  it("revokes every unlock when the password changes (QA T7-F10)", () => {
    const value = maintenanceCookieValue(SECRET, HASH);
    expect(isValidMaintenanceCookie(value, SECRET, "$2a$10$another-hash-after-a-password-change")).toBe(false);
    expect(isValidMaintenanceCookie(value, SECRET, null)).toBe(false);
  });

  it("expires server-side after the cookie max age and refuses future issue times", () => {
    const at = 1_790_000_000_000;
    const value = maintenanceCookieValue(SECRET, HASH, at);
    expect(isValidMaintenanceCookie(value, SECRET, HASH, at + (MAINTENANCE_MAX_AGE_S - 1) * 1000)).toBe(true);
    expect(isValidMaintenanceCookie(value, SECRET, HASH, at + (MAINTENANCE_MAX_AGE_S + 1) * 1000)).toBe(false);
    expect(isValidMaintenanceCookie(value, SECRET, HASH, at - 5000)).toBe(false);
  });

  it("rejects tampered/empty/short values", () => {
    const value = maintenanceCookieValue(SECRET, HASH);
    expect(isValidMaintenanceCookie(`${value.slice(0, -2)}00`, SECRET, HASH)).toBe(false);
    expect(isValidMaintenanceCookie(`9${value}`, SECRET, HASH)).toBe(false);
    expect(isValidMaintenanceCookie("", SECRET, HASH)).toBe(false);
    expect(isValidMaintenanceCookie(undefined, SECRET, HASH)).toBe(false);
    expect(isValidMaintenanceCookie("abc", SECRET, HASH)).toBe(false);
  });
});

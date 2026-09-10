import { describe, expect, it } from "vitest";
import { can, isStaffRole, PERMISSIONS, permissionsOf, STAFF_ROLES, type Permission } from "@/lib/admin/permissions";

const expected: Record<(typeof STAFF_ROLES)[number], Permission[]> = {
  OWNER: [...PERMISSIONS],
  MANAGER: ["dashboard:view", "orders:view", "reviews:moderate", "catalog:manage", "promos:manage", "content:manage"],
  SUPPORT: ["dashboard:view", "orders:view", "orders:refund", "orders:notes", "customers:view", "customers:gdpr", "tickets:view", "reviews:moderate"],
  FULFILLMENT: ["dashboard:view", "orders:view", "orders:fulfil", "orders:notes"],
};

describe("permission matrix (§14.15)", () => {
  it.each(STAFF_ROLES)("%s holds exactly its documented permissions", (role) => {
    expect(permissionsOf(role)).toEqual(expected[role]);
    for (const permission of PERMISSIONS) {
      expect(can(role, permission), `${role} ${permission}`).toBe(expected[role].includes(permission));
    }
  });

  it("keeps money, settings and staff control away from the operational roles", () => {
    expect(can("SUPPORT", "settings:manage")).toBe(false);
    expect(can("SUPPORT", "catalog:manage")).toBe(false);
    expect(can("MANAGER", "customers:view")).toBe(false);
    expect(can("MANAGER", "staff:manage")).toBe(false);
    expect(can("FULFILLMENT", "orders:refund")).toBe(false);
    expect(can("OWNER", "staff:manage")).toBe(true);
  });

  it("treats customers, the retired ADMIN value and garbage as non-staff", () => {
    for (const role of ["CUSTOMER", "ADMIN", "", null, undefined, 42, {}]) {
      expect(isStaffRole(role)).toBe(false);
      expect(can(role, "dashboard:view")).toBe(false);
      expect(permissionsOf(role)).toEqual([]);
    }
  });
});

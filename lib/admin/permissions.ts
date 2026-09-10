/**
 * Staff roles and the permission matrix (§14.15). Pure and edge-safe: the
 * middleware auth config imports it. Every admin page and Server Action
 * resolves its permission here; hiding a link is never the boundary.
 */
export const STAFF_ROLES = ["OWNER", "MANAGER", "SUPPORT", "FULFILLMENT"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const PERMISSIONS = [
  "dashboard:view",
  "orders:view",
  "orders:fulfil",
  "orders:refund",
  "orders:notes",
  "customers:view",
  "customers:gdpr",
  "tickets:view",
  "reviews:moderate",
  "catalog:manage",
  "promos:manage",
  "content:manage",
  "settings:manage",
  "staff:manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<StaffRole, ReadonlySet<Permission>> = {
  OWNER: new Set<Permission>(PERMISSIONS),
  MANAGER: new Set<Permission>([
    "dashboard:view", "orders:view", "reviews:moderate", "catalog:manage", "promos:manage", "content:manage",
  ]),
  SUPPORT: new Set<Permission>([
    "dashboard:view", "orders:view", "orders:notes", "orders:refund", "customers:view", "customers:gdpr",
    "tickets:view", "reviews:moderate",
  ]),
  FULFILLMENT: new Set<Permission>(["dashboard:view", "orders:view", "orders:fulfil", "orders:notes"]),
};

export function isStaffRole(role: unknown): role is StaffRole {
  return typeof role === "string" && (STAFF_ROLES as readonly string[]).includes(role);
}

export function can(role: unknown, permission: Permission): boolean {
  return isStaffRole(role) && MATRIX[role].has(permission);
}

export function permissionsOf(role: unknown): Permission[] {
  return isStaffRole(role) ? PERMISSIONS.filter((permission) => MATRIX[role].has(permission)) : [];
}

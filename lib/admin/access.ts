import { redirect } from "next/navigation";
import { signInForThisRequest } from "@/lib/auth-redirect";
import { auth } from "@/lib/auth";
import { can, isStaffRole, type Permission, type StaffRole } from "./permissions";

export type AdminAccessReason = "unauthenticated" | "not_staff" | "forbidden" | "mfa_required";

/** Thrown by Server Actions; pages translate it into redirects. */
export class AdminAccessError extends Error {
  constructor(readonly reason: AdminAccessReason) {
    super(reason === "mfa_required" ? "mfa_required" : "forbidden");
    this.name = "AdminAccessError";
  }
}

export interface StaffSession {
  id: string;
  email: string;
  name: string | null;
  role: StaffRole;
  mfaEnrolled: boolean;
}

export interface AccessOptions {
  /** Enrolment screens and actions are the only callers that may pass this. */
  allowUnenrolled?: boolean;
}

/** Re-reads the session on every call (AGENTS §8.7): staff only, 2FA enrolled unless allowed. */
export async function requireStaff(options: AccessOptions = {}): Promise<StaffSession> {
  const session = await auth();
  if (!session?.user?.id) throw new AdminAccessError("unauthenticated");
  if (!isStaffRole(session.user.role)) throw new AdminAccessError("not_staff");
  const staff: StaffSession = {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? null,
    role: session.user.role,
    mfaEnrolled: session.user.mfaEnrolled === true,
  };
  if (!staff.mfaEnrolled && !options.allowUnenrolled) throw new AdminAccessError("mfa_required");
  return staff;
}

export async function requirePermission(permission: Permission, options: AccessOptions = {}): Promise<StaffSession> {
  const staff = await requireStaff(options);
  if (!can(staff.role, permission)) throw new AdminAccessError("forbidden");
  return staff;
}

/** Page variant: redirects instead of throwing. */
export async function requirePagePermission(permission: Permission, options: AccessOptions = {}): Promise<StaffSession> {
  let staff: StaffSession;
  try {
    staff = await requirePermission(permission, options);
  } catch (error) {
    if (!(error instanceof AdminAccessError)) throw error;
    if (error.reason === "unauthenticated") redirect(await signInForThisRequest());
    if (error.reason === "not_staff") redirect("/racun");
    if (error.reason === "mfa_required") redirect("/admin/2fa");
    redirect("/admin?dostop=zavrnjen");
  }
  return staff;
}

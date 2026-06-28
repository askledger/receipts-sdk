/**
 * Role-based access control primitives.
 *
 * Pages and server actions use `requireRole` / `requirePermission` at the
 * top of their bodies. Authorization is also enforced in the OPA policy
 * bundle at the API layer — these checks are the UI's hint, not the
 * security boundary.
 */

import type { Session, Role } from "./auth.js";

export type Permission =
  | "receipts.read"
  | "receipts.export"
  | "policies.read"
  | "policies.publish"
  | "keys.read"
  | "keys.rotate"
  | "keys.revoke"
  | "workflows.read"
  | "workflows.approve"
  | "evidence.read"
  | "evidence.export"
  | "tenants.read"
  | "tenants.provision"
  | "audit.read"
  | "settings.read"
  | "settings.write"
  | "support.impersonate";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  platform_super_admin: [
    "receipts.read", "policies.read", "keys.read", "keys.rotate", "keys.revoke",
    "workflows.read", "workflows.approve", "evidence.read", "evidence.export",
    "tenants.read", "tenants.provision", "audit.read", "settings.read", "settings.write",
    "support.impersonate",
  ],
  support_admin: ["receipts.read", "audit.read", "support.impersonate"],
  billing_admin: ["tenants.read", "audit.read"],
  org_owner: [
    "receipts.read", "receipts.export", "policies.read", "policies.publish",
    "keys.read", "keys.rotate", "keys.revoke", "workflows.read", "workflows.approve",
    "evidence.read", "evidence.export", "audit.read", "settings.read", "settings.write",
  ],
  tenant_admin: [
    "receipts.read", "receipts.export", "policies.read", "policies.publish",
    "keys.read", "keys.rotate", "workflows.read", "workflows.approve",
    "evidence.read", "evidence.export", "audit.read", "settings.read",
  ],
  finance_manager: ["receipts.read", "audit.read"],
  hr_manager: ["receipts.read", "audit.read"],
  sales_manager: ["receipts.read", "audit.read"],
  approver: ["workflows.read", "workflows.approve"],
  auditor: [
    "receipts.read", "policies.read", "keys.read", "workflows.read",
    "evidence.read", "evidence.export", "audit.read",
  ],
  employee: ["receipts.read"],
};

/** Effective permissions of the session = union over roles. */
export function permissionsOf(session: Session): Set<Permission> {
  const set = new Set<Permission>();
  for (const role of session.roles) {
    for (const p of ROLE_PERMISSIONS[role] ?? []) set.add(p);
  }
  if (session.jitRole) {
    for (const p of ROLE_PERMISSIONS[session.jitRole] ?? []) set.add(p);
  }
  return set;
}

export function hasPermission(session: Session | null, perm: Permission): boolean {
  if (!session) return false;
  return permissionsOf(session).has(perm);
}

export class ForbiddenError extends Error {
  constructor(public readonly permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = "ForbiddenError";
  }
}

export function requirePermission(session: Session | null, perm: Permission): asserts session is Session {
  if (!session) throw new Error("UNAUTHENTICATED");
  if (!hasPermission(session, perm)) throw new ForbiddenError(perm);
}

import type { UserRole } from "./auth"

/** Users with this email domain are the Kevionics (shadow) tenant. */
export const KEVIONICS_EMAIL_DOMAIN = "kevionics.com"

export const KEVIONICS_PRODUCT_NAME = "Kevionics-Audio"

export type UserTenant = "default" | "kevionics"

export function resolveUserTenant(user: {
  tenant?: UserTenant
  email?: string
}): UserTenant {
  const email = (user.email || "").toLowerCase()
  // @kevionics.com always belongs to the shadow tenant (even if legacy rows say "default").
  if (email.endsWith(`@${KEVIONICS_EMAIL_DOMAIN}`)) {
    return "kevionics"
  }
  if (user.tenant === "kevionics" || user.tenant === "default") {
    return user.tenant
  }
  return "default"
}

/** Whether an admin user list / assignment matrix should include this account. */
export function userVisibleToAdmin(
  admin: { tenant?: UserTenant; email?: string; role?: string },
  target: { tenant?: UserTenant; email?: string; role?: string },
): boolean {
  if (admin.role !== "admin") return true
  const adminTenant = resolveUserTenant(admin)
  const targetTenant = resolveUserTenant(target)
  if (adminTenant === "kevionics") {
    return targetTenant === "kevionics" && target.role === "subscriber"
  }
  return targetTenant !== "kevionics"
}

export function isShadowAdmin(user: { role?: UserRole; email?: string; tenant?: UserTenant }): boolean {
  return user.role === "admin" && resolveUserTenant(user) === "kevionics"
}

export function validateNewUserForCreator(
  newEmail: string,
  newRole: UserRole,
  creator: { tenant: UserTenant; role: UserRole } | undefined,
): { ok: true; tenant: UserTenant } | { ok: false; error: string } {
  const normalized = newEmail.trim().toLowerCase()
  const inferred: UserTenant = normalized.endsWith(`@${KEVIONICS_EMAIL_DOMAIN}`)
    ? "kevionics"
    : "default"

  if (!creator) {
    return { ok: true, tenant: inferred }
  }

  const { tenant: ct, role: cr } = creator

  if (ct === "kevionics") {
    if (cr !== "admin") {
      return { ok: false, error: "Unauthorized" }
    }
    if (newRole !== "subscriber") {
      return { ok: false, error: "Kevionics shadow admins can only create subscriber accounts." }
    }
    if (inferred !== "kevionics") {
      return {
        ok: false,
        error: `Kevionics subscribers must use an @${KEVIONICS_EMAIL_DOMAIN} email address.`,
      }
    }
    return { ok: true, tenant: "kevionics" }
  }

  if (inferred === "kevionics") {
    if (newRole === "admin") {
      return { ok: true, tenant: "kevionics" }
    }
    return {
      ok: false,
      error: `Only a Kevionics shadow admin can create @${KEVIONICS_EMAIL_DOMAIN} subscribers. Main admins may create one Kevionics admin (e.g. admin@${KEVIONICS_EMAIL_DOMAIN}) to delegate.`,
    }
  }

  return { ok: true, tenant: "default" }
}

export function adminCanManageTargetUser(
  admin: { tenant?: UserTenant; email?: string; role?: string },
  target: { tenant?: UserTenant; email?: string; role?: string },
): boolean {
  if (admin.role !== "admin") return false
  return userVisibleToAdmin(admin, target)
}

export function broadcastVisibleToSubscriber(
  broadcast: { targetTenant?: UserTenant },
  subscriber: { tenant?: UserTenant; email?: string },
): boolean {
  const st = resolveUserTenant(subscriber)
  const bt = broadcast.targetTenant
  if (st === "kevionics") {
    return bt === "kevionics"
  }
  return bt !== "kevionics"
}

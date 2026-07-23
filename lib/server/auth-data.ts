/**
 * Server-only auth/profile operations (Firebase Admin SDK). Firebase Auth credential
 * operations (sign-in, sign-up, password change) stay on the client because they need a
 * browser session; everything that touches Firestore (profiles, sessions, pending-user
 * migration) lives here so the browser never reads/writes the users collection directly.
 */

import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin"
import { resolveUserTenant } from "@/lib/tenant"

const SESSION_TIMEOUT_MS = 5 * 60 * 1000

function toIso(value: any): string | null {
  if (!value) return null
  if (typeof value?.toDate === "function") return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function serializeProfile(data: any) {
  return {
    ...data,
    createdAt: toIso(data.createdAt),
    lastLoginAt: toIso(data.lastLoginAt),
    termsAcceptedAt: toIso(data.termsAcceptedAt),
    allowChat: data.allowChat === true,
  }
}

export async function getProfile(uid: string) {
  const db = await getAdminDb()
  const snap = await db.collection("users").doc(uid).get()
  if (!snap.exists) return null
  return serializeProfile(snap.data())
}

/** Create the Firestore profile for a freshly self-registered user (signUp). */
export async function createProfile(input: {
  uid: string
  email: string
  role?: "admin" | "publisher" | "subscriber"
  displayName?: string
}) {
  const db = await getAdminDb()
  const existing = await db.collection("users").doc(input.uid).get()
  if (existing.exists) {
    return { success: false, error: "Profile already exists" }
  }

  const normalizedEmail = (input.email || "").trim().toLowerCase()
  const profile = {
    uid: input.uid,
    email: normalizedEmail,
    role: "subscriber" as const,
    tenant: resolveUserTenant({ email: normalizedEmail }),
    displayName: input.displayName || normalizedEmail.split("@")[0],
    createdAt: new Date(),
    isActive: true,
  }
  await db.collection("users").doc(input.uid).set(profile)
  return { success: true }
}

/**
 * First-login migration for admin-created "pending" users: creates the real Firebase Auth
 * account and repoints every assignment/permission/session from the pending id to the new uid.
 * Returns migrated:false when the email isn't a pending account or the password doesn't match.
 */
export async function migratePendingUser(
  email: string,
  password: string,
): Promise<{ migrated: boolean; role?: string; error?: string }> {
  const db = await getAdminDb()
  const auth = await getAdminAuth()
  const lower = email.toLowerCase()

  const snap = await db
    .collection("users")
    .where("email", "==", lower)
    .where("isPending", "==", true)
    .get()
  if (snap.empty) return { migrated: false }

  const pendingDoc = snap.docs[0]
  const pendingData = pendingDoc.data() as any
  if (!pendingData.isPending || pendingData.pendingPassword !== password) {
    return { migrated: false }
  }

  // Create (or reuse) the real Auth account.
  let newAuthUid: string
  try {
    const created = await auth.createUser({ email: lower, password })
    newAuthUid = created.uid
  } catch (e: any) {
    if (e?.code === "auth/email-already-exists") {
      const existing = await auth.getUserByEmail(lower)
      newAuthUid = existing.uid
      // Orphaned Auth rows can exist before Firestore migration finishes — align password.
      await auth.updateUser(newAuthUid, { password })
    } else {
      return { migrated: false, error: e?.message || "Failed to create account" }
    }
  }

  const oldPendingId = pendingDoc.id
  const pubDisplayName = pendingData.displayName || pendingData.email?.split("@")[0] || "User"

  const repoint = async (
    coll: string,
    field: "subscriberId" | "publisherId",
    extra?: Record<string, any>,
  ) => {
    const rows = await db.collection(coll).where(field, "==", oldPendingId).get()
    await Promise.all(
      rows.docs.map((d: any) => d.ref.update({ [field]: newAuthUid, ...(extra || {}) })),
    )
  }

  await Promise.all([
    repoint("streamPermissions", "subscriberId"),
    repoint("zoomPublisherAssignments", "subscriberId"),
    repoint("streamAssignments", "subscriberId"),
    repoint("zoomCallAssignments", "subscriberId"),
    repoint("streamPermissions", "publisherId"),
    repoint("scheduledCalls", "publisherId", { publisherName: pubDisplayName, updatedAt: new Date() }),
    repoint("streamSessions", "publisherId", { publisherName: pubDisplayName }),
    repoint("zoomCalls", "publisherId"),
  ])

  const userProfile = {
    uid: newAuthUid,
    email: lower,
    role: pendingData.role,
    tenant: pendingData.tenant ?? resolveUserTenant({ email: lower }),
    displayName: pendingData.displayName,
    createdAt: pendingData.createdAt ?? new Date(),
    isActive: pendingData.isActive ?? true,
    allowChat: pendingData.allowChat ?? false,
    mustChangePassword: pendingData.mustChangePassword ?? pendingData.role === "subscriber",
    isPending: false,
    pendingPassword: null,
  }
  await db.collection("users").doc(newAuthUid).set(userProfile)

  if (oldPendingId !== newAuthUid) {
    await db.collection("users").doc(oldPendingId).delete()
  }

  return { migrated: true, role: pendingData.role }
}

/**
 * Single-session enforcement for subscribers. Returns the session id the client should
 * persist, or ok:false when the account is already active in another browser.
 */
export async function establishSession(
  uid: string,
  localSessionId?: string,
): Promise<{ ok: boolean; sessionId?: string; error?: string }> {
  const db = await getAdminDb()
  const ref = db.collection("users").doc(uid)
  const snap = await ref.get()
  if (!snap.exists) return { ok: true }
  const data = snap.data() as any
  if (data.role !== "subscriber") return { ok: true }

  const newSession = () => {
    const sessionId = crypto.randomUUID()
    return ref.update({ sessionId, lastLoginAt: new Date() }).then(() => ({ ok: true, sessionId }))
  }

  if (data.sessionId) {
    if (localSessionId && localSessionId === data.sessionId) {
      await ref.update({ lastLoginAt: new Date() })
      return { ok: true, sessionId: data.sessionId }
    }
    const last = data.lastLoginAt?.toDate?.() ?? (data.lastLoginAt ? new Date(data.lastLoginAt) : null)
    const expired = !last || Date.now() - last.getTime() > SESSION_TIMEOUT_MS
    if (expired) return newSession()
    return {
      ok: false,
      error:
        "This account is already logged in on another browser. Please sign out from there first or wait a few minutes if you closed the browser.",
    }
  }
  return newSession()
}

export async function heartbeatSession(uid: string) {
  const db = await getAdminDb()
  await db.collection("users").doc(uid).update({ lastLoginAt: new Date() })
  return { success: true }
}

export async function clearSession(uid: string) {
  const db = await getAdminDb()
  const ref = db.collection("users").doc(uid)
  const snap = await ref.get()
  if (snap.exists && (snap.data() as any)?.role === "subscriber") {
    await ref.update({ sessionId: null })
  }
  return { success: true }
}

export async function acceptTerms(uid: string) {
  const db = await getAdminDb()
  await db.collection("users").doc(uid).update({ termsAcceptedAt: new Date() })
  return { success: true }
}

export async function setMustChangePassword(uid: string, value: boolean) {
  const db = await getAdminDb()
  await db.collection("users").doc(uid).update({ mustChangePassword: value })
  return { success: true }
}

/**
 * Server-only admin/data operations using the Firebase Admin SDK.
 *
 * These replace the direct client Firestore calls that used to live in lib/admin.ts.
 * Every function here runs ONLY on the server (API routes), so the browser never
 * touches Firestore directly. Tenant scoping and role checks are enforced by the
 * calling route + the helpers in lib/tenant.ts.
 *
 * Dates are returned as ISO strings (JSON-safe); the client lib converts them back.
 */

import { FieldValue } from "firebase-admin/firestore"
import { getAdminDb } from "@/lib/firebase-admin"
import {
  resolveUserTenant,
  validateNewUserForCreator,
  type UserTenant,
} from "@/lib/tenant"

type Role = "admin" | "publisher" | "subscriber"

/** Convert a Firestore Timestamp / Date / string to an ISO string (or null). */
function toIso(value: any): string | null {
  if (!value) return null
  if (typeof value?.toDate === "function") return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function docToObject(doc: FirebaseFirestore.DocumentSnapshot) {
  const data = doc.data() || {}
  const out: Record<string, any> = { id: doc.id, ...data }
  for (const key of ["createdAt", "resolvedAt", "endedAt", "updatedAt"]) {
    if (key in out) out[key] = toIso(out[key])
  }
  return out
}

// ── Users ───────────────────────────────────────────────────────────────────
export async function createUser(input: {
  email: string
  password: string
  role: Role
  displayName?: string
  creator?: { tenant: UserTenant; role: Role }
}) {
  const db = await getAdminDb()
  const normalizedEmail = (input.email || "").trim().toLowerCase()
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return { user: null, error: "Please enter a valid email address" }
  }

  const validated = validateNewUserForCreator(normalizedEmail, input.role, input.creator)
  if (!validated.ok) return { user: null, error: validated.error }
  const tenant = validated.tenant

  const existing = await db.collection("users").where("email", "==", normalizedEmail).get()
  if (!existing.empty) return { user: null, error: "A user with this email already exists" }

  const pendingUserId = `pending_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  const userProfile = {
    uid: pendingUserId,
    email: normalizedEmail,
    role: input.role,
    tenant,
    displayName: input.displayName || normalizedEmail.split("@")[0],
    createdAt: new Date(),
    isActive: true,
    isPending: true,
    pendingPassword: input.password,
  }
  await db.collection("users").doc(pendingUserId).set(userProfile)
  return {
    user: { uid: pendingUserId, email: normalizedEmail },
    error: null,
    message: "User created successfully. They can now log in with their credentials.",
  }
}

export async function getAllUsers(adminViewer?: { role?: Role; email?: string; tenant?: UserTenant }) {
  const db = await getAdminDb()
  const snap = await db.collection("users").orderBy("createdAt", "desc").get()
  let rows = snap.docs.map(docToObject)
  if (adminViewer?.role === "admin") {
    const scope = resolveUserTenant(adminViewer)
    if (scope === "kevionics") {
      rows = rows.filter((u: any) => resolveUserTenant(u) === "kevionics" && u.role === "subscriber")
    } else {
      rows = rows.filter((u: any) => resolveUserTenant(u) !== "kevionics")
    }
  }
  return rows
}

export async function getUsersByRole(
  role: Role,
  adminViewer?: { role?: Role; email?: string; tenant?: UserTenant },
) {
  const db = await getAdminDb()
  const snap = await db.collection("users").where("role", "==", role).get()
  let users = snap.docs.map(docToObject)
  if (role === "subscriber" && adminViewer?.role === "admin") {
    const scope = resolveUserTenant(adminViewer)
    users = users.filter((u: any) => resolveUserTenant(u) === scope)
  }
  return users.sort(
    (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

export async function updateUserStatus(userId: string, isActive: boolean) {
  const db = await getAdminDb()
  await db.collection("users").doc(userId).update({ isActive })
  return { success: true }
}

export async function updateUserChatPermission(userId: string, allowChat: boolean) {
  const db = await getAdminDb()
  await db.collection("users").doc(userId).update({ allowChat })
  return { success: true }
}

export async function updatePublisherZoomMapping(
  userId: string,
  updates: { zoomUserId?: string; zoomUserEmail?: string },
) {
  const db = await getAdminDb()
  await db.collection("users").doc(userId).update(updates)
  return { success: true }
}

export async function logoutAllUsers(adminViewer?: { role?: Role; email?: string; tenant?: UserTenant }) {
  const db = await getAdminDb()
  const snap = await db.collection("users").get()
  const scope = adminViewer?.role === "admin" ? resolveUserTenant(adminViewer) : "default"
  const batch = db.batch()
  let count = 0
  snap.docs.forEach((d: any) => {
    const data = d.data() as any
    if (!data.sessionId || data.role !== "subscriber") return
    if (resolveUserTenant(data) !== scope) return
    batch.update(d.ref, { sessionId: null })
    count++
  })
  if (count > 0) await batch.commit()
  return { success: true, count }
}

// ── Stream permissions ────────────────────────────────────────────────────────
export async function createStreamPermission(permission: Record<string, any>) {
  const db = await getAdminDb()
  const ref = await db.collection("streamPermissions").add({ ...permission, createdAt: new Date() })
  return { success: true, id: ref.id }
}

export async function getStreamPermissions() {
  const db = await getAdminDb()
  const snap = await db.collection("streamPermissions").get()
  return snap.docs
    .map(docToObject)
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function updateStreamPermission(permissionId: string, updates: Record<string, any>) {
  const db = await getAdminDb()
  await db.collection("streamPermissions").doc(permissionId).update(updates)
  return { success: true }
}

export async function deleteStreamPermission(permissionId: string) {
  const db = await getAdminDb()
  await db.collection("streamPermissions").doc(permissionId).delete()
  return { success: true }
}

// ── Stream assignments ──────────────────────────────────────────────────────
export async function createStreamAssignment(assignment: Record<string, any>) {
  const db = await getAdminDb()
  const ref = await db.collection("streamAssignments").add({ ...assignment, createdAt: new Date() })
  return { success: true, id: ref.id }
}

export async function getStreamAssignments() {
  const db = await getAdminDb()
  const snap = await db.collection("streamAssignments").get()
  return snap.docs
    .map(docToObject)
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function deleteStreamAssignment(assignmentId: string) {
  const db = await getAdminDb()
  await db.collection("streamAssignments").doc(assignmentId).delete()
  return { success: true }
}

export async function updateStreamAssignment(assignmentId: string, updates: Record<string, any>) {
  const db = await getAdminDb()
  await db.collection("streamAssignments").doc(assignmentId).update(updates)
  return { success: true }
}

// ── Contact messages ──────────────────────────────────────────────────────────
export async function getContactMessages() {
  const db = await getAdminDb()
  const snap = await db.collection("contactMessages").orderBy("createdAt", "desc").get()
  return snap.docs.map(docToObject)
}

export async function markContactMessageRead(messageId: string) {
  const db = await getAdminDb()
  await db.collection("contactMessages").doc(messageId).update({ read: true })
  return { success: true }
}

// ── Admin broadcasts ──────────────────────────────────────────────────────────
export async function createAdminBroadcast(input: {
  message: string
  createdByUid: string
  createdByName?: string
  targetTenant?: UserTenant
}) {
  const trimmed = (input.message || "").trim()
  if (!trimmed) return { success: false, error: "Message cannot be empty" }
  const db = await getAdminDb()
  const ref = await db.collection("adminBroadcasts").add({
    message: trimmed,
    createdAt: new Date(),
    createdByUid: input.createdByUid,
    createdByName: input.createdByName?.trim() || null,
    targetTenant: input.targetTenant || "default",
  })
  return { success: true, id: ref.id }
}

export async function getAdminBroadcasts() {
  const db = await getAdminDb()
  const snap = await db.collection("adminBroadcasts").orderBy("createdAt", "desc").get()
  return snap.docs.map(docToObject)
}

// ── Reports ─────────────────────────────────────────────────────────────────
export async function createReport(report: Record<string, any>) {
  const db = await getAdminDb()
  const ref = await db.collection("reports").add({
    ...report,
    createdAt: new Date(),
    status: "pending",
  })
  return { success: true, id: ref.id }
}

export async function getReports() {
  const db = await getAdminDb()
  const snap = await db.collection("reports").orderBy("createdAt", "desc").get()
  return snap.docs.map(docToObject)
}

export async function resolveReport(reportId: string, resolvedBy: string) {
  const db = await getAdminDb()
  await db.collection("reports").doc(reportId).update({
    status: "resolved",
    resolvedAt: new Date(),
    resolvedBy,
  })
  return { success: true }
}

// ── Block events ──────────────────────────────────────────────────────────────
export async function addBlockEvent(event: Record<string, any>) {
  const db = await getAdminDb()
  await db.collection("blockEvents").add({ ...event, createdAt: new Date() })
  return { success: true }
}

export async function getBlockEvents() {
  const db = await getAdminDb()
  const snap = await db.collection("blockEvents").orderBy("createdAt", "desc").get()
  return snap.docs.map(docToObject)
}

export async function blockUser(input: {
  blockerId: string
  blockerName: string
  blockedUserId: string
  blockedUserName: string
}) {
  const db = await getAdminDb()
  await db
    .collection("users")
    .doc(input.blockerId)
    .update({ blockedUserIds: FieldValue.arrayUnion(input.blockedUserId) })
  await addBlockEvent({
    blockerId: input.blockerId,
    blockerName: input.blockerName,
    blockedUserId: input.blockedUserId,
    blockedUserName: input.blockedUserName,
  })
  return { success: true }
}

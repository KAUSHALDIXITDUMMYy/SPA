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
  getStreamAssignmentDocsForStreamIds,
  resolveAssignmentDateKey,
} from "@/lib/server/assignment-day"
import { paginateOrderedQuery, queryByIdChunks } from "@/lib/server/pagination"
import { getActiveStreams } from "@/lib/server/streaming-data"
import { normalizePageLimit } from "@/lib/pagination"
import {
  resolveUserTenant,
  userVisibleToAdmin,
  validateNewUserForCreator,
  type UserTenant,
} from "@/lib/tenant"

type Role = "admin" | "publisher" | "subscriber"

type AdminViewer = { role?: Role; email?: string; tenant?: UserTenant }

const TENANT_MAP_TTL_MS = 60_000
let tenantMapCache: { map: Map<string, UserTenant>; at: number } | null = null

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

function filterUsersForAdmin<T extends { tenant?: UserTenant; email?: string; role?: string }>(
  rows: T[],
  adminViewer?: AdminViewer,
): T[] {
  if (adminViewer?.role !== "admin") return rows
  return rows.filter((u) => userVisibleToAdmin(adminViewer, u))
}

async function loadUserTenantByIdMap(): Promise<Map<string, UserTenant>> {
  const now = Date.now()
  if (tenantMapCache && now - tenantMapCache.at < TENANT_MAP_TTL_MS) {
    return tenantMapCache.map
  }

  const db = await getAdminDb()
  const snap = await db.collection("users").get()
  const map = new Map<string, UserTenant>()
  snap.docs.forEach((doc) => {
    const data = doc.data() as { uid?: string; email?: string; tenant?: UserTenant; role?: string }
    const tenant = resolveUserTenant(data)
    map.set(doc.id, tenant)
    if (data.uid) map.set(data.uid, tenant)
  })
  tenantMapCache = { map, at: now }
  return map
}

function filterPermissionsForAdmin(
  permissions: Record<string, any>[],
  tenantByUserId: Map<string, UserTenant>,
  adminViewer?: AdminViewer,
) {
  if (adminViewer?.role !== "admin") return permissions
  const scope = resolveUserTenant(adminViewer)
  return permissions.filter((p) => {
    const subscriberTenant = tenantByUserId.get(p.subscriberId)
    const publisherTenant = tenantByUserId.get(p.publisherId)
    if (scope === "kevionics") {
      return subscriberTenant === "kevionics"
    }
    if (subscriberTenant === "kevionics" || publisherTenant === "kevionics") {
      return false
    }
    return true
  })
}

function filterAssignmentsForAdmin(
  assignments: Record<string, any>[],
  tenantByUserId: Map<string, UserTenant>,
  adminViewer?: AdminViewer,
) {
  if (adminViewer?.role !== "admin") return assignments
  const scope = resolveUserTenant(adminViewer)
  return assignments.filter((a) => {
    const subscriberTenant = tenantByUserId.get(a.subscriberId)
    if (scope === "kevionics") {
      return subscriberTenant === "kevionics"
    }
    return subscriberTenant !== "kevionics"
  })
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

export async function getAllUsersPage(
  adminViewer?: AdminViewer,
  options?: { limit?: number; cursor?: string | null },
) {
  const db = await getAdminDb()
  const page = await paginateOrderedQuery({
    db,
    buildQuery: (database) => database.collection("users").orderBy("createdAt", "desc"),
    mapDoc: docToObject,
    accept: (row) => filterUsersForAdmin([row], adminViewer).length > 0,
    limit: options?.limit,
    cursor: options?.cursor,
    cursorCollection: "users",
  })
  return page
}

export async function getAllUsers(adminViewer?: AdminViewer) {
  return (await getAllUsersPage(adminViewer)).items
}

export async function getUsersByRolePage(
  role: Role,
  adminViewer?: AdminViewer,
  options?: { limit?: number; cursor?: string | null },
) {
  const db = await getAdminDb()
  const page = await paginateOrderedQuery({
    db,
    buildQuery: (database) =>
      database.collection("users").where("role", "==", role).orderBy("createdAt", "desc"),
    mapDoc: docToObject,
    accept: (row) => filterUsersForAdmin([row], adminViewer).length > 0,
    limit: options?.limit,
    cursor: options?.cursor,
    cursorCollection: "users",
  })
  return page
}

export async function getUsersByRole(role: Role, adminViewer?: AdminViewer) {
  return (await getUsersByRolePage(role, adminViewer)).items
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

export async function getStreamPermissionsPage(
  adminViewer?: AdminViewer,
  options?: { limit?: number; cursor?: string | null },
) {
  const db = await getAdminDb()
  const tenantByUserId = await loadUserTenantByIdMap()
  return paginateOrderedQuery({
    db,
    buildQuery: (database) => database.collection("streamPermissions").orderBy("createdAt", "desc"),
    mapDoc: docToObject,
    accept: (row) => filterPermissionsForAdmin([row], tenantByUserId, adminViewer).length > 0,
    limit: options?.limit,
    cursor: options?.cursor,
    cursorCollection: "streamPermissions",
  })
}

export async function getStreamPermissions(adminViewer?: AdminViewer) {
  return (await getStreamPermissionsPage(adminViewer)).items
}

export async function getStreamPermissionsForSubscriberIds(
  subscriberIds: string[],
  adminViewer?: AdminViewer,
) {
  const db = await getAdminDb()
  const tenantByUserId = await loadUserTenantByIdMap()
  const rows = await queryByIdChunks(db, "streamPermissions", "subscriberId", subscriberIds, docToObject)
  return filterPermissionsForAdmin(rows, tenantByUserId, adminViewer).sort(
    (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
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
  const dateKey = await resolveAssignmentDateKey(db)
  const ref = await db.collection("streamAssignments").add({
    ...assignment,
    dateKey,
    createdAt: new Date(),
  })
  return { success: true, id: ref.id }
}

async function loadAssignmentsForActiveStreams(adminViewer?: AdminViewer) {
  const db = await getAdminDb()
  const [tenantByUserId, streams] = await Promise.all([
    loadUserTenantByIdMap(),
    getActiveStreams(),
  ])
  const streamIds = streams.map((s: any) => s.id).filter(Boolean)
  const assignmentDocs = await getStreamAssignmentDocsForStreamIds(db, streamIds)
  return {
    streams,
    assignments: filterAssignmentsForAdmin(
      assignmentDocs.map(docToObject),
      tenantByUserId,
      adminViewer,
    ).sort(
      (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
  }
}

export async function getStreamAssignments(adminViewer?: AdminViewer) {
  const { assignments } = await loadAssignmentsForActiveStreams(adminViewer)
  return assignments
}

/** One round-trip for the Stream Assignments admin tab (subscribers paginated). */
export async function getStreamAssignmentsBootstrap(
  adminViewer?: AdminViewer,
  options?: { limit?: number; cursor?: string | null },
) {
  const limit = normalizePageLimit(options?.limit)
  const [subscriberPage, { streams, assignments: allAssignments }] = await Promise.all([
    getUsersByRolePage("subscriber", adminViewer, { limit, cursor: options?.cursor }),
    loadAssignmentsForActiveStreams(adminViewer),
  ])
  const subscriberIds = new Set(subscriberPage.items.map((s: any) => s.id))
  const assignments = allAssignments.filter((a: any) => subscriberIds.has(a.subscriberId))
  return {
    subscribers: subscriberPage.items,
    streams,
    assignments,
    nextCursor: subscriberPage.nextCursor,
    hasMore: subscriberPage.hasMore,
  }
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
export async function getContactMessagesPage(options?: { limit?: number; cursor?: string | null }) {
  const db = await getAdminDb()
  return paginateOrderedQuery({
    db,
    buildQuery: (database) => database.collection("contactMessages").orderBy("createdAt", "desc"),
    mapDoc: docToObject,
    limit: options?.limit,
    cursor: options?.cursor,
    cursorCollection: "contactMessages",
  })
}

export async function getContactMessages() {
  return (await getContactMessagesPage()).items
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

export async function getAdminBroadcastsPage(options?: { limit?: number; cursor?: string | null }) {
  const db = await getAdminDb()
  return paginateOrderedQuery({
    db,
    buildQuery: (database) => database.collection("adminBroadcasts").orderBy("createdAt", "desc"),
    mapDoc: docToObject,
    limit: options?.limit,
    cursor: options?.cursor,
    cursorCollection: "adminBroadcasts",
  })
}

export async function getAdminBroadcasts() {
  return (await getAdminBroadcastsPage()).items
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

export async function getReportsPage(options?: { limit?: number; cursor?: string | null }) {
  const db = await getAdminDb()
  return paginateOrderedQuery({
    db,
    buildQuery: (database) => database.collection("reports").orderBy("createdAt", "desc"),
    mapDoc: docToObject,
    limit: options?.limit,
    cursor: options?.cursor,
    cursorCollection: "reports",
  })
}

export async function getReports() {
  return (await getReportsPage()).items
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

export async function getBlockEventsPage(options?: { limit?: number; cursor?: string | null }) {
  const db = await getAdminDb()
  return paginateOrderedQuery({
    db,
    buildQuery: (database) => database.collection("blockEvents").orderBy("createdAt", "desc"),
    mapDoc: docToObject,
    limit: options?.limit,
    cursor: options?.cursor,
    cursorCollection: "blockEvents",
  })
}

export async function getBlockEvents() {
  return (await getBlockEventsPage()).items
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

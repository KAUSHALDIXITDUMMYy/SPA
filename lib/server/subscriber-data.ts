/**
 * Server-only subscriber/permission reads (Firebase Admin SDK). Mirrors lib/subscriber.ts
 * and lib/permissions.ts data access, so the browser never queries Firestore directly.
 */

import { getAdminDb } from "@/lib/firebase-admin"
import type { Firestore } from "firebase-admin/firestore"
import { paginateOrderedQuery, queryByIdChunks } from "@/lib/server/pagination"
import { resolveUserTenant, type UserTenant } from "@/lib/tenant"

function toIso(value: any): string | null {
  if (!value) return null
  if (typeof value?.toDate === "function") return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function serializeSession(id: string, data: any) {
  return { id, ...data, createdAt: toIso(data.createdAt), endedAt: toIso(data.endedAt) }
}

function serializeRow(id: string, data: any) {
  const out: Record<string, any> = { id, ...data }
  for (const k of ["createdAt", "updatedAt"]) if (k in out) out[k] = toIso(out[k])
  return out
}

const PUBLISHER_IN_LIMIT = 30

async function loadActiveStreamsForPublishers(db: Firestore, publisherIds: string[]) {
  const activeStreamsMap = new Map<string, any>()
  const ids = [...new Set(publisherIds.filter(Boolean))]
  if (!ids.length) return activeStreamsMap

  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += PUBLISHER_IN_LIMIT) {
    chunks.push(ids.slice(i, i + PUBLISHER_IN_LIMIT))
  }

  const snaps = await Promise.all(
    chunks.map((chunk) =>
      db
        .collection("streamSessions")
        .where("publisherId", "in", chunk)
        .where("isActive", "==", true)
        .get(),
    ),
  )

  for (const snap of snaps) {
    snap.docs.forEach((d: any) => {
      activeStreamsMap.set(d.id, serializeSession(d.id, d.data()))
    })
  }
  return activeStreamsMap
}

export type SubscriberPermissionsPayload = {
  permissions: any[]
  hasAssignment: boolean
}

export async function getSubscriberPermissions(subscriberId: string): Promise<SubscriberPermissionsPayload> {
  const db = await getAdminDb()

  const [permsSnap, assignsSnap] = await Promise.all([
    db
      .collection("streamPermissions")
      .where("subscriberId", "==", subscriberId)
      .where("isActive", "==", true)
      .get(),
    db
      .collection("streamAssignments")
      .where("subscriberId", "==", subscriberId)
      .where("isActive", "==", true)
      .get(),
  ])

  const permissions = permsSnap.docs.map((d: any) => serializeRow(d.id, d.data()))
  const assignments = assignsSnap.docs.map((d: any) => serializeRow(d.id, d.data()))

  const publisherIds = new Set<string>()
  permissions.forEach((p: any) => {
    if (p.publisherId) publisherIds.add(p.publisherId)
  })

  const assignmentSessionIds = assignments
    .map((a: any) => a.streamSessionId as string | undefined)
    .filter((id: string | undefined): id is string => Boolean(id))

  const assignmentSessionSnaps =
    assignmentSessionIds.length > 0
      ? await db.getAll(...assignmentSessionIds.map((id) => db.collection("streamSessions").doc(id)))
      : []

  assignmentSessionSnaps.forEach((snap: any) => {
    if (snap.exists) {
      const pid = snap.data()?.publisherId as string | undefined
      if (pid) publisherIds.add(pid)
    }
  })

  const [activeStreamsMap, publisherSnaps] = await Promise.all([
    loadActiveStreamsForPublishers(db, [...publisherIds]),
    publisherIds.size > 0
      ? db.getAll(...[...publisherIds].map((id) => db.collection("users").doc(id)))
      : Promise.resolve([]),
  ])
  assignmentSessionSnaps.forEach((snap: any) => {
    if (snap.exists && !activeStreamsMap.has(snap.id)) {
      activeStreamsMap.set(snap.id, serializeSession(snap.id, snap.data()))
    }
  })

  const usersMap = new Map<string, any>()
  publisherSnaps.forEach((snap: any) => {
    if (!snap.exists) return
    const u = snap.data()
    usersMap.set(snap.id, u)
    if (u.uid) usersMap.set(u.uid, u)
  })

  const hasAssignment = !permsSnap.empty || !assignsSnap.empty

  const enriched: any[] = []

  permissions.forEach((permission: any) => {
    const publisherData = usersMap.get(permission.publisherId)
    const publisherName = publisherData?.displayName || publisherData?.email || "Unknown Publisher"
    const streamsForPublisher = Array.from(activeStreamsMap.values()).filter(
      (s: any) => s.publisherId === permission.publisherId,
    )

    if (streamsForPublisher.length === 0) {
      enriched.push({ ...permission, publisherName, streamSession: undefined })
      return
    }
    streamsForPublisher.forEach((streamData: any) => {
      enriched.push({
        ...permission,
        id: `${permission.id}_${streamData.id}`,
        publisherName,
        streamSession: streamData,
      })
    })
  })

  assignments.forEach((assignment: any) => {
    const streamData = activeStreamsMap.get(assignment.streamSessionId)
    if (streamData) {
      const publisherData = usersMap.get(streamData.publisherId)
      enriched.push({
        id: assignment.id,
        subscriberId: assignment.subscriberId,
        publisherId: streamData.publisherId,
        publisherName: publisherData?.displayName || publisherData?.email || "Unknown Publisher",
        allowVideo: true,
        allowAudio: true,
        isActive: true,
        createdAt: assignment.createdAt,
        streamSession: streamData,
      })
    }
  })

  const unique = new Map<string, any>()
  enriched.forEach((perm) => {
    const sid = perm.streamSession?.id ?? perm.id ?? "none"
    const key = `${perm.subscriberId}_${perm.publisherId}_${sid}`
    if (!unique.has(key)) unique.set(key, perm)
  })

  return { permissions: Array.from(unique.values()), hasAssignment }
}

export async function getAccessiblePublisherIdsForSubscriber(subscriberId: string): Promise<string[]> {
  const db = await getAdminDb()
  const ids = new Set<string>()
  const [permsSnap, assignSnap] = await Promise.all([
    db
      .collection("streamPermissions")
      .where("subscriberId", "==", subscriberId)
      .where("isActive", "==", true)
      .get(),
    db
      .collection("streamAssignments")
      .where("subscriberId", "==", subscriberId)
      .where("isActive", "==", true)
      .get(),
  ])
  permsSnap.docs.forEach((d: any) => {
    const pid = d.data().publisherId as string | undefined
    if (pid) ids.add(pid)
  })
  const sessionReads = assignSnap.docs
    .map((d: any) => d.data().streamSessionId as string | undefined)
    .filter((sid: any): sid is string => Boolean(sid))
    .map((sid: string) => db.collection("streamSessions").doc(sid).get())
  const sessionSnaps = await Promise.all(sessionReads)
  sessionSnaps.forEach((snap: any) => {
    if (snap.exists) {
      const pid = snap.data()?.publisherId as string | undefined
      if (pid) ids.add(pid)
    }
  })
  return Array.from(ids)
}

export async function subscriberHasAnyAssignment(subscriberId: string): Promise<boolean> {
  const db = await getAdminDb()
  const [permsSnap, assignSnap] = await Promise.all([
    db
      .collection("streamPermissions")
      .where("subscriberId", "==", subscriberId)
      .where("isActive", "==", true)
      .limit(1)
      .get(),
    db
      .collection("streamAssignments")
      .where("subscriberId", "==", subscriberId)
      .where("isActive", "==", true)
      .limit(1)
      .get(),
  ])
  return !permsSnap.empty || !assignSnap.empty
}

// ── permissions.ts (PermissionsManager) backing reads ──
export async function getUserPermissions(subscriberId: string) {
  const db = await getAdminDb()
  const snap = await db
    .collection("streamPermissions")
    .where("subscriberId", "==", subscriberId)
    .where("isActive", "==", true)
    .get()
  return snap.docs
    .map((d: any) => serializeRow(d.id, d.data()))
    .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
}

function filterPermissionsForAdmin(
  rows: Record<string, any>[],
  tenantByUserId: Map<string, UserTenant>,
  adminViewer?: { role?: string; email?: string; tenant?: UserTenant },
) {
  if (adminViewer?.role !== "admin") return rows
  const scope = resolveUserTenant(adminViewer)
  return rows.filter((p) => {
    const st = tenantByUserId.get(p.subscriberId)
    const pt = tenantByUserId.get(p.publisherId)
    if (scope === "kevionics") return st === "kevionics"
    return st !== "kevionics" && pt !== "kevionics"
  })
}

async function loadTenantMapForPermissions(db: Firestore) {
  const usersSnap = await db.collection("users").get()
  const tenantByUserId = new Map<string, UserTenant>()
  usersSnap.docs.forEach((doc) => {
    const data = doc.data()
    const tenant = resolveUserTenant(data as { email?: string; tenant?: UserTenant })
    tenantByUserId.set(doc.id, tenant)
    if (data.uid) tenantByUserId.set(data.uid, tenant)
  })
  return tenantByUserId
}

export async function getAllPermissionsPage(
  adminViewer?: { role?: string; email?: string; tenant?: UserTenant },
  options?: { limit?: number; cursor?: string | null },
) {
  const db = await getAdminDb()
  const tenantByUserId =
    adminViewer?.role === "admin" ? await loadTenantMapForPermissions(db) : new Map()
  return paginateOrderedQuery({
    db,
    buildQuery: (database) => database.collection("streamPermissions").orderBy("createdAt", "desc"),
    mapDoc: (doc) => serializeRow(doc.id, doc.data() || {}),
    accept: (row) => filterPermissionsForAdmin([row], tenantByUserId, adminViewer).length > 0,
    limit: options?.limit,
    cursor: options?.cursor,
    cursorCollection: "streamPermissions",
  })
}

export async function getPermissionsForSubscriberIds(
  subscriberIds: string[],
  adminViewer?: { role?: string; email?: string; tenant?: UserTenant },
) {
  const db = await getAdminDb()
  const tenantByUserId =
    adminViewer?.role === "admin" ? await loadTenantMapForPermissions(db) : new Map()
  const rows = await queryByIdChunks(db, "streamPermissions", "subscriberId", subscriberIds, (doc) =>
    serializeRow(doc.id, doc.data() || {}),
  )
  return filterPermissionsForAdmin(rows, tenantByUserId, adminViewer)
}

export async function getAllPermissions(adminViewer?: {
  role?: string
  email?: string
  tenant?: UserTenant
}) {
  return (await getAllPermissionsPage(adminViewer)).items
}

export async function checkStreamAccess(subscriberId: string, publisherId: string) {
  const db = await getAdminDb()
  const snap = await db
    .collection("streamPermissions")
    .where("subscriberId", "==", subscriberId)
    .where("publisherId", "==", publisherId)
    .where("isActive", "==", true)
    .get()
  if (snap.docs.length > 0) {
    return { hasAccess: true, permission: serializeRow(snap.docs[0].id, snap.docs[0].data()) }
  }
  return { hasAccess: false }
}

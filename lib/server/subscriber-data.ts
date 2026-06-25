/**
 * Server-only subscriber/permission reads (Firebase Admin SDK). Mirrors lib/subscriber.ts
 * and lib/permissions.ts data access, so the browser never queries Firestore directly.
 */

import { getAdminDb } from "@/lib/firebase-admin"
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

export async function getSubscriberPermissions(subscriberId: string) {
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

  const [usersSnap, streamsSnap] = await Promise.all([
    db.collection("users").where("role", "in", ["publisher", "admin"]).get(),
    db.collection("streamSessions").where("isActive", "==", true).get(),
  ])

  const usersMap = new Map<string, any>()
  usersSnap.docs.forEach((d: any) => {
    const u = d.data()
    usersMap.set(u.uid, u)
  })

  const activeStreamsMap = new Map<string, any>()
  streamsSnap.docs.forEach((d: any) => {
    activeStreamsMap.set(d.id, serializeSession(d.id, d.data()))
  })

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

  return Array.from(unique.values())
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

export async function getAllPermissions(adminViewer?: {
  role?: string
  email?: string
  tenant?: UserTenant
}) {
  const db = await getAdminDb()
  const snap = await db.collection("streamPermissions").get()
  let rows = snap.docs
    .map((d: any) => serializeRow(d.id, d.data()))
    .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())

  if (adminViewer?.role === "admin") {
    const usersSnap = await db.collection("users").get()
    const tenantByUserId = new Map<string, UserTenant>()
    usersSnap.docs.forEach((doc) => {
      const data = doc.data()
      const tenant = resolveUserTenant(data as { email?: string; tenant?: UserTenant })
      tenantByUserId.set(doc.id, tenant)
      if (data.uid) tenantByUserId.set(data.uid, tenant)
    })
    const scope = resolveUserTenant(adminViewer)
    rows = rows.filter((p) => {
      const st = tenantByUserId.get(p.subscriberId)
      const pt = tenantByUserId.get(p.publisherId)
      if (scope === "kevionics") return st === "kevionics"
      return st !== "kevionics" && pt !== "kevionics"
    })
  }

  return rows
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

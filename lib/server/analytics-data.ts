/**
 * Server-only analytics operations (Firebase Admin SDK). Mirrors the logic that used
 * to run in the browser via lib/analytics.ts, so the client never touches Firestore.
 */

import { getAdminDb } from "@/lib/firebase-admin"
import { resolveUserTenant, type UserTenant } from "@/lib/tenant"

function toIso(value: any): string {
  if (!value) return new Date().toISOString()
  if (typeof value?.toDate === "function") return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

function mapDoc(d: any) {
  const data = d.data() || {}
  const out: Record<string, any> = { id: d.id, ...data }
  for (const key of ["timestamp", "joinedAt", "lastSeen", "createdAt", "endedAt"]) {
    if (key in out) out[key] = toIso(out[key])
  }
  return out
}

export interface TrackInput {
  streamSessionId: string
  subscriberId: string
  subscriberName: string
  publisherId: string
  publisherName: string
  action: "join" | "leave" | "viewing"
  duration?: number
  subscriberTenant?: string
  location?: any
}

export async function trackSubscriberActivity(data: TrackInput) {
  const db = await getAdminDb()
  const { location, ...activityRest } = data
  const analyticsData: Record<string, unknown> = { ...activityRest, timestamp: new Date() }
  if (analyticsData.duration === undefined) delete analyticsData.duration
  const activeViewers = db.collection("activeViewers")

  if (data.action === "join") {
    const snap = await activeViewers
      .where("streamSessionId", "==", data.streamSessionId)
      .where("subscriberId", "==", data.subscriberId)
      .get()

    const tenantFields =
      data.subscriberTenant !== undefined ? { subscriberTenant: data.subscriberTenant } : {}
    const viewerFields = {
      isActive: true,
      joinedAt: new Date(),
      lastSeen: new Date(),
      subscriberName: data.subscriberName,
      publisherName: data.publisherName,
      ...tenantFields,
      ...(location ? { location } : {}),
    }

    if (snap.empty) {
      await activeViewers.add({
        streamSessionId: data.streamSessionId,
        subscriberId: data.subscriberId,
        publisherId: data.publisherId,
        ...viewerFields,
      })
    } else {
      const [primaryDoc, ...duplicateDocs] = snap.docs
      await primaryDoc.ref.update(viewerFields)
      await Promise.all(
        duplicateDocs.map((d: any) => d.ref.update({ isActive: false, lastSeen: new Date() })),
      )
    }
  } else if (data.action === "leave") {
    const snap = await activeViewers
      .where("streamSessionId", "==", data.streamSessionId)
      .where("subscriberId", "==", data.subscriberId)
      .where("isActive", "==", true)
      .get()
    await Promise.all(
      snap.docs.map((d: any) => d.ref.update({ isActive: false, lastSeen: new Date() })),
    )
  } else if (data.action === "viewing") {
    const snap = await activeViewers
      .where("streamSessionId", "==", data.streamSessionId)
      .where("subscriberId", "==", data.subscriberId)
      .where("isActive", "==", true)
      .get()
    await Promise.all(snap.docs.map((d: any) => d.ref.update({ lastSeen: new Date() })))
  }

  const ref = await db.collection("streamAnalytics").add(analyticsData)
  return { success: true, id: ref.id }
}

/**
 * Reads the currently-active viewers WITHOUT scanning the whole activeViewers
 * collection. Only viewers that belong to a currently-active stream session can
 * legitimately be "watching", so we scope the read to those session ids. Stale
 * rows from ended sessions are never read (they previously drove the read bill).
 */
async function readActiveViewersForSessions(
  db: Awaited<ReturnType<typeof getAdminDb>>,
  activeSessionIds: string[],
): Promise<any[]> {
  if (activeSessionIds.length === 0) return []
  const chunks: string[][] = []
  for (let i = 0; i < activeSessionIds.length; i += 30) {
    chunks.push(activeSessionIds.slice(i, i + 30))
  }
  const snaps = await Promise.all(
    chunks.map((chunk) =>
      db.collection("activeViewers").where("streamSessionId", "in", chunk).get(),
    ),
  )
  const rows: any[] = []
  for (const snap of snaps) {
    snap.docs.forEach((d: any) => {
      const data = d.data()
      if (data.isActive !== false) rows.push(mapDoc(d))
    })
  }
  return rows
}

/** Flags every activeViewers row for a session as inactive (call when a session ends). */
export async function markSessionViewersInactive(streamSessionId: string): Promise<void> {
  if (!streamSessionId) return
  const db = await getAdminDb()
  const snap = await db
    .collection("activeViewers")
    .where("streamSessionId", "==", streamSessionId)
    .where("isActive", "==", true)
    .get()
  if (snap.empty) return
  const now = new Date()
  const batch = db.batch()
  snap.docs.forEach((d: any) => batch.update(d.ref, { isActive: false, lastSeen: now }))
  await batch.commit()
}

export async function getAdminAnalytics(
  limitCount = 100,
  adminViewer?: { role?: string; email?: string; tenant?: UserTenant },
) {
  const db = await getAdminDb()
  maybeCleanupOldAnalytics()
  const analyticsSnap = await db
    .collection("streamAnalytics")
    .orderBy("timestamp", "desc")
    .limit(limitCount)
    .get()
  let analytics = analyticsSnap.docs.map(mapDoc)

  const streamsSnap = await db.collection("streamSessions").where("isActive", "==", true).get()
  const activeStreams = streamsSnap.docs.map(mapDoc)

  // Scope the viewer read to active sessions only — never scan the full collection.
  let activeViewers = await readActiveViewersForSessions(
    db,
    activeStreams.map((s: any) => s.id),
  )

  if (adminViewer?.role === "admin") {
    const scope = resolveUserTenant(adminViewer)
    const matchTenant = (row: { subscriberTenant?: string }) => {
      const t = row.subscriberTenant
      if (t === "kevionics" || t === "default") return t === scope
      return scope !== "kevionics"
    }
    analytics = analytics.filter(matchTenant)
    activeViewers = activeViewers.filter(matchTenant)
  }

  const uniqueViewers = new Set(analytics.map((a: any) => a.subscriberId)).size
  const leaveEvents = analytics.filter((a: any) => a.action === "leave")
  const averageViewDuration =
    leaveEvents.length > 0
      ? leaveEvents.reduce((sum: number, e: any) => sum + (e.duration || 0), 0) / leaveEvents.length
      : 0

  return {
    analytics,
    activeViewers,
    activeStreams,
    summary: {
      totalAnalytics: analytics.length,
      activeViewersCount: activeViewers.length,
      activeStreamsCount: activeStreams.length,
      uniqueViewers,
      averageViewDuration: Math.round(averageViewDuration),
    },
  }
}

export async function getPublisherAnalytics(publisherId: string, limitCount = 100) {
  const db = await getAdminDb()
  const analyticsSnap = await db
    .collection("streamAnalytics")
    .where("publisherId", "==", publisherId)
    .orderBy("timestamp", "desc")
    .limit(limitCount)
    .get()
  const analytics = analyticsSnap.docs.map(mapDoc)

  const streamsSnap = await db.collection("streamSessions").where("publisherId", "==", publisherId).get()
  const streamSessions = streamsSnap.docs.map(mapDoc)

  // Only viewers of this publisher's currently-active sessions can be watching now;
  // scope the read to those sessions instead of the publisher's whole viewer history.
  const activeSessionIds = streamSessions.filter((s: any) => s.isActive).map((s: any) => s.id)
  const currentViewers = await readActiveViewersForSessions(db, activeSessionIds)

  const uniqueViewers = new Set(analytics.map((a: any) => a.subscriberId)).size
  const totalViews = analytics.filter((a: any) => a.action === "join").length
  const currentViewersCount = currentViewers.filter((v: any) => v.isActive !== false).length

  return {
    analytics,
    currentViewers,
    streamSessions,
    summary: {
      totalAnalytics: analytics.length,
      currentViewersCount,
      totalStreams: streamSessions.length,
      activeStreams: streamSessions.filter((s: any) => s.isActive).length,
      uniqueViewers,
      totalViews,
    },
  }
}

export async function getStreamAnalytics(streamSessionId: string) {
  const db = await getAdminDb()
  const snap = await db
    .collection("streamAnalytics")
    .where("streamSessionId", "==", streamSessionId)
    .orderBy("timestamp", "desc")
    .limit(500)
    .get()
  return { analytics: snap.docs.map(mapDoc) }
}

export async function cleanupOldAnalytics(daysToKeep = 30) {
  const db = await getAdminDb()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - daysToKeep)
  let deletedCount = 0
  // Delete in bounded pages (Firestore batches cap at 500 writes) so this never
  // fails on a large backlog and never reads the whole collection at once.
  for (let page = 0; page < 50; page++) {
    const snap = await db
      .collection("streamAnalytics")
      .where("timestamp", "<", cutoff)
      .limit(400)
      .get()
    if (snap.empty) break
    const batch = db.batch()
    snap.docs.forEach((d: any) => batch.delete(d.ref))
    await batch.commit()
    deletedCount += snap.size
    if (snap.size < 400) break
  }
  return { success: true, deletedCount }
}

// Opportunistic, throttled cleanup. Runs at most once per 24h per warm server
// instance so old analytics can't pile up again (there is no external cron).
let lastCleanupAt = 0
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000
function maybeCleanupOldAnalytics() {
  const now = Date.now()
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return
  lastCleanupAt = now
  // Fire-and-forget; never block or fail the analytics response.
  void cleanupOldAnalytics(30).catch(() => {})
}

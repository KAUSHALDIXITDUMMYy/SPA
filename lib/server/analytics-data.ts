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

export async function getAdminAnalytics(
  limitCount = 100,
  adminViewer?: { role?: string; email?: string; tenant?: UserTenant },
) {
  const db = await getAdminDb()
  const analyticsSnap = await db
    .collection("streamAnalytics")
    .orderBy("timestamp", "desc")
    .limit(limitCount)
    .get()
  let analytics = analyticsSnap.docs.map(mapDoc)

  const activeSnap = await db.collection("activeViewers").where("isActive", "==", true).get()
  let activeViewers = activeSnap.docs.map(mapDoc)

  const streamsSnap = await db.collection("streamSessions").where("isActive", "==", true).get()
  const activeStreams = streamsSnap.docs.map(mapDoc)

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

  const activeSnap = await db.collection("activeViewers").where("publisherId", "==", publisherId).get()
  const currentViewers = activeSnap.docs.map(mapDoc)

  const streamsSnap = await db.collection("streamSessions").where("publisherId", "==", publisherId).get()
  const streamSessions = streamsSnap.docs.map(mapDoc)

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
    .get()
  return { analytics: snap.docs.map(mapDoc) }
}

export async function cleanupOldAnalytics(daysToKeep = 30) {
  const db = await getAdminDb()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - daysToKeep)
  const snap = await db.collection("streamAnalytics").where("timestamp", "<", cutoff).get()
  const batch = db.batch()
  snap.docs.forEach((d: any) => batch.delete(d.ref))
  if (snap.size > 0) await batch.commit()
  return { success: true, deletedCount: snap.size }
}

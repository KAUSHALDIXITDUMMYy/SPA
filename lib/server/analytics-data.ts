/**
 * Server-only analytics operations (Firebase Admin SDK). Mirrors the logic that used
 * to run in the browser via lib/analytics.ts, so the client never touches Firestore.
 */

import { getAdminDb } from "@/lib/firebase-admin"
import { resolveUserTenant, type UserTenant } from "@/lib/tenant"
import {
  buildViewerDeviceKey,
  deviceDisplayLabel,
  type RequestContext,
} from "@/lib/server/request-context"

/** A viewer is considered gone if no heartbeat (or token renewal) landed in this window.
 *  Sized for mobile clients that mint a token but cannot heartbeat (background/OS kill).
 *  Explicit leave still clears presence immediately. */
export const HEARTBEAT_STALE_MS = 30 * 60 * 1000

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
  for (const key of ["timestamp", "joinedAt", "lastSeen", "createdAt", "endedAt", "heartbeatExpiresAt"]) {
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
  /** When set on leave, only that device row is marked inactive. */
  deviceKey?: string
}

export async function trackSubscriberActivity(data: TrackInput) {
  const db = await getAdminDb()
  const { location, ...activityRest } = data
  const analyticsData: Record<string, unknown> = { ...activityRest, timestamp: new Date() }
  if (analyticsData.duration === undefined) delete analyticsData.duration
  const activeViewers = db.collection("activeViewers")

  if (data.action === "join") {
    // Device-aware join is owned by recordViewerPresence (token mint). This path
    // only refreshes lastSeen for matching rows and must NOT collapse devices.
    const snap = await activeViewers
      .where("streamSessionId", "==", data.streamSessionId)
      .where("subscriberId", "==", data.subscriberId)
      .where("isActive", "==", true)
      .get()

    const tenantFields =
      data.subscriberTenant !== undefined ? { subscriberTenant: data.subscriberTenant } : {}
    const now = new Date()
    if (snap.empty) {
      await activeViewers.add({
        streamSessionId: data.streamSessionId,
        subscriberId: data.subscriberId,
        publisherId: data.publisherId,
        isActive: true,
        joinedAt: now,
        lastSeen: now,
        subscriberName: data.subscriberName,
        publisherName: data.publisherName,
        deviceKey: "legacy:unknown",
        deviceLabel: "Unknown device",
        ...tenantFields,
        ...(location ? { location } : {}),
      })
    } else {
      await Promise.all(
        snap.docs.map((d: any) =>
          d.ref.update({
            lastSeen: now,
            subscriberName: data.subscriberName,
            publisherName: data.publisherName,
            ...tenantFields,
            ...(location ? { location } : {}),
          }),
        ),
      )
    }
  } else if (data.action === "leave") {
    const snap = await activeViewers
      .where("streamSessionId", "==", data.streamSessionId)
      .where("subscriberId", "==", data.subscriberId)
      .where("isActive", "==", true)
      .get()
    const now = new Date()
    const deviceKey = data.deviceKey
    let targets = snap.docs
    if (deviceKey) {
      const matched = snap.docs.filter((d: any) => String(d.data()?.deviceKey || "") === deviceKey)
      if (matched.length) targets = matched
    } else if (snap.docs.length > 1) {
      // Don't wipe every phone when leave has no device id — only legacy rows.
      targets = snap.docs.filter((d: any) => {
        const key = String(d.data()?.deviceKey || "")
        return !key || key.startsWith("legacy:")
      })
    }
    await Promise.all(targets.map((d: any) => d.ref.update({ isActive: false, lastSeen: now })))
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

  const activeSessionIds = activeStreams.map((s: any) => s.id)
  // Lazy analytics-only reaper: mark heartbeat-expired rows inactive BEFORE we read.
  // This keeps "watching now" accurate without a cron. It never affects Agora audio.
  await reapStaleViewers(db, activeSessionIds)

  // Scope the viewer read to active sessions only — never scan the full collection.
  let activeViewers = await readActiveViewersForSessions(db, activeSessionIds)

  // Enrich each viewer row with computed analytics flags + watch seconds.
  const now = Date.now()
  const { isOwnHost } = await import("@/lib/server/api-origin")
  activeViewers = activeViewers.map((v: any) => {
    const joinedAtMs = v.joinedAt ? new Date(v.joinedAt).getTime() : now
    const lastSeenMs = v.lastSeen ? new Date(v.lastSeen).getTime() : now
    const hbExpMs = v.heartbeatExpiresAt ? new Date(v.heartbeatExpiresAt).getTime() : 0
    const staleHeartbeat = hbExpMs > 0 && hbExpMs < now
    return {
      ...v,
      watchSeconds: Math.max(0, Math.floor((lastSeenMs - joinedAtMs) / 1000)),
      concurrentSession: v.concurrentSession === true,
      multiDevice: v.multiDevice === true,
      deviceLabel:
        v.deviceLabel ||
        deviceDisplayLabel(v.deviceClass || "unknown", v.userAgent || null),
      foreignOrigin: v.origin ? !isOwnHost(v.origin) : false,
      staleHeartbeat,
    }
  })

  if (adminViewer?.role === "admin") {
    const scope = resolveUserTenant(adminViewer)
    const matchTenant = (row: { subscriberTenant?: string }) => {
      // Missing tenant → treat as default (token path sometimes omitted it).
      const t = row.subscriberTenant === "kevionics" ? "kevionics" : "default"
      return t === scope
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

// ── Phase 1+2: server-side presence, billing ledger, heartbeat, usage ──────────
//
// These run at Agora-token-mint time (presence + ledger) and on client heartbeat.
// They NEVER affect audio: a missing heartbeat only marks the analytics row stale;
// it does not revoke the token or cut the stream.

export interface PresenceInput {
  streamSessionId: string
  subscriberId: string
  subscriberName: string
  publisherId: string
  publisherName: string
  subscriberTenant?: string
  /** Server-captured connection context (IP/device/origin/geo). */
  context: RequestContext
  /** Firebase Auth single-session id from users/{uid}.sessionId. */
  sessionId?: string | null
  roomId?: string
}

/**
 * Record (or refresh) a viewer's presence at token-mint time. Server-authoritative:
 * IP/device/origin/geo come from `context`, so web and mobile are equally accurate.
 *
 * One activeViewers row PER DEVICE (deviceKey). Same subscriber on mobile + Windows
 * (or two phones) keeps multiple watching rows instead of collapsing to one.
 *
 * Also flags concurrent streams: if the same subscriber already has an active row on
 * a DIFFERENT streamSessionId, both rows get `concurrentSession: true`. This is
 * INFORMATIONAL ONLY — it never affects the Agora token or the audio stream.
 */
export async function recordViewerPresence(input: PresenceInput): Promise<{
  concurrentSession: boolean
  /** True when this mint created a new row or reactivated an inactive one (billable join). */
  isNewOrReactivated: boolean
}> {
  const db = await getAdminDb()
  const now = new Date()
  const heartbeatExpiresAt = new Date(now.getTime() + HEARTBEAT_STALE_MS)
  const activeViewers = db.collection("activeViewers")

  const ctx = input.context
  const deviceKey = buildViewerDeviceKey(ctx)
  const deviceLabel = deviceDisplayLabel(ctx.deviceClass, ctx.userAgent)
  const ctxFields = {
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    deviceClass: ctx.deviceClass,
    deviceKey,
    deviceLabel,
    viewerDeviceId: ctx.viewerDeviceId ?? null,
    origin: ctx.origin,
    geo: ctx.geo ?? null,
  }

  // All rows for this subscriber on this stream (may include multiple devices).
  const sameSessionSnap = await activeViewers
    .where("streamSessionId", "==", input.streamSessionId)
    .where("subscriberId", "==", input.subscriberId)
    .get()

  // Rows for this subscriber on a DIFFERENT active session → concurrent flag source.
  const allSubscriberSnap = await activeViewers
    .where("subscriberId", "==", input.subscriberId)
    .where("isActive", "==", true)
    .get()

  let concurrentSession = false
  const otherActiveDocs: any[] = []
  allSubscriberSnap.forEach((d: any) => {
    const data = d.data()
    if (data.streamSessionId !== input.streamSessionId && data.isActive !== false) {
      concurrentSession = true
      otherActiveDocs.push(d)
    }
  })

  const tenantFields =
    input.subscriberTenant !== undefined ? { subscriberTenant: input.subscriberTenant } : {}

  let isNewOrReactivated = false

  const matchDoc =
    sameSessionSnap.docs.find((d: any) => String(d.data()?.deviceKey || "") === deviceKey) ||
    // Migrate a single legacy row (no deviceKey) onto this device once.
    (sameSessionSnap.docs.length === 1 && !sameSessionSnap.docs[0].data()?.deviceKey
      ? sameSessionSnap.docs[0]
      : undefined)

  try {
    if (!matchDoc) {
      isNewOrReactivated = true
      await activeViewers.add({
        streamSessionId: input.streamSessionId,
        subscriberId: input.subscriberId,
        isActive: true,
        joinedAt: now,
        lastSeen: now,
        heartbeatExpiresAt,
        subscriberName: input.subscriberName,
        publisherName: input.publisherName,
        publisherId: input.publisherId,
        roomId: input.roomId ?? null,
        sessionId: input.sessionId ?? null,
        concurrentSession,
        ...tenantFields,
        ...ctxFields,
      })
    } else {
      const wasActive = matchDoc.data()?.isActive === true
      isNewOrReactivated = !wasActive
      const update: Record<string, unknown> = {
        isActive: true,
        lastSeen: now,
        heartbeatExpiresAt,
        subscriberName: input.subscriberName,
        publisherName: input.publisherName,
        publisherId: input.publisherId,
        roomId: input.roomId ?? null,
        sessionId: input.sessionId ?? null,
        concurrentSession,
        ...tenantFields,
        ...ctxFields,
      }
      if (!wasActive) update.joinedAt = now
      await matchDoc.ref.update(update)
    }

    // Flag every active device row for this subscriber+stream when 2+ devices are live.
    const liveSnap = await activeViewers
      .where("streamSessionId", "==", input.streamSessionId)
      .where("subscriberId", "==", input.subscriberId)
      .where("isActive", "==", true)
      .get()
    if (liveSnap.size > 1) {
      await Promise.all(liveSnap.docs.map((d: any) => d.ref.update({ multiDevice: true })))
    }

    if (otherActiveDocs.length) {
      await Promise.all(
        otherActiveDocs.map((d: any) => d.ref.update({ concurrentSession: true, lastSeen: now })),
      )
    }
  } catch {
    // best-effort: never fail the token mint on analytics
  }

  return { concurrentSession, isNewOrReactivated }
}

/**
 * Append one immutable row to the billing ledger per successful token mint.
 * One doc == "this subscriber accessed this stream once". Authoritative for billing.
 */
export async function appendStreamUsage(input: PresenceInput): Promise<void> {
  const db = await getAdminDb()
  const ctx = input.context
  try {
    await db.collection("streamUsage").add({
      subscriberId: input.subscriberId,
      subscriberName: input.subscriberName,
      subscriberTenant: input.subscriberTenant ?? null,
      streamSessionId: input.streamSessionId,
      publisherId: input.publisherId,
      publisherName: input.publisherName,
      roomId: input.roomId ?? null,
      sessionId: input.sessionId ?? null,
      joinedAt: new Date(),
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      deviceClass: ctx.deviceClass,
      origin: ctx.origin,
      geo: ctx.geo ?? null,
    })
  } catch {
    // best-effort
  }
}

/**
 * Refresh a viewer's lastSeen/heartbeat on the matching device row. Analytics-only —
 * never touches the Agora token. Also reactivates a row that was reaped as stale.
 */
export async function recordViewerHeartbeat(input: {
  streamSessionId: string
  subscriberId: string
  context?: RequestContext
}): Promise<void> {
  const db = await getAdminDb()
  const now = new Date()
  const heartbeatExpiresAt = new Date(now.getTime() + HEARTBEAT_STALE_MS)
  try {
    const snap = await db
      .collection("activeViewers")
      .where("streamSessionId", "==", input.streamSessionId)
      .where("subscriberId", "==", input.subscriberId)
      .get()
    if (snap.empty) return

    const deviceKey = input.context ? buildViewerDeviceKey(input.context) : null
    const targets = deviceKey
      ? snap.docs.filter((d: any) => String(d.data()?.deviceKey || "") === deviceKey)
      : snap.docs.filter((d: any) => d.data()?.isActive !== false)

    const docs = targets.length ? targets : snap.docs.slice(0, 1)
    const update: Record<string, unknown> = {
      isActive: true,
      lastSeen: now,
      heartbeatExpiresAt,
    }
    if (input.context) {
      update.ip = input.context.ip
      update.userAgent = input.context.userAgent
      update.deviceClass = input.context.deviceClass
      update.deviceKey = deviceKey
      update.deviceLabel = deviceDisplayLabel(input.context.deviceClass, input.context.userAgent)
      update.viewerDeviceId = input.context.viewerDeviceId ?? null
      update.origin = input.context.origin
      if (input.context.geo) update.geo = input.context.geo
    }
    await Promise.all(docs.map((d: any) => d.ref.update(update)))
  } catch {
    // best-effort
  }
}

/**
 * Mark activeViewers rows whose heartbeat has expired as inactive. Analytics-only:
 * the subscriber's Agora token is unaffected — they may still be listening; we just
 * stop counting them as "watching now" so the dashboard stays accurate. Called lazily
 * from getAdminAnalytics so no extra cron is needed.
 */
async function reapStaleViewers(
  db: Awaited<ReturnType<typeof getAdminDb>>,
  sessionIds: string[],
): Promise<void> {
  if (sessionIds.length === 0) return
  const now = new Date()
  const chunks: string[][] = []
  for (let i = 0; i < sessionIds.length; i += 30) {
    chunks.push(sessionIds.slice(i, i + 30))
  }
  try {
    await Promise.all(
      chunks.map(async (chunk) => {
        const snap = await db
          .collection("activeViewers")
          .where("streamSessionId", "in", chunk)
          .where("isActive", "==", true)
          .get()
        const stale = snap.docs.filter((d: any) => {
          const data = d.data()
          if (!data.heartbeatExpiresAt) {
            // Legacy rows (pre-heartbeat): fall back to lastSeen older than the stale window.
            const last = data.lastSeen?.toDate?.() ?? null
            return last ? now.getTime() - last.getTime() > HEARTBEAT_STALE_MS : false
          }
          const exp = data.heartbeatExpiresAt.toDate?.() ?? new Date(data.heartbeatExpiresAt)
          return exp.getTime() < now.getTime()
        })
        if (stale.length === 0) return
        const batch = db.batch()
        stale.forEach((d: any) =>
          batch.update(d.ref, { isActive: false, lastSeen: now, staleReason: "heartbeat_timeout" }),
        )
        await batch.commit()
      }),
    )
  } catch {
    // best-effort
  }
}

export interface SubscriberUsageRow {
  subscriberId: string
  name: string
  email: string | null
  tenant: string | null
  streamJoins: number
  uniqueStreams: number
  publishers: string[]
  firstSeen: string | null
  lastSeen: string | null
  recentIps: string[]
  recentDevices: string[]
}

/**
 * Per-subscriber usage rollup from the streamUsage ledger over a window.
 * Used by the admin "Usage & Billing" tab (usage-report-only model).
 * Scoped by admin tenant: SportsMagician (default) never sees @kevionics users.
 */
export async function getSubscriberUsage(
  windowDays = 30,
  adminViewer?: { role?: string; email?: string; tenant?: UserTenant },
): Promise<SubscriberUsageRow[]> {
  const db = await getAdminDb()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - windowDays)

  let snap
  try {
    snap = await db.collection("streamUsage").where("joinedAt", ">=", cutoff).get()
  } catch {
    // Missing index / other error — return empty rather than crash the dashboard.
    return []
  }

  const bySubscriber = new Map<
    string,
    SubscriberUsageRow & {
      _ipSet: Set<string>
      _devSet: Set<string>
      _pubSet: Set<string>
      _ssnSet: Set<string>
    }
  >()
  snap.forEach((d: any) => {
    const data = d.data()
    const id = String(data.subscriberId || "")
    if (!id) return
    let row = bySubscriber.get(id)
    if (!row) {
      row = {
        subscriberId: id,
        name: String(data.subscriberName || "Unknown"),
        email: null,
        tenant: data.subscriberTenant ?? null,
        streamJoins: 0,
        uniqueStreams: 0,
        publishers: [],
        firstSeen: null,
        lastSeen: null,
        recentIps: [],
        recentDevices: [],
        _ipSet: new Set<string>(),
        _devSet: new Set<string>(),
        _pubSet: new Set<string>(),
        _ssnSet: new Set<string>(),
      }
      bySubscriber.set(id, row)
    }
    row.streamJoins += 1
    const pubLabel = String(data.publisherName || data.publisherId || "").trim()
    if (pubLabel) row._pubSet.add(pubLabel)
    if (data.streamSessionId) row._ssnSet.add(String(data.streamSessionId))
    if (data.ip && data.ip !== "unknown") row._ipSet.add(String(data.ip))
    if (data.deviceClass) row._devSet.add(String(data.deviceClass))
    const ts = toIso(data.joinedAt)
    if (ts) {
      if (!row.firstSeen || ts < row.firstSeen) row.firstSeen = ts
      if (!row.lastSeen || ts > row.lastSeen) row.lastSeen = ts
    }
  })

  // Backfill email + authoritative tenant from users/{uid}.
  let userDocs: any[] = []
  try {
    const ids = Array.from(bySubscriber.keys())
    if (ids.length) {
      const chunks: string[][] = []
      for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30))
      const results = await Promise.all(
        chunks.map((chunk) => db.collection("users").where("__name__", "in", chunk).get()),
      )
      userDocs = results.flatMap((s) => s.docs)
    }
  } catch {
    // ignore — email stays null
  }
  for (const doc of userDocs) {
    const data = doc.data() || {}
    const row = bySubscriber.get(doc.id)
    if (!row) continue
    if (data.email) row.email = String(data.email)
    row.tenant = resolveUserTenant({
      email: data.email || row.email || undefined,
      tenant: data.tenant,
    })
  }

  // Rows with no user doc still resolve tenant from ledger + any known email.
  for (const row of bySubscriber.values()) {
    row.tenant = resolveUserTenant({
      email: row.email || undefined,
      tenant: (row.tenant as UserTenant | undefined) || undefined,
    })
  }

  const adminScope =
    adminViewer?.role === "admin" ? resolveUserTenant(adminViewer) : ("default" as UserTenant)

  return Array.from(bySubscriber.values())
    .filter((r) => {
      const t = resolveUserTenant({
        email: r.email || undefined,
        tenant: (r.tenant as UserTenant | undefined) || undefined,
      })
      // SportsMagician admins must never see kevionics / @kevionics.com users.
      if (adminScope === "kevionics") return t === "kevionics"
      return t !== "kevionics"
    })
    .map((r) => {
      const { _ipSet, _devSet, _pubSet, _ssnSet, ...rest } = r
      return {
        ...rest,
        uniqueStreams: _ssnSet.size,
        publishers: Array.from(_pubSet).filter(Boolean),
        recentIps: Array.from(_ipSet),
        recentDevices: Array.from(_devSet),
      }
    })
    .sort((a, b) => b.streamJoins - a.streamJoins)
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

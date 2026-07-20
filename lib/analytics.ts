import { fetchWithAuth } from "@/lib/client/authenticated-fetch"
import { startPoll } from "@/lib/client/poll"
import type { ViewerLocation } from "./viewer-location"
import type { UserTenant } from "./tenant"

export type { ViewerLocation } from "./viewer-location"

const ENDPOINT = "/api/analytics"

function toDate(value: unknown): Date {
  if (value instanceof Date) return value
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate()
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return new Date()
}

export interface StreamAnalytics {
  id?: string
  streamSessionId: string
  subscriberId: string
  subscriberName: string
  publisherId: string
  publisherName: string
  action: "join" | "leave" | "viewing"
  timestamp: Date
  duration?: number
}

export interface StreamViewer {
  id?: string
  streamSessionId: string
  subscriberId: string
  subscriberName: string
  publisherId: string
  publisherName: string
  joinedAt: Date
  lastSeen: Date
  isActive: boolean
  subscriberTenant?: UserTenant
  location?: ViewerLocation | null
}

export interface AnalyticsSummary {
  totalAnalytics: number
  activeViewersCount: number
  activeStreamsCount: number
  uniqueViewers: number
  averageViewDuration: number
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

function toAnalytics(o: any): StreamAnalytics {
  return { ...o, timestamp: toDate(o.timestamp) }
}

function toViewer(o: any): StreamViewer {
  return {
    id: o.id,
    streamSessionId: o.streamSessionId,
    subscriberId: o.subscriberId,
    subscriberName: o.subscriberName || "Unknown",
    publisherId: o.publisherId,
    publisherName: o.publisherName || "Unknown",
    joinedAt: toDate(o.joinedAt),
    lastSeen: toDate(o.lastSeen),
    isActive: o.isActive !== false,
    subscriberTenant: o.subscriberTenant as UserTenant | undefined,
    location: o.location as ViewerLocation | null | undefined,
  }
}

export const trackSubscriberActivity = async (data: {
  streamSessionId: string
  subscriberId: string
  subscriberName: string
  publisherId: string
  publisherName: string
  action: "join" | "leave" | "viewing" | "heartbeat"
  duration?: number
  subscriberTenant?: UserTenant
  location?: ViewerLocation | null
}) => {
  try {
    const res = await fetchWithAuth(ENDPOINT, { method: "POST", body: JSON.stringify(data) })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { success: false, error: json.error || "Failed to track activity" }
    return { success: true, id: json.id }
  } catch (error: any) {
    console.error("Error tracking analytics:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Refresh this viewer's presence row. Analytics-only — the server uses this to keep
 * "watching now" accurate and to detect stale clients. It never affects the Agora
 * token, so a transient failure here is swallowed and audio is never impacted.
 */
export const heartbeatViewerPresence = async (streamSessionId: string, subscriberId: string) => {
  try {
    await fetchWithAuth(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ streamSessionId, subscriberId, action: "heartbeat" }),
    })
  } catch {
    // intentionally swallowed — heartbeat is best-effort
  }
}

export const getAdminAnalytics = async (limitCount: number = 100) => {
  try {
    const res = await fetchWithAuth(`${ENDPOINT}?type=admin&limit=${limitCount}`, { method: "GET" })
    if (!res.ok) throw new Error(`Request failed: ${res.status}`)
    const json = await res.json()
    return {
      analytics: (json.analytics || []).map(toAnalytics),
      activeViewers: (json.activeViewers || []).map(toViewer),
      activeStreams: json.activeStreams || [],
      summary: json.summary as AnalyticsSummary | null,
    }
  } catch (error: any) {
    console.error("Error fetching admin analytics:", error)
    return { analytics: [], activeViewers: [], activeStreams: [], summary: null }
  }
}

export const getPublisherAnalytics = async (publisherId: string, limitCount: number = 100) => {
  try {
    const res = await fetchWithAuth(
      `${ENDPOINT}?type=publisher&publisherId=${encodeURIComponent(publisherId)}&limit=${limitCount}`,
      { method: "GET" },
    )
    if (!res.ok) throw new Error(`Request failed: ${res.status}`)
    const json = await res.json()
    return {
      analytics: (json.analytics || []).map(toAnalytics),
      currentViewers: (json.currentViewers || []).map(toViewer),
      streamSessions: json.streamSessions || [],
      summary: json.summary || null,
    }
  } catch (error: any) {
    console.error("Error fetching publisher analytics:", error)
    return { analytics: [], currentViewers: [], streamSessions: [], summary: null }
  }
}

export const getStreamAnalytics = async (streamSessionId: string) => {
  try {
    const res = await fetchWithAuth(
      `${ENDPOINT}?type=stream&streamSessionId=${encodeURIComponent(streamSessionId)}`,
      { method: "GET" },
    )
    if (!res.ok) throw new Error(`Request failed: ${res.status}`)
    const json = await res.json()
    return { analytics: (json.analytics || []).map(toAnalytics) }
  } catch (error: any) {
    console.error("Error fetching stream analytics:", error)
    return { analytics: [] }
  }
}

export const getSubscriberUsage = async (windowDays = 30): Promise<SubscriberUsageRow[]> => {
  try {
    const res = await fetchWithAuth(`${ENDPOINT}?type=usage&windowDays=${windowDays}`, {
      method: "GET",
    })
    if (!res.ok) throw new Error(`Request failed: ${res.status}`)
    const json = await res.json()
    return (json.usage || []) as SubscriberUsageRow[]
  } catch (error: any) {
    console.error("Error fetching subscriber usage:", error)
    return []
  }
}

/**
 * Live publisher analytics. Firestore realtime is replaced with short polling against
 * the backend; the returned function stops polling (same Unsubscribe shape).
 */
export const subscribeToAnalytics = (
  publisherId: string,
  callback: (data: { analytics: StreamAnalytics[]; currentViewers: StreamViewer[] }) => void,
) => {
  let active = true
  const stop = startPoll(async () => {
    const { analytics, currentViewers } = await getPublisherAnalytics(publisherId, 50)
    if (active) callback({ analytics, currentViewers })
  }, 15000)
  return () => {
    active = false
    stop()
  }
}

export const cleanupOldAnalytics = async (daysToKeep: number = 30) => {
  try {
    const res = await fetchWithAuth(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ action: "cleanup", daysToKeep }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { success: false, error: json.error || "Cleanup failed" }
    return { success: true, deletedCount: json.deletedCount }
  } catch (error: any) {
    console.error("Error cleaning up analytics:", error)
    return { success: false, error: error.message }
  }
}

import { fetchWithAuth } from "@/lib/client/authenticated-fetch"
import type { StreamPermission } from "./admin"
import type { StreamSession } from "./streaming"

const ENDPOINT = "/api/subscriber"

/** Earliest time first (ascending). Missing dates sort last. */
export function streamSessionCreatedAtMs(session: StreamSession | undefined): number {
  if (!session?.createdAt) return Number.MAX_SAFE_INTEGER
  const c = session.createdAt as Date | { toDate?: () => Date } | string | number
  if (c instanceof Date) return c.getTime()
  if (typeof (c as { toDate?: () => Date }).toDate === "function") {
    return (c as { toDate: () => Date }).toDate().getTime()
  }
  const d = new Date(c as string | number)
  return Number.isNaN(d.getTime()) ? Number.MAX_SAFE_INTEGER : d.getTime()
}

/** Sort live / ad-hoc streams by session start time (createdAt), then publisher name. */
export function compareSubscriberPermissionsByStreamStart(a: SubscriberPermission, b: SubscriberPermission): number {
  const ta = streamSessionCreatedAtMs(a.streamSession)
  const tb = streamSessionCreatedAtMs(b.streamSession)
  if (ta !== tb) return ta - tb
  return (a.publisherName || "").localeCompare(b.publisherName || "")
}

export interface SubscriberPermission extends StreamPermission {
  publisherName: string
  streamSession?: StreamSession
}

function normalizeSession(s: any): StreamSession | undefined {
  if (!s) return undefined
  return {
    ...s,
    createdAt: s.createdAt ? new Date(s.createdAt) : new Date(),
    endedAt: s.endedAt ? new Date(s.endedAt) : undefined,
  } as StreamSession
}

function normalizePerm(p: any): SubscriberPermission {
  return { ...p, streamSession: normalizeSession(p.streamSession) }
}

async function get(params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetchWithAuth(`${ENDPOINT}?${qs}`, { method: "GET" })
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return res.json()
}

export const getSubscriberPermissions = async (subscriberId: string): Promise<SubscriberPermission[]> => {
  try {
    const json = await get({ type: "permissions", subscriberId })
    return (json.permissions || []).map(normalizePerm)
  } catch (error) {
    console.error("Error fetching subscriber permissions:", error)
    return []
  }
}

export const getAvailableStreams = async (subscriberId: string): Promise<SubscriberPermission[]> => {
  const permissions = await getSubscriberPermissions(subscriberId)
  return permissions.filter((permission) => permission.streamSession?.isActive)
}

/** Admin-scheduled Agora room: linked call id and/or `sched-…` room IDs from schedule imports. */
export function streamSessionIsScheduledRoom(session: StreamSession | undefined): boolean {
  if (!session) return false
  if (session.scheduledCallId) return true
  const rid = session.roomId?.trim() ?? ""
  return rid.startsWith("sched-")
}

/** Split active streams: publisher-started (ad-hoc) vs admin-scheduled rooms. */
export async function getAvailableStreamsSplit(subscriberId: string): Promise<{
  adHoc: SubscriberPermission[]
  scheduled: SubscriberPermission[]
}> {
  const all = await getAvailableStreams(subscriberId)
  return {
    adHoc: all.filter((p) => !streamSessionIsScheduledRoom(p.streamSession)),
    scheduled: all.filter((p) => streamSessionIsScheduledRoom(p.streamSession)),
  }
}

/** Publisher IDs this subscriber may hear. */
export async function getAccessiblePublisherIdsForSubscriber(subscriberId: string): Promise<Set<string>> {
  try {
    const json = await get({ type: "accessiblePublishers", subscriberId })
    return new Set<string>(json.publisherIds || [])
  } catch (e) {
    console.error("getAccessiblePublisherIdsForSubscriber:", e)
    return new Set<string>()
  }
}

/** True if the subscriber has at least one active publisher or stream assignment. */
export const subscriberHasAnyAssignment = async (subscriberId: string): Promise<boolean> => {
  try {
    const json = await get({ type: "hasAssignment", subscriberId })
    return Boolean(json.hasAssignment)
  } catch (error) {
    console.error("subscriberHasAnyAssignment:", error)
    return false
  }
}

/**
 * Fires whenever eligibility changes. Firestore realtime replaced with short polling.
 * Eligible = at least one active streamPermission OR streamAssignment for this subscriber.
 */
export const subscribeSubscriberAssignmentEligibility = (
  subscriberId: string,
  onEligible: (eligible: boolean) => void,
): (() => void) => {
  let active = true
  const poll = async () => {
    const eligible = await subscriberHasAnyAssignment(subscriberId)
    if (active) onEligible(eligible)
  }
  void poll()
  const interval = setInterval(poll, 8000)
  return () => {
    active = false
    clearInterval(interval)
  }
}

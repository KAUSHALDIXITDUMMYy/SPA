import { fetchWithAuth } from "@/lib/client/authenticated-fetch"
import { startPoll } from "@/lib/client/poll"

const ENDPOINT = "/api/scheduled-calls"

/** Local calendar day (publisher timezone) */
export function getLocalDateKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export interface ScheduledCall {
  id: string
  dateKey: string
  title: string
  description?: string
  startsAt: Date
  endsAt: Date
  roomId: string
  publisherId: string
  publisherName: string
  sport?: string
  createdAt: Date
  updatedAt: Date
}

function parseDoc(id: string, data: Record<string, unknown>): ScheduledCall {
  const toDate = (v: unknown) =>
    (v as { toDate?: () => Date })?.toDate?.() ?? (v ? new Date(v as string) : new Date())
  return {
    id,
    dateKey: String(data.dateKey ?? ""),
    title: String(data.title ?? ""),
    description: data.description ? String(data.description) : undefined,
    startsAt: toDate(data.startsAt),
    endsAt: toDate(data.endsAt),
    roomId: String(data.roomId ?? ""),
    publisherId: String(data.publisherId ?? ""),
    publisherName: String(data.publisherName ?? ""),
    sport: data.sport ? String(data.sport) : undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  }
}

export function generateScheduledRoomId(dateKey: string): string {
  const rand = Math.random().toString(36).substring(2, 10)
  return `sched-${dateKey}-${rand}`
}

async function post(action: string, payload: Record<string, any>) {
  try {
    const res = await fetchWithAuth(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ action, payload }),
    })
    const json = await res.json().catch(() => ({}))
    return { ok: res.ok, json }
  } catch (e: unknown) {
    return { ok: false, json: { error: e instanceof Error ? e.message : "Request failed" } }
  }
}

export async function createScheduledCall(input: {
  dateKey: string
  title: string
  description?: string
  startsAt: Date
  endsAt: Date
  publisherId: string
  publisherName: string
  sport?: string
}): Promise<{ success: boolean; id?: string; error?: string }> {
  if (input.endsAt.getTime() <= input.startsAt.getTime()) {
    return { success: false, error: "End time must be after start time." }
  }
  const { ok, json } = await post("createScheduledCall", {
    ...input,
    startsAt: input.startsAt.toISOString(),
    endsAt: input.endsAt.toISOString(),
  })
  return ok ? { success: true, id: json.id } : { success: false, error: json.error }
}

export async function deleteScheduledCall(callId: string): Promise<{ success: boolean; error?: string }> {
  const { ok, json } = await post("deleteScheduledCall", { callId })
  return ok ? { success: true } : { success: false, error: json.error }
}

export async function updateScheduledCall(
  callId: string,
  patch: Partial<{
    title: string
    description: string
    startsAt: Date
    endsAt: Date
    publisherId: string
    publisherName: string
    sport: string
  }>,
): Promise<{ success: boolean; error?: string }> {
  const serialized: Record<string, any> = { ...patch }
  if (patch.startsAt) serialized.startsAt = patch.startsAt.toISOString()
  if (patch.endsAt) serialized.endsAt = patch.endsAt.toISOString()
  const { ok, json } = await post("updateScheduledCall", { callId, patch: serialized })
  return ok ? { success: true } : { success: false, error: json.error }
}

export async function getScheduledCallById(callId: string): Promise<ScheduledCall | null> {
  try {
    const res = await fetchWithAuth(`${ENDPOINT}?id=${encodeURIComponent(callId)}`, { method: "GET" })
    if (!res.ok) return null
    const json = await res.json()
    return json.call ? parseDoc(json.call.id, json.call) : null
  } catch {
    return null
  }
}

export async function getScheduledCallsForDate(dateKey: string): Promise<ScheduledCall[]> {
  try {
    const res = await fetchWithAuth(`${ENDPOINT}?dateKey=${encodeURIComponent(dateKey)}`, {
      method: "GET",
    })
    if (!res.ok) return []
    const json = await res.json()
    const list = (json.calls || []).map((c: any) => parseDoc(c.id, c))
    return list.sort((a: ScheduledCall, b: ScheduledCall) => a.startsAt.getTime() - b.startsAt.getTime())
  } catch {
    return []
  }
}

/** Live updates for a day's calls. Firestore realtime replaced with short polling. */
export function subscribeScheduledCallsForDate(
  dateKey: string,
  callback: (calls: ScheduledCall[]) => void,
): () => void {
  let active = true
  const stop = startPoll(async () => {
    const list = await getScheduledCallsForDate(dateKey)
    if (active) callback(list)
  }, 10000)
  return () => {
    active = false
    stop()
  }
}

/** Whether "now" falls in the scheduled window (inclusive bounds). */
export function isCallInTimeWindow(call: ScheduledCall, now = new Date()): boolean {
  return now.getTime() >= call.startsAt.getTime() && now.getTime() <= call.endsAt.getTime()
}

export function isScheduledCallTransmitting(
  call: ScheduledCall,
  activeSessions: { roomId: string; publisherId: string; isActive: boolean; awaitingBroadcast?: boolean }[],
): boolean {
  return activeSessions.some(
    (s) =>
      s.isActive &&
      s.awaitingBroadcast !== true &&
      s.roomId === call.roomId &&
      s.publisherId === call.publisherId,
  )
}

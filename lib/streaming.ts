import { fetchWithAuth } from "@/lib/client/authenticated-fetch"

const ENDPOINT = "/api/streaming"

export interface StreamSession {
  id?: string
  publisherId: string
  publisherName: string
  roomId: string
  isActive: boolean
  createdAt: Date
  endedAt?: Date
  title?: string
  description?: string
  /** US_STREAM_SPORTS value (e.g. NFL, NBA, UFC). */
  sport?: string
  /** Linked row in `scheduledCalls` when broadcast uses an admin-assigned room. */
  scheduledCallId?: string
  /** When true, admin created the Firestore room but the publisher has not started Agora yet. */
  awaitingBroadcast?: boolean
  gameName?: string
  league?: string
  match?: string
}

// ── Pure helpers (no database access) ────────────────────────────────────────
export function isAwaitingBroadcastSession(s: StreamSession): boolean {
  return Boolean(s.scheduledCallId) && s.awaitingBroadcast === true
}

export function pickPublisherRejoinStream(sessions: StreamSession[]): StreamSession | null {
  const candidates = sessions.filter((s) => s.isActive && !isAwaitingBroadcastSession(s))
  candidates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return candidates[0] ?? null
}

export const generateRoomId = (publisherId: string): string => {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `stream-${publisherId}-${timestamp}-${random}`
}

function normalizeStreamSession(id: string, data: Record<string, unknown>): StreamSession {
  const created = data.createdAt as { toDate?: () => Date } | undefined
  const ended = data.endedAt as { toDate?: () => Date } | undefined
  const createdAt = created?.toDate?.() ?? new Date(data.createdAt as string)
  const endedAt = ended?.toDate?.() ?? (data.endedAt ? new Date(data.endedAt as string) : undefined)
  return {
    id,
    publisherId: String(data.publisherId ?? ""),
    publisherName: String(data.publisherName ?? ""),
    roomId: String(data.roomId ?? ""),
    isActive: Boolean(data.isActive),
    createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
    endedAt: endedAt && !Number.isNaN(endedAt.getTime()) ? endedAt : undefined,
    title: data.title ? String(data.title) : undefined,
    description: data.description ? String(data.description) : undefined,
    sport: data.sport ? String(data.sport) : undefined,
    scheduledCallId: data.scheduledCallId ? String(data.scheduledCallId) : undefined,
    awaitingBroadcast: data.awaitingBroadcast === true,
    gameName: data.gameName ? String(data.gameName) : undefined,
    league: data.league ? String(data.league) : undefined,
    match: data.match ? String(data.match) : undefined,
  }
}

const sortByNewest = (streams: StreamSession[]) =>
  streams.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

/** Parse API/JSON stream rows into client StreamSession objects. */
export function parseStreamSessions(rows: unknown[]): StreamSession[] {
  return sortByNewest(
    rows.map((row) => {
      const s = row as Record<string, unknown> & { id: string }
      return normalizeStreamSession(s.id, s)
    }),
  )
}

// ── Backend helpers ───────────────────────────────────────────────────────────
async function post(action: string, payload: Record<string, any> = {}) {
  try {
    const res = await fetchWithAuth(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ action, payload }),
    })
    const json = await res.json().catch(() => ({}))
    return { ok: res.ok, json }
  } catch (error: any) {
    return { ok: false, json: { error: error?.message || "Request failed" } }
  }
}

async function getStreams(type: string, publisherId?: string): Promise<StreamSession[]> {
  try {
    const qs = new URLSearchParams({ type })
    if (publisherId) qs.set("publisherId", publisherId)
    const res = await fetchWithAuth(`${ENDPOINT}?${qs.toString()}`, { method: "GET" })
    if (!res.ok) return []
    const json = await res.json()
    return sortByNewest(
      (json.streams || []).map((s: any) => normalizeStreamSession(s.id, s)),
    )
  } catch (error) {
    console.error("Error fetching streams:", error)
    return []
  }
}

// ── Writes ────────────────────────────────────────────────────────────────────
export async function deactivatePublisherBroadcastSessions(
  publisherId: string,
  exceptSessionId?: string,
): Promise<void> {
  await post("deactivatePublisherBroadcastSessions", { publisherId, exceptSessionId })
}

export async function createScheduledPlaceholderSession(input: {
  scheduledCallId: string
  roomId: string
  publisherId: string
  publisherName: string
  title: string
  description?: string
  sport?: string
}): Promise<{ success: boolean; error?: string }> {
  const { ok, json } = await post("createScheduledPlaceholderSession", input)
  return ok ? { success: true } : { success: false, error: json.error }
}

export async function removeStreamSessionsForScheduledCall(scheduledCallId: string): Promise<void> {
  await post("removeStreamSessionsForScheduledCall", { scheduledCallId })
}

export async function resetScheduledSessionAfterBroadcast(
  sessionId: string,
): Promise<{ success: boolean; error?: string }> {
  const { ok, json } = await post("resetScheduledSessionAfterBroadcast", { sessionId })
  return ok ? { success: true } : { success: false, error: json.error }
}

export async function activateScheduledBroadcastSession(
  session: Omit<StreamSession, "id" | "createdAt"> & { scheduledCallId: string },
): Promise<{ success: boolean; id?: string; session?: StreamSession; error?: string }> {
  const { ok, json } = await post("activateScheduledBroadcastSession", { session })
  if (!ok) return { success: false, error: json.error }
  return {
    success: true,
    id: json.id,
    session: json.session ? normalizeStreamSession(json.session.id, json.session) : undefined,
  }
}

export const createStreamSession = async (session: Omit<StreamSession, "id" | "createdAt">) => {
  const { ok, json } = await post("createStreamSession", { session })
  if (!ok) return { success: false, error: json.error }
  return {
    success: true,
    id: json.id,
    session: json.session ? normalizeStreamSession(json.session.id, json.session) : undefined,
  }
}

export const endStreamSession = async (sessionId: string) => {
  const { ok, json } = await post("endStreamSession", { sessionId })
  return ok ? { success: true } : { success: false, error: json.error }
}

export async function updateStreamSessionPublisher(
  sessionId: string,
  publisherId: string,
  publisherName: string,
): Promise<{ success: boolean; error?: string }> {
  const { ok, json } = await post("updateStreamSessionPublisher", {
    sessionId,
    publisherId,
    publisherName,
  })
  return ok ? { success: true } : { success: false, error: json.error }
}

// ── Reads ──────────────────────────────────────────────────────────────────────
export const getActiveStreams = async (): Promise<StreamSession[]> => getStreams("active")

export const getPublisherStreams = async (publisherId: string): Promise<StreamSession[]> =>
  getStreams("publisher", publisherId)

export const getPublisherActiveStream = async (
  publisherId: string,
): Promise<StreamSession | null> => {
  const streams = await getPublisherStreams(publisherId)
  return pickPublisherRejoinStream(streams)
}

export const getAllStreams = async (): Promise<StreamSession[]> => getStreams("all")

// ── Live updates (Firestore realtime replaced with short polling) ───────────────
export function subscribeToActiveStreams(callback: (streams: StreamSession[]) => void): () => void {
  let active = true
  const poll = async () => {
    const streams = await getActiveStreams()
    if (active) callback(streams)
  }
  void poll()
  const interval = setInterval(poll, 5000)
  return () => {
    active = false
    clearInterval(interval)
  }
}

export function subscribeToPublisherActiveStream(
  publisherId: string,
  onActiveStream: (session: StreamSession | null) => void,
): () => void {
  let active = true
  const poll = async () => {
    const session = await getPublisherActiveStream(publisherId)
    if (active) onActiveStream(session)
  }
  void poll()
  const interval = setInterval(poll, 5000)
  return () => {
    active = false
    clearInterval(interval)
  }
}

import { db } from "./firebase"
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  query,
  where,
  getDocs,
  getDoc,
  onSnapshot,
  deleteField,
} from "firebase/firestore"

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

/** True when this session is a scheduled room waiting for the publisher to go live. */
export function isAwaitingBroadcastSession(s: StreamSession): boolean {
  return Boolean(s.scheduledCallId) && s.awaitingBroadcast === true
}

/** Publisher “rejoin” should target an actually broadcasting session, not placeholder rows. */
export function pickPublisherRejoinStream(sessions: StreamSession[]): StreamSession | null {
  const candidates = sessions.filter((s) => s.isActive && !isAwaitingBroadcastSession(s))
  candidates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return candidates[0] ?? null
}

/**
 * Ends ad-hoc or in-progress broadcasts for this publisher, but keeps other scheduled placeholders
 * (`awaitingBroadcast: true`) so multiple admin-created rooms can coexist.
 */
export async function deactivatePublisherBroadcastSessions(
  publisherId: string,
  exceptSessionId?: string,
): Promise<void> {
  const streamsRef = collection(db, "streamSessions")
  const activeForPublisherQuery = query(streamsRef, where("publisherId", "==", publisherId), where("isActive", "==", true))
  const activeSnapshot = await getDocs(activeForPublisherQuery)
  await Promise.all(
    activeSnapshot.docs.map(async (activeDoc) => {
      if (exceptSessionId && activeDoc.id === exceptSessionId) return
      const data = activeDoc.data() as Record<string, unknown>
      if (data.scheduledCallId && data.awaitingBroadcast === true) return
      try {
        await updateDoc(doc(db, "streamSessions", activeDoc.id), {
          isActive: false,
          endedAt: new Date(),
        })
      } catch {
        // best-effort; do not block
      }
    }),
  )
}

/** Firestore row created when admin adds a scheduled call so Live rooms + subscribers see the room immediately. */
export async function createScheduledPlaceholderSession(input: {
  scheduledCallId: string
  roomId: string
  publisherId: string
  publisherName: string
  title: string
  description?: string
  sport?: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    await addDoc(collection(db, "streamSessions"), {
      publisherId: input.publisherId,
      publisherName: input.publisherName,
      roomId: input.roomId,
      isActive: true,
      awaitingBroadcast: true,
      scheduledCallId: input.scheduledCallId,
      title: input.title,
      description: input.description?.trim() || "",
      sport: input.sport?.trim() || "",
      createdAt: new Date(),
    })
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to create room session" }
  }
}

/** Mark linked stream sessions inactive when a scheduled call is deleted. */
export async function removeStreamSessionsForScheduledCall(scheduledCallId: string): Promise<void> {
  const q = query(collection(db, "streamSessions"), where("scheduledCallId", "==", scheduledCallId))
  const snap = await getDocs(q)
  await Promise.all(
    snap.docs.map((d) =>
      updateDoc(d.ref, {
        isActive: false,
        awaitingBroadcast: true,
        endedAt: new Date(),
      }),
    ),
  )
}

/**
 * After the publisher stops broadcasting a scheduled room, return the row to “waiting” so the room
 * stays visible for subscribers/admin until the call is removed or they go live again.
 */
export async function resetScheduledSessionAfterBroadcast(sessionId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const sessionRef = doc(db, "streamSessions", sessionId)
    const snap = await getDoc(sessionRef)
    if (!snap.exists()) return { success: false, error: "Session not found" }
    const data = snap.data() as Record<string, unknown>
    if (data.scheduledCallId) {
      await updateDoc(sessionRef, {
        isActive: true,
        awaitingBroadcast: true,
        endedAt: deleteField(),
      })
      return { success: true }
    }
    return endStreamSession(sessionId)
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to reset session" }
  }
}

/**
 * Reuse the placeholder `streamSessions` row for this scheduled call when the publisher goes live.
 * Falls back to {@link createStreamSession} if no placeholder exists (legacy data).
 */
export async function activateScheduledBroadcastSession(
  session: Omit<StreamSession, "id" | "createdAt"> & { scheduledCallId: string },
): Promise<{ success: boolean; id?: string; session?: StreamSession; error?: string }> {
  try {
    const streamsRef = collection(db, "streamSessions")
    const q = query(streamsRef, where("scheduledCallId", "==", session.scheduledCallId))
    const snap = await getDocs(q)
    const existing = snap.docs.find((d) => (d.data() as { publisherId?: string }).publisherId === session.publisherId)

    if (existing) {
      await deactivatePublisherBroadcastSessions(session.publisherId, existing.id)
      await updateDoc(doc(db, "streamSessions", existing.id), {
        publisherId: session.publisherId,
        publisherName: session.publisherName,
        roomId: session.roomId,
        isActive: true,
        awaitingBroadcast: false,
        title: session.title,
        description: session.description || "",
        sport: session.sport || "",
        scheduledCallId: session.scheduledCallId,
      })
      const refreshed = await getDoc(doc(db, "streamSessions", existing.id))
      const raw = refreshed.data() as Record<string, unknown>
      const normalized = normalizeStreamSession(existing.id, raw)
      return { success: true, id: existing.id, session: normalized }
    }

    await deactivatePublisherBroadcastSessions(session.publisherId)
    return createStreamSession({
      ...session,
      awaitingBroadcast: false,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to activate scheduled session"
    return { success: false, error: msg }
  }
}

export const createStreamSession = async (session: Omit<StreamSession, "id" | "createdAt">) => {
  try {
    await deactivatePublisherBroadcastSessions(session.publisherId)

    const sessionData = {
      ...session,
      awaitingBroadcast: session.awaitingBroadcast ?? false,
      createdAt: new Date(),
    }

    const docRef = await addDoc(collection(db, "streamSessions"), sessionData)
    return { success: true, id: docRef.id, session: { ...sessionData, id: docRef.id } as StreamSession }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export const endStreamSession = async (sessionId: string) => {
  try {
    const sessionRef = doc(db, "streamSessions", sessionId)
    await updateDoc(sessionRef, {
      isActive: false,
      endedAt: new Date(),
    })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/** Reassign who “owns” the session in Firestore (subscribers/admin UI). The current host must stop broadcasting; the new publisher should go live in the same room if you need continuity. */
export async function updateStreamSessionPublisher(
  sessionId: string,
  publisherId: string,
  publisherName: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await updateDoc(doc(db, "streamSessions", sessionId), {
      publisherId,
      publisherName,
    })
    return { success: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Update failed"
    return { success: false, error: msg }
  }
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

/** Real-time list of all streams with `isActive: true`. */
export function subscribeToActiveStreams(
  callback: (streams: StreamSession[]) => void,
): () => void {
  const streamsRef = collection(db, "streamSessions")
  const q = query(streamsRef, where("isActive", "==", true))
  return onSnapshot(q, (snapshot) => {
    const streams = snapshot.docs.map((d) => normalizeStreamSession(d.id, d.data() as Record<string, unknown>))
    streams.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    callback(streams)
  })
}

export const getActiveStreams = async () => {
  try {
    const streamsRef = collection(db, "streamSessions")
    // Use simpler query to avoid index requirements
    const q = query(streamsRef, where("isActive", "==", true))
    const querySnapshot = await getDocs(q)

    const streams = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as StreamSession[]

    // Sort by createdAt in memory to avoid composite index
    return streams.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } catch (error) {
    console.error("Error fetching active streams:", error)
    return []
  }
}

export const getPublisherStreams = async (publisherId: string) => {
  try {
    const streamsRef = collection(db, "streamSessions")
    // Use simpler query to avoid index requirements
    const q = query(streamsRef, where("publisherId", "==", publisherId))
    const querySnapshot = await getDocs(q)

    const streams = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as StreamSession[]

    // Sort by createdAt in memory to avoid composite index
    return streams.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } catch (error) {
    console.error("Error fetching publisher streams:", error)
    return []
  }
}

/** Get the publisher's current broadcasting session (if any). Used for rejoin after refresh. */
export const getPublisherActiveStream = async (publisherId: string): Promise<StreamSession | null> => {
  const streams = await getPublisherStreams(publisherId)
  const sessions = streams
    .filter((s): s is StreamSession & { id: string } => Boolean(s.id))
    .map((s) => normalizeStreamSession(s.id, { ...(s as unknown as Record<string, unknown>) }))
  return pickPublisherRejoinStream(sessions)
}

/** Subscribe to the publisher's broadcasting session in real-time (for rejoin detection). Ignores scheduled placeholders. */
export function subscribeToPublisherActiveStream(
  publisherId: string,
  onActiveStream: (session: StreamSession | null) => void,
): () => void {
  const streamsRef = collection(db, "streamSessions")
  const q = query(streamsRef, where("publisherId", "==", publisherId))
  return onSnapshot(q, (snapshot) => {
    const sessions = snapshot.docs.map((d) => normalizeStreamSession(d.id, d.data() as Record<string, unknown>))
    onActiveStream(pickPublisherRejoinStream(sessions))
  })
}

export const getAllStreams = async () => {
  try {
    const streamsRef = collection(db, "streamSessions")
    const querySnapshot = await getDocs(streamsRef)

    const streams = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as StreamSession[]

    // Sort by createdAt in memory (newest first)
    return streams.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } catch (error) {
    console.error("Error fetching all streams:", error)
    return []
  }
}

export const generateRoomId = (publisherId: string): string => {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `stream-${publisherId}-${timestamp}-${random}`
}

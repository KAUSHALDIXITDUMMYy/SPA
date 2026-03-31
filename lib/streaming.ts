import { db } from "./firebase"
import { collection, addDoc, doc, updateDoc, query, where, getDocs, onSnapshot } from "firebase/firestore"

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
  gameName?: string
  league?: string
  match?: string
}

export const createStreamSession = async (session: Omit<StreamSession, "id" | "createdAt">) => {
  try {
    // Ensure only one active stream per publisher by ending any existing active sessions
    const streamsRef = collection(db, "streamSessions")
    const activeForPublisherQuery = query(streamsRef, where("publisherId", "==", session.publisherId), where("isActive", "==", true))
    const activeSnapshot = await getDocs(activeForPublisherQuery)
    await Promise.all(
      activeSnapshot.docs.map(async (activeDoc) => {
        try {
          await updateDoc(doc(db, "streamSessions", activeDoc.id), {
            isActive: false,
            endedAt: new Date(),
          })
        } catch {
          // best-effort; do not block new session creation
        }
      }),
    )

    const sessionData = {
      ...session,
      createdAt: new Date(),
    }

    const docRef = await addDoc(collection(db, "streamSessions"), sessionData)
    return { success: true, id: docRef.id, session: { ...sessionData, id: docRef.id } }
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

/** Get the publisher's currently active stream (if any). Used for rejoin after refresh. */
export const getPublisherActiveStream = async (publisherId: string): Promise<StreamSession | null> => {
  const streams = await getPublisherStreams(publisherId)
  return streams.find((s) => s.isActive) ?? null
}

/** Subscribe to the publisher's active stream in real-time (for rejoin detection). */
export function subscribeToPublisherActiveStream(
  publisherId: string,
  onActiveStream: (session: StreamSession | null) => void
): () => void {
  const streamsRef = collection(db, "streamSessions")
  const q = query(streamsRef, where("publisherId", "==", publisherId))
  return onSnapshot(q, (snapshot) => {
    const sessions = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as StreamSession[]
    const active = sessions.find((s) => s.isActive) ?? null
    onActiveStream(active)
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

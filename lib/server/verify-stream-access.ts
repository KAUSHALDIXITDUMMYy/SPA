import type { UserRole } from "@/lib/auth"
import { getAdminDb } from "@/lib/firebase-admin"

type AgoraJoinRole = "publisher" | "audience"

type ActiveStreamSession = {
  id: string
  publisherId: string
  roomId: string
  isActive: boolean
}

const STREAM_CACHE_MS = 2_500
const streamCache = new Map<string, { stream: ActiveStreamSession | null; expiresAt: number }>()

function cacheStream(key: string, stream: ActiveStreamSession | null) {
  streamCache.set(key, { stream, expiresAt: Date.now() + STREAM_CACHE_MS })
}

async function getActiveStreamByRoomId(roomId: string): Promise<ActiveStreamSession | null> {
  const cacheKey = `room:${roomId}`
  const cached = streamCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.stream

  const db = await getAdminDb()
  const snapshot = await db
    .collection("streamSessions")
    .where("roomId", "==", roomId)
    .where("isActive", "==", true)
    .limit(1)
    .get()

  if (snapshot.empty) {
    cacheStream(cacheKey, null)
    return null
  }

  const doc = snapshot.docs[0]
  const data = doc.data()
  const stream: ActiveStreamSession = {
    id: doc.id,
    publisherId: String(data.publisherId || ""),
    roomId: String(data.roomId || ""),
    isActive: data.isActive === true,
  }
  cacheStream(cacheKey, stream)
  cacheStream(`id:${doc.id}`, stream)
  return stream
}

async function getActiveStreamById(
  streamSessionId: string,
  expectedRoomId: string,
): Promise<ActiveStreamSession | null> {
  const cacheKey = `id:${streamSessionId}`
  const cached = streamCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.stream?.roomId === expectedRoomId) return cached.stream
  }

  const db = await getAdminDb()
  const doc = await db.collection("streamSessions").doc(streamSessionId).get()
  if (!doc.exists) {
    cacheStream(cacheKey, null)
    return null
  }

  const data = doc.data()!
  if (data.isActive !== true || String(data.roomId || "") !== expectedRoomId) {
    cacheStream(cacheKey, null)
    return null
  }

  const stream: ActiveStreamSession = {
    id: doc.id,
    publisherId: String(data.publisherId || ""),
    roomId: String(data.roomId || ""),
    isActive: true,
  }
  cacheStream(cacheKey, stream)
  cacheStream(`room:${stream.roomId}`, stream)
  return stream
}

async function resolveActiveStream(
  channelName: string,
  streamSessionId?: string,
): Promise<ActiveStreamSession | null> {
  if (streamSessionId) {
    return getActiveStreamById(streamSessionId, channelName)
  }
  return getActiveStreamByRoomId(channelName)
}

async function subscriberHasStreamAccess(
  subscriberId: string,
  streamSessionId: string,
  publisherId: string,
): Promise<boolean> {
  const db = await getAdminDb()

  const [permissionSnap, assignmentSnap] = await Promise.all([
    db
      .collection("streamPermissions")
      .where("subscriberId", "==", subscriberId)
      .where("publisherId", "==", publisherId)
      .where("isActive", "==", true)
      .limit(1)
      .get(),
    db
      .collection("streamAssignments")
      .where("subscriberId", "==", subscriberId)
      .where("streamSessionId", "==", streamSessionId)
      .where("isActive", "==", true)
      .limit(1)
      .get(),
  ])

  return !permissionSnap.empty || !assignmentSnap.empty
}

/**
 * Server-only gate for Agora tokens. Blocks unauthenticated relay sites.
 */
export async function verifyAgoraChannelAccess(input: {
  uid: string
  role: UserRole
  channelName: string
  joinRole: AgoraJoinRole
  streamSessionId?: string
}): Promise<{ ok: true; streamSessionId: string } | { ok: false; error: string }> {
  const stream = await resolveActiveStream(input.channelName, input.streamSessionId)
  if (!stream) {
    return { ok: false, error: "No active stream for this channel" }
  }

  if (input.joinRole === "publisher") {
    if (input.role !== "publisher" || input.uid !== stream.publisherId) {
      return { ok: false, error: "Not authorized to publish on this channel" }
    }
    return { ok: true, streamSessionId: stream.id }
  }

  if (input.role === "admin") {
    return { ok: true, streamSessionId: stream.id }
  }

  if (input.role === "publisher") {
    if (input.uid === stream.publisherId) {
      return { ok: true, streamSessionId: stream.id }
    }
    return { ok: false, error: "Publishers may only monitor their own channel" }
  }

  if (input.role === "subscriber") {
    const allowed = await subscriberHasStreamAccess(input.uid, stream.id, stream.publisherId)
    if (!allowed) {
      return { ok: false, error: "You are not assigned to this stream" }
    }
    return { ok: true, streamSessionId: stream.id }
  }

  return { ok: false, error: "Forbidden" }
}

/**
 * Server-only streaming-session operations (Firebase Admin SDK). Mirrors lib/streaming.ts
 * so the browser never writes streamSessions / scheduledCalls directly.
 *
 * Authorization is enforced by the calling route: publishers may only act on their own
 * sessions; admin-only operations (placeholders, reassignment) are gated with requireAdmin.
 */

import { FieldValue } from "firebase-admin/firestore"
import { getAdminDb } from "@/lib/firebase-admin"

function toIso(value: any): string | null {
  if (!value) return null
  if (typeof value?.toDate === "function") return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function serializeSession(id: string, data: any) {
  return { id, ...data, createdAt: toIso(data.createdAt), endedAt: toIso(data.endedAt) }
}

/** Returns the publisherId that owns a session (for ownership checks), or null. */
export async function getSessionOwner(sessionId: string): Promise<string | null> {
  const db = await getAdminDb()
  const snap = await db.collection("streamSessions").doc(sessionId).get()
  if (!snap.exists) return null
  return String((snap.data() as any)?.publisherId || "") || null
}

export async function deactivatePublisherBroadcastSessions(
  publisherId: string,
  exceptSessionId?: string,
): Promise<void> {
  const db = await getAdminDb()
  const snap = await db
    .collection("streamSessions")
    .where("publisherId", "==", publisherId)
    .where("isActive", "==", true)
    .get()
  await Promise.all(
    snap.docs.map(async (activeDoc: any) => {
      if (exceptSessionId && activeDoc.id === exceptSessionId) return
      const data = activeDoc.data() as Record<string, unknown>
      if (data.scheduledCallId && data.awaitingBroadcast === true) return
      try {
        await activeDoc.ref.update({ isActive: false, endedAt: new Date() })
      } catch {
        // best-effort
      }
    }),
  )
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
  const db = await getAdminDb()
  await db.collection("streamSessions").add({
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
}

export async function removeStreamSessionsForScheduledCall(scheduledCallId: string): Promise<void> {
  const db = await getAdminDb()
  const snap = await db
    .collection("streamSessions")
    .where("scheduledCallId", "==", scheduledCallId)
    .get()
  await Promise.all(
    snap.docs.map((d: any) =>
      d.ref.update({ isActive: false, awaitingBroadcast: true, endedAt: new Date() }),
    ),
  )
}

export async function endStreamSession(sessionId: string) {
  const db = await getAdminDb()
  await db.collection("streamSessions").doc(sessionId).update({
    isActive: false,
    endedAt: new Date(),
  })
  return { success: true }
}

export async function resetScheduledSessionAfterBroadcast(sessionId: string) {
  const db = await getAdminDb()
  const ref = db.collection("streamSessions").doc(sessionId)
  const snap = await ref.get()
  if (!snap.exists) return { success: false, error: "Session not found" }
  const data = snap.data() as Record<string, unknown>
  if (data.scheduledCallId) {
    await ref.update({ isActive: true, awaitingBroadcast: true, endedAt: FieldValue.delete() })
    return { success: true }
  }
  return endStreamSession(sessionId)
}

export async function createStreamSession(session: Record<string, any>) {
  const db = await getAdminDb()
  await deactivatePublisherBroadcastSessions(session.publisherId)
  const sessionData = {
    ...session,
    awaitingBroadcast: session.awaitingBroadcast ?? false,
    createdAt: new Date(),
  }
  const ref = await db.collection("streamSessions").add(sessionData)
  return { success: true, id: ref.id, session: serializeSession(ref.id, sessionData) }
}

export async function activateScheduledBroadcastSession(session: Record<string, any>) {
  const db = await getAdminDb()
  const snap = await db
    .collection("streamSessions")
    .where("scheduledCallId", "==", session.scheduledCallId)
    .where("publisherId", "==", session.publisherId)
    .get()
  const existing = snap.docs[0]

  if (existing) {
    await deactivatePublisherBroadcastSessions(session.publisherId, existing.id)
    await existing.ref.update({
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
    const refreshed = await existing.ref.get()
    return {
      success: true,
      id: existing.id,
      session: serializeSession(existing.id, refreshed.data()),
    }
  }

  await deactivatePublisherBroadcastSessions(session.publisherId)
  return createStreamSession({ ...session, awaitingBroadcast: false })
}

export async function updateStreamSessionPublisher(
  sessionId: string,
  publisherId: string,
  publisherName: string,
) {
  const db = await getAdminDb()
  const ref = db.collection("streamSessions").doc(sessionId)
  const snap = await ref.get()
  const scheduledCallId = snap.exists
    ? (snap.data() as { scheduledCallId?: string }).scheduledCallId
    : undefined

  await ref.update({ publisherId, publisherName })

  if (scheduledCallId) {
    try {
      await db.collection("scheduledCalls").doc(String(scheduledCallId)).update({
        publisherId,
        publisherName,
        updatedAt: new Date(),
      })
    } catch {
      // scheduledCalls row may be gone; session is still updated
    }
  }
  return { success: true }
}

export async function getActiveStreams() {
  const db = await getAdminDb()
  const snap = await db.collection("streamSessions").where("isActive", "==", true).get()
  return snap.docs.map((d: any) => serializeSession(d.id, d.data()))
}

export async function getPublisherStreams(publisherId: string) {
  const db = await getAdminDb()
  const snap = await db.collection("streamSessions").where("publisherId", "==", publisherId).get()
  return snap.docs.map((d: any) => serializeSession(d.id, d.data()))
}

export async function getAllStreams() {
  const db = await getAdminDb()
  const snap = await db.collection("streamSessions").get()
  return snap.docs.map((d: any) => serializeSession(d.id, d.data()))
}

/** Server-only chat operations (Firebase Admin SDK). Mirrors lib/chat.ts. */

import { getAdminDb } from "@/lib/firebase-admin"

function toIso(value: any): string {
  if (!value) return new Date().toISOString()
  if (typeof value?.toDate === "function") return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

export async function sendChatMessage(input: {
  streamSessionId: string
  senderId: string
  senderName: string
  senderRole: "publisher" | "subscriber" | "admin"
  text: string
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const trimmed = input.text.trim()
  if (!trimmed) return { success: false, error: "Message cannot be empty" }

  const db = await getAdminDb()
  const ref = await db.collection("streamChatMessages").add({
    streamSessionId: input.streamSessionId,
    senderId: input.senderId,
    senderName: input.senderName,
    senderRole: input.senderRole,
    text: trimmed,
    createdAt: new Date(),
  })
  return { success: true, id: ref.id }
}

export async function getStreamChat(streamSessionId: string, maxMessages = 100) {
  const cap = Math.min(500, Math.max(1, maxMessages))
  const db = await getAdminDb()
  const snap = await db
    .collection("streamChatMessages")
    .where("streamSessionId", "==", streamSessionId)
    .orderBy("createdAt", "asc")
    .limit(cap)
    .get()

  return snap.docs.map((d: any) => {
    const data = d.data()
    const role = data.senderRole
    const senderRole =
      role === "publisher" || role === "admin" || role === "subscriber" ? role : "subscriber"
    return {
      id: d.id,
      streamSessionId: data.streamSessionId,
      senderId: data.senderId,
      senderName: data.senderName,
      senderRole,
      text: data.text,
      createdAt: toIso(data.createdAt),
    }
  })
}

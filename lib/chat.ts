import { fetchWithAuth } from "@/lib/client/authenticated-fetch"
import { startPoll } from "@/lib/client/poll"

const ENDPOINT = "/api/chat"

export interface ChatMessage {
  id?: string
  streamSessionId: string
  senderId: string
  senderName: string
  senderRole: "publisher" | "subscriber" | "admin"
  text: string
  createdAt: Date
}

function normalize(m: any): ChatMessage {
  const role = m.senderRole
  const senderRole: ChatMessage["senderRole"] =
    role === "publisher" || role === "admin" || role === "subscriber" ? role : "subscriber"
  return {
    id: m.id,
    streamSessionId: m.streamSessionId,
    senderId: m.senderId,
    senderName: m.senderName,
    senderRole,
    text: m.text,
    createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
  }
}

/**
 * Send a chat message to a stream session. The server overrides senderId/senderRole with
 * the authenticated user, so callers cannot impersonate another sender.
 */
export async function sendChatMessage(
  streamSessionId: string,
  _senderId: string,
  senderName: string,
  _senderRole: "publisher" | "subscriber" | "admin",
  text: string,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const trimmed = text.trim()
  if (!trimmed) return { success: false, error: "Message cannot be empty" }
  try {
    const res = await fetchWithAuth(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ streamSessionId, senderName, text: trimmed }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || json.success === false) {
      return { success: false, error: json.error || "Failed to send message" }
    }
    return { success: true, id: json.id }
  } catch (error: any) {
    console.error("Error sending chat message:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Subscribe to chat messages for a stream session. Firestore realtime is replaced with
 * short polling (3s); returns an unsubscribe function with the same shape as before.
 * @param maxMessages capped at 500
 */
export function subscribeToStreamChat(
  streamSessionId: string,
  callback: (messages: ChatMessage[]) => void,
  maxMessages = 100,
): () => void {
  const cap = Math.min(500, Math.max(1, maxMessages))
  let active = true
  const stop = startPoll(async () => {
    try {
      const res = await fetchWithAuth(
        `${ENDPOINT}?streamSessionId=${encodeURIComponent(streamSessionId)}&limit=${cap}`,
        { method: "GET" },
      )
      if (!res.ok) return
      const json = await res.json()
      if (active) callback((json.messages || []).map(normalize))
    } catch (error) {
      console.error("Error loading chat:", error)
    }
  }, 8000)
  return () => {
    active = false
    stop()
  }
}

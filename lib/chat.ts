import { db } from "./firebase"
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore"

export interface ChatMessage {
  id?: string
  streamSessionId: string
  senderId: string
  senderName: string
  senderRole: "publisher" | "subscriber"
  text: string
  createdAt: Date | ReturnType<typeof serverTimestamp>
}

/**
 * Send a chat message to a stream session
 */
export async function sendChatMessage(
  streamSessionId: string,
  senderId: string,
  senderName: string,
  senderRole: "publisher" | "subscriber",
  text: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const trimmed = text.trim()
    if (!trimmed) {
      return { success: false, error: "Message cannot be empty" }
    }

    const docRef = await addDoc(collection(db, "streamChatMessages"), {
      streamSessionId,
      senderId,
      senderName,
      senderRole,
      text: trimmed,
      createdAt: serverTimestamp(),
    })

    return { success: true, id: docRef.id }
  } catch (error: any) {
    console.error("Error sending chat message:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Subscribe to chat messages for a stream session (real-time updates via Firebase)
 */
export function subscribeToStreamChat(
  streamSessionId: string,
  callback: (messages: ChatMessage[]) => void
): Unsubscribe {
  const messagesRef = collection(db, "streamChatMessages")
  const q = query(
    messagesRef,
    where("streamSessionId", "==", streamSessionId),
    orderBy("createdAt", "asc"),
    limit(100)
  )

  return onSnapshot(q, (snapshot) => {
    const messages: ChatMessage[] = snapshot.docs.map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        streamSessionId: data.streamSessionId,
        senderId: data.senderId,
        senderName: data.senderName,
        senderRole: data.senderRole,
        text: data.text,
        createdAt: data.createdAt?.toDate?.() ?? new Date(data.createdAt),
      }
    })
    callback(messages)
  })
}

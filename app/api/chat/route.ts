import { NextRequest, NextResponse } from "next/server"
import { requireUserProfile } from "@/lib/server/api-auth"
import * as chat from "@/lib/server/chat-data"

/** GET — messages for a stream session (any signed-in user). */
export async function GET(req: NextRequest) {
  const profile = await requireUserProfile(req)
  if (profile instanceof NextResponse) return profile

  const { searchParams } = new URL(req.url)
  const streamSessionId = searchParams.get("streamSessionId")
  const maxMessages = parseInt(searchParams.get("limit") || "100")
  if (!streamSessionId) {
    return NextResponse.json({ error: "streamSessionId required" }, { status: 400 })
  }

  try {
    return NextResponse.json({ messages: await chat.getStreamChat(streamSessionId, maxMessages) })
  } catch (error: any) {
    console.error("[api/chat] GET failed:", error)
    return NextResponse.json({ error: error?.message || "Failed to load chat" }, { status: 500 })
  }
}

/** POST — send a message. senderId/senderRole are taken from the verified token (anti-spoof). */
export async function POST(req: NextRequest) {
  const profile = await requireUserProfile(req)
  if (profile instanceof NextResponse) return profile

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { streamSessionId, senderName, text } = body || {}
  if (!streamSessionId || !text) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  try {
    const result = await chat.sendChatMessage({
      streamSessionId,
      senderId: profile.uid,
      senderName: senderName || profile.email || "Unknown",
      senderRole: profile.role,
      text,
    })
    const status = result.success ? 200 : 400
    return NextResponse.json(result, { status })
  } catch (error: any) {
    console.error("[api/chat] POST failed:", error)
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 })
  }
}

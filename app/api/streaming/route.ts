import { NextRequest, NextResponse } from "next/server"
import { requireUserProfile, requireAdmin, forbidden } from "@/lib/server/api-auth"
import * as streaming from "@/lib/server/streaming-data"

/** GET — stream reads, scoped by role. */
export async function GET(req: NextRequest) {
  const profile = await requireUserProfile(req)
  if (profile instanceof NextResponse) return profile

  const { searchParams } = new URL(req.url)
  const type = searchParams.get("type") || "active"
  const publisherId = searchParams.get("publisherId") || ""

  try {
    if (type === "active") {
      return NextResponse.json({ streams: await streaming.getActiveStreams() })
    }
    if (type === "all") {
      if (profile.role !== "admin") return forbidden()
      return NextResponse.json({ streams: await streaming.getAllStreams() })
    }
    if (type === "publisher") {
      if (profile.role !== "admin" && profile.uid !== publisherId) return forbidden()
      return NextResponse.json({ streams: await streaming.getPublisherStreams(publisherId) })
    }
    if (type === "publisherActive") {
      if (profile.role !== "admin" && profile.uid !== publisherId) return forbidden()
      return NextResponse.json({ streams: await streaming.getPublisherActiveStreams(publisherId) })
    }
    return NextResponse.json({ error: "Invalid type" }, { status: 400 })
  } catch (error: any) {
    console.error(`[api/streaming] GET type=${type} failed:`, error)
    return NextResponse.json({ error: error?.message || "Operation failed" }, { status: 500 })
  }
}

/** POST — stream writes, with publisher-ownership / admin checks per action. */
export async function POST(req: NextRequest) {
  const profile = await requireUserProfile(req)
  if (profile instanceof NextResponse) return profile

  let body: { action?: string; payload?: any }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const { action, payload = {} } = body
  const isAdmin = profile.role === "admin"

  // Helper: a publisher may only act on their own publisherId.
  const ownsPublisher = (pid: string) => isAdmin || profile.uid === pid
  // Helper: confirm the caller owns (or is admin over) an existing session.
  const ownsSession = async (sessionId: string) => {
    if (isAdmin) return true
    const owner = await streaming.getSessionOwner(sessionId)
    return owner != null && owner === profile.uid
  }

  try {
    switch (action) {
      case "createStreamSession": {
        const session = payload.session || {}
        if (!ownsPublisher(session.publisherId)) return forbidden()
        return NextResponse.json(await streaming.createStreamSession(session))
      }
      case "activateScheduledBroadcastSession": {
        const session = payload.session || {}
        if (!ownsPublisher(session.publisherId)) return forbidden()
        return NextResponse.json(await streaming.activateScheduledBroadcastSession(session))
      }
      case "endStreamSession": {
        if (!(await ownsSession(payload.sessionId))) return forbidden()
        return NextResponse.json(await streaming.endStreamSession(payload.sessionId))
      }
      case "resetScheduledSessionAfterBroadcast": {
        if (!(await ownsSession(payload.sessionId))) return forbidden()
        return NextResponse.json(
          await streaming.resetScheduledSessionAfterBroadcast(payload.sessionId),
        )
      }
      case "deactivatePublisherBroadcastSessions": {
        if (!ownsPublisher(payload.publisherId)) return forbidden()
        await streaming.deactivatePublisherBroadcastSessions(
          payload.publisherId,
          payload.exceptSessionId,
        )
        return NextResponse.json({ success: true })
      }
      // ── admin-only scheduled-room management ──
      case "createScheduledPlaceholderSession": {
        if (!isAdmin) return forbidden()
        return NextResponse.json(await streaming.createScheduledPlaceholderSession(payload))
      }
      case "removeStreamSessionsForScheduledCall": {
        if (!isAdmin) return forbidden()
        await streaming.removeStreamSessionsForScheduledCall(payload.scheduledCallId)
        return NextResponse.json({ success: true })
      }
      case "updateStreamSessionPublisher": {
        if (!isAdmin) return forbidden()
        return NextResponse.json(
          await streaming.updateStreamSessionPublisher(
            payload.sessionId,
            payload.publisherId,
            payload.publisherName,
          ),
        )
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error: any) {
    console.error(`[api/streaming] action=${action} failed:`, error)
    return NextResponse.json({ error: error?.message || "Operation failed" }, { status: 500 })
  }
}

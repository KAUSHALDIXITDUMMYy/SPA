import { NextRequest } from "next/server"
import { requirePublisherOrAdmin } from "@/lib/server/api-auth"
import { endLiveZoomMeetings } from "@/lib/server/zoom-api"

export async function POST(req: NextRequest) {
  try {
    const profile = await requirePublisherOrAdmin(req)
    if (profile instanceof Response) return profile

    const body = await req.json()
    const userId: string = body?.userId || body?.hostId || "me"

    const ended = await endLiveZoomMeetings(userId)
    return new Response(JSON.stringify({ success: true, ended }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Failed to end live meetings" }), {
      status: 500,
    })
  }
}

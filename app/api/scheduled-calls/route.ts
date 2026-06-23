import { NextRequest, NextResponse } from "next/server"
import { requireUserProfile, requireAdmin, forbidden } from "@/lib/server/api-auth"
import * as calls from "@/lib/server/scheduled-calls-data"

/** GET — read scheduled calls (any signed-in user): ?dateKey=... or ?id=... */
export async function GET(req: NextRequest) {
  const profile = await requireUserProfile(req)
  if (profile instanceof NextResponse) return profile

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  const dateKey = searchParams.get("dateKey")

  try {
    if (id) {
      return NextResponse.json({ call: await calls.getScheduledCallById(id) })
    }
    if (dateKey) {
      return NextResponse.json({ calls: await calls.getScheduledCallsForDate(dateKey) })
    }
    return NextResponse.json({ error: "Provide id or dateKey" }, { status: 400 })
  } catch (error: any) {
    console.error("[api/scheduled-calls] GET failed:", error)
    return NextResponse.json({ error: error?.message || "Operation failed" }, { status: 500 })
  }
}

/** POST — create/update/delete scheduled calls (admin only). */
export async function POST(req: NextRequest) {
  const profile = await requireAdmin(req)
  if (profile instanceof NextResponse) return profile

  let body: { action?: string; payload?: any }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const { action, payload = {} } = body

  try {
    switch (action) {
      case "createScheduledCall":
        return NextResponse.json(await calls.createScheduledCall(payload))
      case "updateScheduledCall":
        return NextResponse.json(await calls.updateScheduledCall(payload.callId, payload.patch || {}))
      case "deleteScheduledCall":
        return NextResponse.json(await calls.deleteScheduledCall(payload.callId))
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error: any) {
    console.error(`[api/scheduled-calls] action=${action} failed:`, error)
    return NextResponse.json({ error: error?.message || "Operation failed" }, { status: 500 })
  }
}

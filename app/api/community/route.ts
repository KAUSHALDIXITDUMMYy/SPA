import { NextRequest, NextResponse } from "next/server"
import { requireUserProfile } from "@/lib/server/api-auth"
import * as adminData from "@/lib/server/admin-data"

/** GET — any signed-in user can read admin broadcasts (client filters by tenant). */
export async function GET(req: NextRequest) {
  const profile = await requireUserProfile(req)
  if (profile instanceof NextResponse) return profile

  const action = new URL(req.url).searchParams.get("action") || "broadcasts"
  try {
    if (action === "broadcasts") {
      return NextResponse.json({ broadcasts: await adminData.getAdminBroadcasts() })
    }
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (error: any) {
    console.error(`[api/community] GET action=${action} failed:`, error)
    return NextResponse.json({ error: error?.message || "Operation failed" }, { status: 500 })
  }
}

/** POST — report content or block a user. The actor is always the authenticated user. */
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
  try {
    switch (action) {
      case "createReport":
        return NextResponse.json(
          await adminData.createReport({
            ...payload,
            reporterId: profile.uid, // never trust a client-supplied reporter id
          }),
        )
      case "blockUser":
        return NextResponse.json(
          await adminData.blockUser({
            blockerId: profile.uid, // a user can only block on their own behalf
            blockerName: payload.blockerName,
            blockedUserId: payload.blockedUserId,
            blockedUserName: payload.blockedUserName,
          }),
        )
      case "addBlockEvent":
        return NextResponse.json(
          await adminData.addBlockEvent({ ...payload, blockerId: profile.uid }),
        )
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error: any) {
    console.error(`[api/community] POST action=${action} failed:`, error)
    return NextResponse.json({ error: error?.message || "Operation failed" }, { status: 500 })
  }
}

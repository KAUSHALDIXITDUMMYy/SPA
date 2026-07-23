import { NextRequest, NextResponse } from "next/server"
import { requireUserProfile } from "@/lib/server/api-auth"
import * as authData from "@/lib/server/auth-data"

/**
 * POST — authenticated self-service account actions. All actions operate on the verified
 * caller's own uid only; the client cannot act on another user here.
 */
export async function POST(req: NextRequest) {
  const profile = await requireUserProfile(req)
  if (profile instanceof NextResponse) return profile
  const uid = profile.uid

  let body: { action?: string; payload?: any }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const { action, payload = {} } = body

  try {
    switch (action) {
      case "establishSession":
        return NextResponse.json(await authData.establishSession(uid, payload.localSessionId))
      case "heartbeat":
        return NextResponse.json(await authData.heartbeatSession(uid))
      case "clearSession":
        return NextResponse.json(await authData.clearSession(uid))
      case "acceptTerms":
        return NextResponse.json(await authData.acceptTerms(uid))
      case "clearMustChangePassword":
        return NextResponse.json(await authData.setMustChangePassword(uid, false))
      case "createProfile":
        return NextResponse.json(
          await authData.createProfile({
            uid,
            email: profile.email || payload.email,
            displayName: payload.displayName,
          }),
        )
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error: any) {
    console.error(`[api/auth/account] action=${action} failed:`, error)
    return NextResponse.json({ error: error?.message || "Operation failed" }, { status: 500 })
  }
}

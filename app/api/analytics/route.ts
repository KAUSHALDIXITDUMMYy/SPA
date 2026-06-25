import { NextRequest, NextResponse } from "next/server"
import { requireUserProfile, forbidden } from "@/lib/server/api-auth"
import { resolveUserTenant } from "@/lib/tenant"
import * as analytics from "@/lib/server/analytics-data"

/**
 * POST — track subscriber activity (a subscriber can only track itself; admins any).
 *        action: "cleanup" (admin only) prunes old analytics.
 */
export async function POST(request: NextRequest) {
  const profile = await requireUserProfile(request)
  if (profile instanceof NextResponse) return profile

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (body?.action === "cleanup") {
    if (profile.role !== "admin") return forbidden()
    try {
      return NextResponse.json(await analytics.cleanupOldAnalytics(body.daysToKeep || 30))
    } catch (error: any) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
  }

  const { streamSessionId, subscriberId, action } = body || {}
  if (!streamSessionId || !subscriberId || !action) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }
  if (profile.uid !== subscriberId && profile.role !== "admin") {
    return forbidden()
  }

  try {
    const result = await analytics.trackSubscriberActivity({
      streamSessionId,
      subscriberId,
      subscriberName: body.subscriberName,
      publisherId: body.publisherId,
      publisherName: body.publisherName,
      action,
      duration: body.duration,
      subscriberTenant: body.subscriberTenant,
      location: body.location,
    })
    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Error tracking analytics:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

/** GET — admin/publisher/stream analytics with role-scoped access. */
export async function GET(request: NextRequest) {
  const profile = await requireUserProfile(request)
  if (profile instanceof NextResponse) return profile

  const { searchParams } = new URL(request.url)
  const type = searchParams.get("type")
  const publisherId = searchParams.get("publisherId")
  const streamSessionId = searchParams.get("streamSessionId")
  const limitCount = parseInt(searchParams.get("limit") || "100")

  try {
    if (type === "admin") {
      if (profile.role !== "admin") return forbidden()
      return NextResponse.json(
        await analytics.getAdminAnalytics(limitCount, {
          role: profile.role,
          email: profile.email,
          tenant: resolveUserTenant(profile),
        }),
      )
    }

    if (type === "publisher" && publisherId) {
      // A publisher may only read their own analytics; admins read anyone's.
      if (profile.role !== "admin" && !(profile.role === "publisher" && profile.uid === publisherId)) {
        return forbidden()
      }
      return NextResponse.json(await analytics.getPublisherAnalytics(publisherId, limitCount))
    }

    if (type === "stream" && streamSessionId) {
      return NextResponse.json(await analytics.getStreamAnalytics(streamSessionId))
    }

    return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 })
  } catch (error: any) {
    console.error("Error fetching analytics:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

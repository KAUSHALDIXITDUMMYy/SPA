import { NextRequest, NextResponse } from "next/server"
import { requireUserProfile, forbidden } from "@/lib/server/api-auth"
import { resolveUserTenant } from "@/lib/tenant"
import * as sub from "@/lib/server/subscriber-data"

/**
 * GET — subscriber/permission reads. Subscriber-scoped queries require the caller to be
 * that subscriber (or an admin); allPermissions is admin-only.
 */
export async function GET(req: NextRequest) {
  const profile = await requireUserProfile(req)
  if (profile instanceof NextResponse) return profile

  const { searchParams } = new URL(req.url)
  const type = searchParams.get("type") || ""
  const subscriberId = searchParams.get("subscriberId") || ""
  const publisherId = searchParams.get("publisherId") || ""
  const isAdmin = profile.role === "admin"
  const selfOrAdmin = isAdmin || profile.uid === subscriberId

  try {
    switch (type) {
      case "permissions":
        if (!selfOrAdmin) return forbidden()
        return NextResponse.json(await sub.getSubscriberPermissions(subscriberId))
      case "accessiblePublishers":
        if (!selfOrAdmin) return forbidden()
        return NextResponse.json({
          publisherIds: await sub.getAccessiblePublisherIdsForSubscriber(subscriberId),
        })
      case "hasAssignment":
        if (!selfOrAdmin) return forbidden()
        return NextResponse.json({ hasAssignment: await sub.subscriberHasAnyAssignment(subscriberId) })
      case "userPermissions":
        if (!selfOrAdmin) return forbidden()
        return NextResponse.json({ permissions: await sub.getUserPermissions(subscriberId) })
      case "checkAccess":
        if (!selfOrAdmin) return forbidden()
        return NextResponse.json(await sub.checkStreamAccess(subscriberId, publisherId))
      case "allPermissions":
        if (!isAdmin) return forbidden()
        return NextResponse.json(
          await sub.getAllPermissionsPage(
            {
              role: profile.role,
              email: profile.email,
              tenant: resolveUserTenant(profile),
            },
            {
              limit: Number(searchParams.get("limit") || "") || undefined,
              cursor: searchParams.get("cursor"),
            },
          ),
        )
      case "permissionsForSubscribers": {
        if (!isAdmin) return forbidden()
        const raw = searchParams.get("subscriberIds") || ""
        const subscriberIds = raw.split(",").map((s) => s.trim()).filter(Boolean)
        return NextResponse.json({
          permissions: await sub.getPermissionsForSubscriberIds(subscriberIds, {
            role: profile.role,
            email: profile.email,
            tenant: resolveUserTenant(profile),
          }),
        })
      }
      default:
        return NextResponse.json({ error: "Invalid type" }, { status: 400 })
    }
  } catch (error: any) {
    console.error(`[api/subscriber] type=${type} failed:`, error)
    return NextResponse.json({ error: error?.message || "Operation failed" }, { status: 500 })
  }
}

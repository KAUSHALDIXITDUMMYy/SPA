import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/server/api-auth"
import { getAdminDb } from "@/lib/firebase-admin"
import { resolveUserTenant } from "@/lib/tenant"

/** GET — admin-only: recent access-log entries (newest first). */
export async function GET(req: NextRequest) {
  const profile = await requireAdmin(req)
  if (profile instanceof NextResponse) return profile

  const limitCount = parseInt(new URL(req.url).searchParams.get("limit") || "500")

  try {
    const db = await getAdminDb()
    const snap = await db
      .collection("accessLogs")
      .orderBy("createdAt", "desc")
      .limit(limitCount)
      .get()

    const logs = snap.docs
      .map((d: any) => {
        const data = d.data() || {}
        const createdAt =
          data.createdAt?.toDate?.()?.toISOString?.() ??
          (data.createdAt ? new Date(data.createdAt).toISOString() : null)
        return { id: d.id, ...data, createdAt }
      })
      .filter((row) => {
        const host = String(row.host || "").toLowerCase()
        const scope = resolveUserTenant(profile)
        if (scope === "kevionics") {
          return host.includes("kevionics")
        }
        return !host.includes("kevionics")
      })
    return NextResponse.json({ logs })
  } catch (error: any) {
    console.error("[api/access-logs] GET failed:", error)
    return NextResponse.json({ error: error?.message || "Failed to fetch logs" }, { status: 500 })
  }
}

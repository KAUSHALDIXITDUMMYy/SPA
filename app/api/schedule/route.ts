import { NextRequest, NextResponse } from "next/server"
import { getAdminDb } from "@/lib/firebase-admin"
import { requireUserProfile, requireAdmin } from "@/lib/server/api-auth"

const SCHEDULE_DOC_ID = "current"

/** GET — any authenticated user can read today's schedule. */
export async function GET(req: NextRequest) {
  const profile = await requireUserProfile(req)
  if (profile instanceof NextResponse) return profile

  try {
    const db = await getAdminDb()
    const snap = await db.collection("dailySchedule").doc(SCHEDULE_DOC_ID).get()
    if (!snap.exists) return NextResponse.json({ schedule: null })

    const data = snap.data() || {}
    const updatedAt =
      data.updatedAt?.toDate?.()?.toISOString?.() ??
      (data.updatedAt ? new Date(data.updatedAt).toISOString() : new Date().toISOString())

    return NextResponse.json({
      schedule: { content: data.content || "", updatedAt },
    })
  } catch (error: any) {
    console.error("[api/schedule] GET failed:", error)
    return NextResponse.json({ error: "Failed to fetch schedule" }, { status: 500 })
  }
}

/** PUT — admin only: replace today's schedule content. */
export async function PUT(req: NextRequest) {
  const profile = await requireAdmin(req)
  if (profile instanceof NextResponse) return profile

  let body: { content?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (typeof body.content !== "string") {
    return NextResponse.json({ error: "content must be a string" }, { status: 400 })
  }

  try {
    const db = await getAdminDb()
    await db.collection("dailySchedule").doc(SCHEDULE_DOC_ID).set({
      content: body.content,
      updatedAt: new Date(),
      updatedBy: profile.uid,
    })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[api/schedule] PUT failed:", error)
    return NextResponse.json({ error: "Failed to save schedule" }, { status: 500 })
  }
}

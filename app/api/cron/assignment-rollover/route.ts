import { NextRequest, NextResponse } from "next/server"
import { getScheduleDateKey, rollAssignmentDayOnScheduleSave } from "@/lib/server/assignment-day"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Internal VPS cron: wipe streamAssignments when the operational day advances (6 PM IST). */
export async function GET(req: NextRequest) {
  const peer = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || ""
  if (peer && peer !== "127.0.0.1" && peer !== "::1") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const result = await rollAssignmentDayOnScheduleSave(getScheduleDateKey())
    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[api/cron/assignment-rollover] failed:", error)
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 })
  }
}

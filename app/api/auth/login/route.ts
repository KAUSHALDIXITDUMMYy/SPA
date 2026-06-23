import { NextRequest, NextResponse } from "next/server"
import { verifyAppCheck } from "@/lib/firebase-admin"
import { forbidden } from "@/lib/server/api-auth"
import { migratePendingUser } from "@/lib/server/auth-data"

/**
 * POST — pre-login pending-user migration. Runs before the user has a session, so it is
 * gated by App Check (app attestation) only. It never reveals credentials and only acts
 * when the supplied password matches the admin-set pending password.
 */
export async function POST(req: NextRequest) {
  if (!(await verifyAppCheck(req))) return forbidden("App Check failed")

  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const { email, password } = body
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
  }

  try {
    const result = await migratePendingUser(email, password)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[api/auth/login] migration failed:", error)
    return NextResponse.json({ migrated: false, error: error?.message }, { status: 500 })
  }
}

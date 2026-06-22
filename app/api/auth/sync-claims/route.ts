import { NextResponse } from "next/server"
import { verifyRequestUser, getAdminDb } from "@/lib/firebase-admin"
import { syncUserRoleClaim } from "@/lib/server/user-claims"
import type { UserRole } from "@/lib/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Copy Firestore role into JWT custom claims so security rules see role immediately. */
export async function POST(req: Request) {
  const user = await verifyRequestUser(req)
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  const snap = await (await getAdminDb()).collection("users").doc(user.uid).get()
  if (!snap.exists) {
    return NextResponse.json({ error: "User profile not found" }, { status: 404 })
  }

  const role = snap.data()?.role as UserRole | undefined
  if (role !== "admin" && role !== "publisher" && role !== "subscriber") {
    return NextResponse.json({ error: "Invalid role on profile" }, { status: 400 })
  }

  await syncUserRoleClaim(user.uid, role)
  return NextResponse.json({ ok: true, role })
}

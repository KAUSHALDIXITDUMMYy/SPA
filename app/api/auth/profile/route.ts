import { NextRequest, NextResponse } from "next/server"
import { requireUserProfile, forbidden } from "@/lib/server/api-auth"
import { getProfile } from "@/lib/server/auth-data"

/** GET — read a user profile. Callers may read their own profile; admins may read anyone's. */
export async function GET(req: NextRequest) {
  const profile = await requireUserProfile(req)
  if (profile instanceof NextResponse) return profile

  const uid = new URL(req.url).searchParams.get("uid") || profile.uid
  if (uid !== profile.uid && profile.role !== "admin") return forbidden()

  try {
    return NextResponse.json({ profile: await getProfile(uid) })
  } catch (error: any) {
    console.error("[api/auth/profile] GET failed:", error)
    return NextResponse.json({ error: error?.message || "Failed to load profile" }, { status: 500 })
  }
}

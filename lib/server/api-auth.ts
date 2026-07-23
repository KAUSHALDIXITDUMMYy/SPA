import { NextResponse } from "next/server"
import { verifyAppCheck, verifyRequestUserProfile, type VerifiedUserProfile } from "@/lib/firebase-admin"

export function unauthorized(message = "Authentication required") {
  return NextResponse.json({ error: message }, { status: 401 })
}

export function forbidden(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 })
}

export async function requireUserProfile(
  req: Request,
  options?: { enforceSession?: boolean },
): Promise<VerifiedUserProfile | NextResponse> {
  if (!(await verifyAppCheck(req))) return forbidden("App Check failed")
  const profile = await verifyRequestUserProfile(req, options)
  if (!profile) {
    return unauthorized(
      options?.enforceSession === false
        ? "Authentication required"
        : "Authentication required — signed in on another device",
    )
  }
  return profile
}

export async function requireAdmin(req: Request): Promise<VerifiedUserProfile | NextResponse> {
  const profile = await requireUserProfile(req)
  if (profile instanceof NextResponse) return profile
  if (profile.role !== "admin") return forbidden("Admin access required")
  return profile
}

export async function requirePublisherOrAdmin(
  req: Request,
): Promise<VerifiedUserProfile | NextResponse> {
  const profile = await requireUserProfile(req)
  if (profile instanceof NextResponse) return profile
  if (profile.role !== "publisher" && profile.role !== "admin") {
    return forbidden("Publisher access required")
  }
  return profile
}

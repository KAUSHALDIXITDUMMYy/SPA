import { NextRequest, NextResponse } from "next/server"
import { getAdminDb, verifyRequestUser } from "@/lib/firebase-admin"
import { verifyTotp } from "@/lib/totp"

// Verify a login-time TOTP code for the authenticated user.
export async function POST(req: NextRequest) {
  const requester = await verifyRequestUser(req)
  if (!requester) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  try {
    const { code } = await req.json()
    const adminDb = await getAdminDb()
    const mfaSnap = await adminDb.collection("mfaSecrets").doc(requester.uid).get()
    const data = mfaSnap.data()

    // Not enrolled → nothing to verify, treat as passed.
    if (!data?.enabled || !data?.secret) {
      return NextResponse.json({ ok: true, enrolled: false })
    }

    const ok = await verifyTotp(String(code || ""), data.secret)
    if (!ok) {
      return NextResponse.json({ ok: false, error: "Incorrect code." }, { status: 400 })
    }

    return NextResponse.json({ ok: true, enrolled: true })
  } catch (error: any) {
    console.error("MFA verify error:", error)
    return NextResponse.json({ error: error.message || "Failed to verify code" }, { status: 500 })
  }
}

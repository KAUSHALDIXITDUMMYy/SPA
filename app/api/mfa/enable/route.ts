import { NextRequest, NextResponse } from "next/server"
import { getAdminDb, verifyRequestUser } from "@/lib/firebase-admin"
import { verifyTotp } from "@/lib/totp"

// Confirm enrollment: verify the first code against the pending secret, then enable.
export async function POST(req: NextRequest) {
  const requester = await verifyRequestUser(req)
  if (!requester) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  try {
    const { code } = await req.json()
    const adminDb = await getAdminDb()
    const mfaRef = adminDb.collection("mfaSecrets").doc(requester.uid)
    const mfaSnap = await mfaRef.get()
    const pendingSecret = mfaSnap.data()?.pendingSecret

    if (!pendingSecret) {
      return NextResponse.json({ error: "No pending 2FA setup. Start setup again." }, { status: 400 })
    }

    if (!(await verifyTotp(String(code || ""), pendingSecret))) {
      return NextResponse.json({ error: "Incorrect code. Check your authenticator app and try again." }, { status: 400 })
    }

    await mfaRef.set(
      {
        secret: pendingSecret,
        pendingSecret: null,
        enabled: true,
        enrolledAt: new Date(),
        updatedAt: new Date(),
      },
      { merge: true },
    )

    await adminDb.collection("users").doc(requester.uid).set({ totpEnabled: true }, { merge: true })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("MFA enable error:", error)
    return NextResponse.json({ error: error.message || "Failed to enable 2FA" }, { status: 500 })
  }
}

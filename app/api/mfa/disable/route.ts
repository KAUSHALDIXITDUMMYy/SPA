import { NextRequest, NextResponse } from "next/server"
import { getAdminDb, verifyRequestUser } from "@/lib/firebase-admin"

// Disable/reset 2FA. A user can disable their own; an admin can reset another's
// (used for device-loss recovery).
export async function POST(req: NextRequest) {
  const requester = await verifyRequestUser(req)
  if (!requester) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const targetUid: string = body?.targetUid || requester.uid
    const adminDb = await getAdminDb()

    if (targetUid !== requester.uid) {
      const requesterDoc = await adminDb.collection("users").doc(requester.uid).get()
      if (requesterDoc.data()?.role !== "admin") {
        return NextResponse.json({ error: "Only admins can reset another user's 2FA." }, { status: 403 })
      }
    }

    await adminDb.collection("mfaSecrets").doc(targetUid).set(
      {
        secret: null,
        pendingSecret: null,
        enabled: false,
        updatedAt: new Date(),
      },
      { merge: true },
    )
    await adminDb.collection("users").doc(targetUid).set({ totpEnabled: false }, { merge: true })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("MFA disable error:", error)
    return NextResponse.json({ error: error.message || "Failed to disable 2FA" }, { status: 500 })
  }
}

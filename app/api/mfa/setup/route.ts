import { NextRequest, NextResponse } from "next/server"
import QRCode from "qrcode"
import { getAdminDb, verifyRequestUser } from "@/lib/firebase-admin"
import { buildOtpAuthUrl, generateTotpSecret } from "@/lib/totp"

// Begin TOTP enrollment: create a pending secret and return a QR + otpauth URL.
export async function POST(req: NextRequest) {
  const requester = await verifyRequestUser(req)
  if (!requester) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  try {
    const adminDb = await getAdminDb()
    const userDoc = await adminDb.collection("users").doc(requester.uid).get()
    if (!userDoc.exists) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 })
    }
    if (userDoc.data()?.role !== "subscriber") {
      return NextResponse.json({ error: "Two-factor authentication is only available for player accounts." }, { status: 403 })
    }

    const accountName = requester.email || userDoc.data()?.email || requester.uid
    const secret = generateTotpSecret()
    const otpauthUrl = buildOtpAuthUrl(accountName, secret)

    await adminDb.collection("mfaSecrets").doc(requester.uid).set(
      {
        pendingSecret: secret,
        updatedAt: new Date(),
      },
      { merge: true },
    )

    const qr = await QRCode.toDataURL(otpauthUrl)
    return NextResponse.json({ otpauthUrl, qr, secret })
  } catch (error: any) {
    console.error("MFA setup error:", error)
    return NextResponse.json({ error: error.message || "Failed to start 2FA setup" }, { status: 500 })
  }
}

import { NextRequest } from "next/server"
import { SignJWT } from "jose"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const meetingNumber: string | undefined = body?.meetingNumber
    const role: 0 | 1 = body?.role === 1 ? 1 : 0

    const sdkKey = process.env.NEXT_PUBLIC_ZOOM_MEETING_SDK_KEY
    const sdkSecret = process.env.ZOOM_MEETING_SDK_SECRET

    if (!sdkKey || !sdkSecret) {
      return new Response(
        JSON.stringify({ error: "Zoom SDK credentials are not configured" }),
        { status: 500 },
      )
    }

    if (!meetingNumber) {
      return new Response(JSON.stringify({ error: "Missing meetingNumber" }), { status: 400 })
    }

    const iat = Math.floor(Date.now() / 1000)
    const exp = iat + 60 * 2
    const tokenExp = iat + 60 * 60 * 2

    const payload = {
      sdkKey,
      mn: meetingNumber,
      role,
      iat,
      exp,
      tokenExp,
    }

    const signature = await new SignJWT(payload as any)
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .sign(new TextEncoder().encode(sdkSecret))

    return new Response(
      JSON.stringify({ signature, sdkKey }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || "Failed to generate signature" }),
      { status: 500 },
    )
  }
}



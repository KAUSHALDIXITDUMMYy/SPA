import { NextRequest, NextResponse } from "next/server"
import { SignJWT, importPKCS8 } from "jose"

// Run this route on the Edge to minimize latency when generating JaaS tokens
export const runtime = "edge"
export const dynamic = "force-dynamic"
export const revalidate = 0
// Prefer US-East by default; adjust to where most users are (e.g., "fra1", "lhr1", "sin1")
export const preferredRegion = ["iad1"]

type TokenRequestBody = {
  roomName: string
  user?: {
    name?: string
    email?: string
    id?: string
    moderator?: boolean
  }
}

export async function POST(req: NextRequest) {
  try {
    const appId = process.env.NEXT_PUBLIC_JAAS_APP_ID 
    const apiKey = process.env.JAAS_API_KEY 
    const privateKeyPem = process.env.JAAS_PRIVATE_KEY 

    if (!appId || !apiKey || !privateKeyPem) {
      return NextResponse.json({ error: "Server is missing JaaS configuration" }, { status: 500 })
    }

    const { roomName, user }: TokenRequestBody = await req.json()

    if (!roomName || typeof roomName !== "string") {
      return NextResponse.json({ error: "roomName is required" }, { status: 400 })
    }

    // Import the PKCS8 private key for RS256
    const alg = "RS256"
    const normalizedPem = privateKeyPem.includes("\\n") ? privateKeyPem.replace(/\\n/g, "\n") : privateKeyPem
    const privateKey = await importPKCS8(normalizedPem, alg)

    const nowSeconds = Math.floor(Date.now() / 1000)
    const expSeconds = nowSeconds + 60 * 60 * 8 // 8 hours

    const payload: any = {
      aud: "jitsi",
      iss: "chat",
      sub: appId,
      room: roomName,
      context: {
        user: {
          name: user?.name || "Guest",
          email: user?.email || "",
          id: user?.id || undefined,
          moderator: !!user?.moderator,
        },
      },
      nbf: nowSeconds - 10,
      iat: nowSeconds,
      exp: expSeconds,
    }

    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg, kid: apiKey })
      .sign(privateKey)

    return NextResponse.json({ token })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to generate token" }, { status: 500 })
  }
}



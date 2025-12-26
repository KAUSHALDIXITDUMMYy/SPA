import { NextRequest, NextResponse } from "next/server"
import { RtcRole, RtcTokenBuilder } from "agora-access-token"

// Use Node runtime; Agora token generation requires Node crypto
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

type TokenRequestBody = {
  channelName: string
  uid?: number
  role?: "publisher" | "audience"
  expireSeconds?: number
}

export async function POST(req: NextRequest) {
  try {
    const APP_ID = process.env.AGORA_APP_ID
    const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE

    if (!APP_ID || !APP_CERTIFICATE) {
      return NextResponse.json({ error: "Server is missing AGORA_APP_ID/AGORA_APP_CERTIFICATE" }, { status: 500 })
    }

    const { channelName, uid, role, expireSeconds }: TokenRequestBody = await req.json()

    if (!channelName || typeof channelName !== "string") {
      return NextResponse.json({ error: "channelName is required" }, { status: 400 })
    }

    const agoraUid = typeof uid === "number" && uid > 0 ? uid : Math.floor(Math.random() * 2_147_483_647)
    const agoraRole = role === "publisher" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER
    const ttl = typeof expireSeconds === "number" && expireSeconds > 0 ? expireSeconds : 60 * 60 * 8 // 8h

    const currentTs = Math.floor(Date.now() / 1000)
    const privilegeExpiredTs = currentTs + ttl

    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      agoraUid,
      agoraRole,
      privilegeExpiredTs
    )

    return NextResponse.json({ token, uid: agoraUid, appId: APP_ID, expiresAt: privilegeExpiredTs })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to generate Agora token" }, { status: 500 })
  }
}




import { NextRequest, NextResponse } from "next/server"
import { RtcRole, RtcTokenBuilder } from "agora-access-token"
import { verifyAppCheck, verifyRequestUserProfile } from "@/lib/firebase-admin"
import { verifyAgoraChannelAccess } from "@/lib/server/verify-stream-access"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

type TokenRequestBody = {
  channelName: string
  streamSessionId?: string
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

    if (!(await verifyAppCheck(req))) {
      return NextResponse.json({ error: "App Check failed" }, { status: 403 })
    }

    const verifiedUser = await verifyRequestUserProfile(req)
    if (!verifiedUser) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const { channelName, streamSessionId, uid, role, expireSeconds }: TokenRequestBody = await req.json()

    if (!channelName || typeof channelName !== "string") {
      return NextResponse.json({ error: "channelName is required" }, { status: 400 })
    }

    const joinRole = role === "publisher" ? "publisher" : "audience"
    const access = await verifyAgoraChannelAccess({
      uid: verifiedUser.uid,
      role: verifiedUser.role,
      channelName,
      joinRole,
      streamSessionId: typeof streamSessionId === "string" ? streamSessionId : undefined,
    })

    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: 403 })
    }

    const agoraUid = typeof uid === "number" && uid > 0 ? uid : Math.floor(Math.random() * 2_147_483_647)
    const agoraRole = joinRole === "publisher" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER
    const defaultTtl = joinRole === "publisher" ? 60 * 60 * 2 : 60 * 60
    const ttl = typeof expireSeconds === "number" && expireSeconds > 0 ? expireSeconds : defaultTtl

    const currentTs = Math.floor(Date.now() / 1000)
    const privilegeExpiredTs = currentTs + ttl

    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      agoraUid,
      agoraRole,
      privilegeExpiredTs,
    )

    return NextResponse.json({ token, uid: agoraUid, appId: APP_ID, expiresAt: privilegeExpiredTs })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to generate Agora token" }, { status: 500 })
  }
}

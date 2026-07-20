import { NextRequest, NextResponse } from "next/server"
import { RtcRole, RtcTokenBuilder } from "agora-token"
import { verifyAppCheck, verifyRequestUserProfile, getAdminDb } from "@/lib/firebase-admin"
import { verifyAgoraChannelAccess } from "@/lib/server/verify-stream-access"
import { getRequestContext } from "@/lib/server/request-context"
import {
  recordViewerPresence,
  appendStreamUsage,
} from "@/lib/server/analytics-data"

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

/**
 * Audience token TTL. Sized at 30 minutes so silent renewal (via the existing
 * renewToken path) happens infrequently and a renewal-time network blip can
 * never drop audio mid-stream. Renewal re-records presence but never gates audio.
 */
const AUDIENCE_TTL_SECONDS = 30 * 60
const PUBLISHER_TTL_SECONDS = 60 * 60 * 24

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
    const defaultTtl = joinRole === "publisher" ? PUBLISHER_TTL_SECONDS : AUDIENCE_TTL_SECONDS
    const ttl = typeof expireSeconds === "number" && expireSeconds > 0 ? expireSeconds : defaultTtl

    const currentTs = Math.floor(Date.now() / 1000)
    const privilegeExpiredTs = currentTs + ttl

    // AccessToken2: expiration args are seconds from now, not unix timestamps.
    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      agoraUid,
      agoraRole,
      ttl,
      ttl,
    )

    // ── Server-side presence + billing ledger (audience only) ────────────────
    // This is the single chokepoint where every live viewer (web AND mobile) is
    // recorded with server-captured IP/device/origin/geo. It is INFORMATIONAL:
    // it never returns 403 and never affects the token above, so a legit
    // subscriber's audio is never interrupted by analytics.
    if (joinRole === "audience" && verifiedUser.role === "subscriber") {
      try {
        const context = await getRequestContext(req, { slowGeoOk: true })

        // Best-effort read of the single-session id (informational attribution only).
        let sessionId: string | null = null
        let subscriberName: string | undefined
        let tenant: string | undefined
        try {
          const db = await getAdminDb()
          const userSnap = await db.collection("users").doc(verifiedUser.uid).get()
          if (userSnap.exists) {
            const ud: any = userSnap.data()
            sessionId = ud.sessionId ?? null
            subscriberName = ud.displayName || verifiedUser.email
            tenant = ud.tenant
          }
        } catch {
          // ignore — attribution fields stay null
        }

        // Resolve publisher name for the row (avoid an extra read when access gave it).
        let publisherName = ""
        try {
          const db = await getAdminDb()
          const sSnap = await db.collection("streamSessions").doc(access.streamSessionId).get()
          if (sSnap.exists) publisherName = String((sSnap.data() as any)?.publisherName || "")
        } catch {
          // ignore
        }

        const presenceInput = {
          streamSessionId: access.streamSessionId,
          subscriberId: verifiedUser.uid,
          subscriberName: subscriberName || verifiedUser.email || "Subscriber",
          publisherId: "", // not needed for analytics row; name is what we show
          publisherName,
          subscriberTenant: tenant,
          context,
          sessionId,
          roomId: channelName,
        }

        // Record presence (also flags concurrent streams — informational only).
        const { concurrentSession } = await recordViewerPresence(presenceInput)
        if (concurrentSession) {
          console.log(
            `[agora/token] concurrent stream detected for subscriber=${verifiedUser.uid} session=${access.streamSessionId} (informational; no audio impact)`,
          )
        }

        // Append to the immutable billing ledger (one row per join).
        await appendStreamUsage(presenceInput)
      } catch (analyticsErr: any) {
        // Analytics must NEVER break a legit subscriber's join.
        console.warn("[agora/token] analytics recording failed (non-fatal):", analyticsErr?.message)
      }
    }

    return NextResponse.json({ token, uid: agoraUid, appId: APP_ID, expiresAt: privilegeExpiredTs })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to generate Agora token" }, { status: 500 })
  }
}

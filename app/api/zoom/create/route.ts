import { NextRequest } from "next/server"
import { db } from "@/lib/firebase"
import { addDoc, collection, getDoc, doc } from "firebase/firestore"
import { requirePublisherOrAdmin } from "@/lib/server/api-auth"
import { endLiveZoomMeetings, getZoomS2SAccessToken } from "@/lib/server/zoom-api"

const CALLS_COLLECTION = "zoomCalls"

export async function POST(req: NextRequest) {
  try {
    const profile = await requirePublisherOrAdmin(req)
    if (profile instanceof Response) return profile

    const body = await req.json()
    const publisherId: string | undefined = body?.publisherId
    const title: string | undefined = body?.title
    const description: string | undefined = body?.description
    if (!publisherId || !title) {
      return new Response(JSON.stringify({ error: "publisherId and title are required" }), { status: 400 })
    }

    if (profile.role === "publisher" && profile.uid !== publisherId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
    }

    const accessToken = await getZoomS2SAccessToken()

    let zoomUserForCreation = "me"
    try {
      const pubSnap = await getDoc(doc(db, "users", publisherId))
      const pub = pubSnap.exists() ? (pubSnap.data() as any) : null
      if (pub?.zoomUserId) zoomUserForCreation = pub.zoomUserId
      else if (pub?.zoomUserEmail) zoomUserForCreation = pub.zoomUserEmail
    } catch {}

    // Proactively end any live meetings for this host (direct API — no unauthenticated internal fetch).
    try {
      await endLiveZoomMeetings(zoomUserForCreation)
    } catch {}

    const createPayload = {
      topic: title,
      type: 1,
      settings: {
        join_before_host: true,
        waiting_room: false,
        approval_type: 2,
        participant_video: true,
        host_video: true,
      },
    }

    const createRes = await fetch(
      `https://api.zoom.us/v2/users/${encodeURIComponent(zoomUserForCreation)}/meetings`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createPayload),
      },
    )
    const meeting = await createRes.json()
    if (!createRes.ok) {
      return new Response(JSON.stringify({ error: meeting?.message || "Failed to create Zoom meeting" }), {
        status: 500,
      })
    }

    const docData = {
      publisherId,
      title,
      description: description || undefined,
      isActive: true,
      meetingNumber: String(meeting.id || meeting.meeting_number || ""),
      password: meeting.password || "",
      joinUrl: meeting.join_url || "",
      hostId: meeting.host_id || "",
      startUrl: meeting.start_url || "",
      createdAt: new Date(),
    }
    const ref = await addDoc(collection(db, CALLS_COLLECTION), docData as any)

    return new Response(JSON.stringify({ success: true, id: ref.id, meetingNumber: docData.meetingNumber }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || "Failed to create Zoom meeting" }), { status: 500 })
  }
}

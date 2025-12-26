import { NextRequest } from "next/server"
import { db } from "@/lib/firebase"
import { addDoc, collection, getDoc, doc } from "firebase/firestore"

const CALLS_COLLECTION = "zoomCalls"

async function getS2SAccessToken() {
  const accountId = process.env.ZOOM_ACCOUNT_ID
  const clientId = process.env.ZOOM_CLIENT_ID
  const clientSecret = process.env.ZOOM_CLIENT_SECRET
  if (!accountId || !clientId || !clientSecret) {
    throw new Error("Zoom S2S credentials are not configured")
  }
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
  const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
    },
  })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json?.reason || json?.error || "Failed to obtain Zoom token")
  }
  return json.access_token as string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const publisherId: string | undefined = body?.publisherId
    const title: string | undefined = body?.title
    const description: string | undefined = body?.description
    if (!publisherId || !title) {
      return new Response(JSON.stringify({ error: "publisherId and title are required" }), { status: 400 })
    }

    const accessToken = await getS2SAccessToken()

    // Determine which Zoom user to create the meeting under
    let zoomUserForCreation = "me"
    try {
      const pubSnap = await getDoc(doc(db, "users", publisherId))
      const pub = pubSnap.exists() ? (pubSnap.data() as any) : null
      if (pub?.zoomUserId) zoomUserForCreation = pub.zoomUserId
      else if (pub?.zoomUserEmail) zoomUserForCreation = pub.zoomUserEmail
    } catch {}

    // Proactively end any live meetings for this host to avoid 'already in progress'
    try {
      await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ""}/api/zoom/end-live`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "me" }),
      })
    } catch {}

    const createPayload = {
      topic: title,
      type: 1, // instant meeting
      settings: {
        join_before_host: true,
        waiting_room: false,
        approval_type: 2, // no registration
        participant_video: true,
        host_video: true,
      },
    }

    const createRes = await fetch(`https://api.zoom.us/v2/users/${encodeURIComponent(zoomUserForCreation)}/meetings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createPayload),
    })
    const meeting = await createRes.json()
    if (!createRes.ok) {
      return new Response(JSON.stringify({ error: meeting?.message || "Failed to create Zoom meeting" }), { status: 500 })
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

    return new Response(
      JSON.stringify({ success: true, id: ref.id, meetingNumber: docData.meetingNumber }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || "Failed to create Zoom meeting" }),
      { status: 500 },
    )
  }
}



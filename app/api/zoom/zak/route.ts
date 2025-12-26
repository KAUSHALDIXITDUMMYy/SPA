import { NextRequest } from "next/server"

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
    headers: { Authorization: `Basic ${creds}` },
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
    const userId: string | undefined = body?.userId || body?.hostId || "me"
    const token = await getS2SAccessToken()
    const zakRes = await fetch(`https://api.zoom.us/v2/users/${encodeURIComponent(userId)}/token?type=zak`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await zakRes.json()
    if (!zakRes.ok) {
      return new Response(JSON.stringify({ error: json?.message || "Failed to get ZAK" }), { status: 500 })
    }
    return new Response(JSON.stringify({ zak: json?.token }), { status: 200, headers: { "Content-Type": "application/json" } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Failed to get ZAK" }), { status: 500 })
  }
}



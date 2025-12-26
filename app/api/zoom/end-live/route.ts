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
    const userId: string = body?.userId || body?.hostId || "me"

    const token = await getS2SAccessToken()
    const listRes = await fetch(`https://api.zoom.us/v2/users/${encodeURIComponent(userId)}/meetings?type=live`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const listJson = await listRes.json()
    if (!listRes.ok) {
      return new Response(JSON.stringify({ error: listJson?.message || "Failed to list live meetings" }), { status: 500 })
    }
    const meetings: any[] = listJson?.meetings || []
    const ended: string[] = []
    for (const m of meetings) {
      const id = m?.id
      if (!id) continue
      try {
        const endRes = await fetch(`https://api.zoom.us/v2/meetings/${id}/status`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "end" }),
        })
        if (endRes.ok) ended.push(String(id))
      } catch {}
    }
    return new Response(JSON.stringify({ success: true, ended }), { status: 200, headers: { "Content-Type": "application/json" } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Failed to end live meetings" }), { status: 500 })
  }
}



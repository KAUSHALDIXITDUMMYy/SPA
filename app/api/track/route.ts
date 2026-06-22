import { NextRequest, NextResponse } from "next/server"
import { getAdminDb } from "@/lib/firebase-admin"
import { isBlockedApiCaller } from "@/lib/server/api-origin"

// 1x1 transparent GIF for the <img>-based fallback tracker.
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")

/** The hostnames that are legitimately YOUR deployment. Anything else = a clone. */
const OWN_HOSTS = [
  "localhost",
  "sportsmagicianaudio.vercel.app",
  "spa-gules-ten.vercel.app", // legacy Vercel URL (keep until fully retired)
]

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for") || ""
  return xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown"
}

async function record(req: NextRequest, payload: Record<string, any>) {
  const host = String(payload.host || "").toLowerCase()
  const isOwn = OWN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`) || host.includes(h))

  const entry = {
    ip: clientIp(req),
    host,
    href: payload.href || null,
    referrer: payload.referrer || req.headers.get("referer") || null,
    origin: req.headers.get("origin") || null,
    userAgent: req.headers.get("user-agent") || null,
    country: req.headers.get("x-vercel-ip-country") || null,
    city: req.headers.get("x-vercel-ip-city") || null,
    region: req.headers.get("x-vercel-ip-country-region") || null,
    suspicious: !isOwn, // true when served from a domain that isn't yours
    createdAt: new Date(),
  }

  // Always log to the server console (visible in Vercel logs), even if Firestore is unavailable.
  console.log(`[track] ${entry.suspicious ? "FOREIGN" : "own"} host=${entry.host} ip=${entry.ip} ua=${entry.userAgent}`)

  try {
    const db = await getAdminDb()
    await db.collection("accessLogs").add(entry)
  } catch (e) {
    // Firestore/admin not configured — console log above still captured it.
  }
}

export async function POST(req: NextRequest) {
  if (isBlockedApiCaller(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  try {
    const payload = await req.json().catch(() => ({}))
    await record(req, payload)
  } catch {
    // never block the page on tracking
  }
  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  if (isBlockedApiCaller(req)) {
    return new NextResponse(null, { status: 403 })
  }
  // Image-pixel fallback: <img src="https://YOURDOMAIN/api/track?host=..."> works even if a
  // clone strips your JavaScript. The `host` query is whatever the embedding page passes.
  const url = new URL(req.url)
  await record(req, {
    host: url.searchParams.get("host") || req.headers.get("referer") || "",
    href: url.searchParams.get("href"),
    referrer: req.headers.get("referer"),
  })
  return new NextResponse(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  })
}

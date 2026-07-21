/**
 * Server-only extraction of a viewer's connection context: IP, user-agent,
 * device class, browser origin, and approximate geo (city/region/country).
 *
 * Used at Agora-token-mint time so every live viewer (web AND mobile) is
 * recorded with the same fidelity — the IP/device/geo come from the server,
 * not the client, which means mobile viewers are as accurate as web.
 */

export type DeviceClass = "mobile" | "tablet" | "desktop" | "unknown"

export interface ViewerGeo {
  city?: string
  region?: string
  country?: string
  countryCode?: string
  latitude?: number
  longitude?: number
  source?: "ip"
}

export interface RequestContext {
  /** First public IP from the XFF chain, falling back to x-real-ip. */
  ip: string
  /** Raw User-Agent header (null when absent). */
  userAgent: string | null
  /** Coarse device class derived from the UA. */
  deviceClass: DeviceClass
  /** Browser Origin header (null for native/server calls). */
  origin: string | null
  /** Approximate geo from Vercel headers (fast, free) or a server-side IP lookup. */
  geo: ViewerGeo | null
}

/** Pull the leftmost client IP from the proxy headers. */
function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || ""
  const first = xff.split(",")[0].trim()
  if (first) return first
  return req.headers.get("x-real-ip") || "unknown"
}

/** Coarse device class from a UA string. Flutter / native app UAs read as mobile. */
export function classifyDevice(ua: string | null): DeviceClass {
  if (!ua) return "unknown"
  const u = ua.toLowerCase()
  // Tablets first — some Android UAs contain "mobile" only on phones.
  if (/(ipad|tablet|playbook|silk|kindle)/.test(u)) return "tablet"
  if (/(android|iphone|ipod|windows phone|blackberry|opera mini|mobile safari)/.test(u)) {
    return "mobile"
  }
  if (/(dart|flutter)/.test(u)) return "mobile" // Flutter VM-style UA = mobile app
  if (u.includes("mobile")) return "mobile"
  if (/(mozilla|chrome|safari|edge|firefox)/.test(u)) return "desktop"
  return "unknown"
}

function geoFromHeaders(req: Request): ViewerGeo | null {
  const country = req.headers.get("x-vercel-ip-country") ?? undefined
  const city = req.headers.get("x-vercel-ip-city") ?? undefined
  const region = req.headers.get("x-vercel-ip-country-region") ?? undefined
  if (country || city || region) {
    return {
      country,
      countryCode: country && country.length === 2 ? country : undefined,
      city: city ? decodeURIComponent(city) : undefined,
      region,
      source: "ip",
    }
  }
  return null
}

/**
 * Cached server-side geo lookup so we don't hit ipapi.co for every token mint.
 * Keyed by IP; cached for 10 minutes. Only used when Vercel headers are absent
 * (e.g. when the API runs on your own VPS behind nginx, not Vercel).
 */
const geoCache = new Map<string, { at: number; geo: ViewerGeo | null }>()
const GEO_CACHE_MS = 10 * 60 * 1000

function isPrivateIp(ip: string): boolean {
  if (!ip || ip === "unknown") return true
  return (
    ip === "127.0.0.1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.") || // coarse — close enough for "skip lookup"
    ip.startsWith("169.254.")
  )
}

async function geoFromIpLookup(ip: string): Promise<ViewerGeo | null> {
  if (isPrivateIp(ip)) return null
  const cached = geoCache.get(ip)
  if (cached && Date.now() - cached.at < GEO_CACHE_MS) return cached.geo

  let geo: ViewerGeo | null = null
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: controller.signal,
    })
    clearTimeout(t)
    if (res.ok) {
      const d: any = await res.json()
      if (!d.error) {
        geo = {
          city: typeof d.city === "string" ? d.city : undefined,
          region: typeof d.region === "string" ? d.region : undefined,
          country: typeof d.country_name === "string" ? d.country_name : undefined,
          countryCode: typeof d.country_code === "string" ? d.country_code : undefined,
          latitude: typeof d.latitude === "number" ? d.latitude : undefined,
          longitude: typeof d.longitude === "number" ? d.longitude : undefined,
          source: "ip",
        }
      }
    }
  } catch {
    // best-effort; absence is fine
  }
  geoCache.set(ip, { at: Date.now(), geo })
  return geo
}

/**
 * Build the full request context. `slowGeoOk = true` allows a server-side IP
 * lookup when Vercel headers are absent (e.g. on the VPS behind nginx).
 */
export async function getRequestContext(
  req: Request,
  opts: { slowGeoOk?: boolean } = {},
): Promise<RequestContext> {
  const ip = clientIp(req)
  const userAgent = req.headers.get("user-agent")
  const origin = req.headers.get("origin")
  const deviceClass = classifyDevice(userAgent)

  let geo = geoFromHeaders(req)
  if (!geo && opts.slowGeoOk) {
    geo = await geoFromIpLookup(ip)
  }

  return { ip, userAgent, deviceClass, origin, geo }
}

/** A synchronous, side-effect-free variant for routes that can't await geo. */
export function getRequestContextSync(req: Request): RequestContext {
  const ip = clientIp(req)
  const userAgent = req.headers.get("user-agent")
  const origin = req.headers.get("origin")
  return {
    ip,
    userAgent,
    deviceClass: classifyDevice(userAgent),
    origin,
    geo: geoFromHeaders(req),
  }
}

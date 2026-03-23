export interface ViewerLocation {
  city?: string
  region?: string
  country?: string
  countryCode?: string
  latitude?: number
  longitude?: number
  /** How the location was obtained */
  source?: "ip" | "geo"
}

/**
 * Approximate location from the client IP (no browser permission).
 * Used so admins can see where live listeners are; accuracy is city/region level.
 */
export async function fetchApproximateViewerLocation(): Promise<ViewerLocation | null> {
  const urls = [
    "https://ipapi.co/json/",
    "https://ipwho.is/",
  ]

  for (const url of urls) {
    try {
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 10000)
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(t)
      if (!res.ok) continue
      const d = await res.json()
      if (url.includes("ipapi.co")) {
        if (d.error) continue
        return {
          city: typeof d.city === "string" ? d.city : undefined,
          region: typeof d.region === "string" ? d.region : undefined,
          country: typeof d.country_name === "string" ? d.country_name : undefined,
          countryCode: typeof d.country_code === "string" ? d.country_code : undefined,
          latitude: typeof d.latitude === "number" ? d.latitude : undefined,
          longitude: typeof d.longitude === "number" ? d.longitude : undefined,
          source: "ip",
        }
      }
      if (url.includes("ipwho.is") && d.success) {
        return {
          city: typeof d.city === "string" ? d.city : undefined,
          region: typeof d.region === "string" ? d.region : undefined,
          country: typeof d.country === "string" ? d.country : undefined,
          countryCode: typeof d.country_code === "string" ? d.country_code : undefined,
          latitude: typeof d.latitude === "number" ? d.latitude : undefined,
          longitude: typeof d.longitude === "number" ? d.longitude : undefined,
          source: "ip",
        }
      }
    } catch {
      // try next provider
    }
  }
  return null
}

export function formatViewerLocationLabel(loc?: ViewerLocation | null): string {
  if (!loc) return "Unknown"
  const parts = [loc.city, loc.region, loc.country].filter((p): p is string => Boolean(p && String(p).trim()))
  if (parts.length) return parts.join(", ")
  if (loc.countryCode) return loc.countryCode
  return "Unknown"
}

/** Normalize Firestore map / JSON into ViewerLocation */
export function normalizeViewerLocation(raw: unknown): ViewerLocation | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const loc = raw as Record<string, unknown>
  return {
    city: typeof loc.city === "string" ? loc.city : undefined,
    region: typeof loc.region === "string" ? loc.region : undefined,
    country: typeof loc.country === "string" ? loc.country : undefined,
    countryCode: typeof loc.countryCode === "string" ? loc.countryCode : undefined,
    latitude: typeof loc.latitude === "number" ? loc.latitude : undefined,
    longitude: typeof loc.longitude === "number" ? loc.longitude : undefined,
    source: loc.source === "ip" || loc.source === "geo" ? loc.source : undefined,
  }
}

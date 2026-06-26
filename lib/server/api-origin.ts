/**
 * Origin / clone-site filtering for the API.
 *
 * All host lists are configurable via env (comma-separated) so new domains can be added
 * without code changes. The defaults preserve the previous hardcoded behavior.
 */

function fromEnv(name: string, fallback: string[]): string[] {
  const raw = process.env[name]
  if (!raw) return fallback
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Domains that must never call our API (clone / retransmit sites). */
export const BLOCKED_API_HOSTS = fromEnv("BLOCKED_API_HOSTS", [
  "intelsnipers.com",
  "www.intelsnipers.com",
])

/**
 * Browser origins allowed to call /api/* on our backend. Locked to the two production
 * frontends only. For local development, set ALLOWED_API_ORIGINS in the environment
 * (e.g. "http://localhost:3000") so you don't have to touch this list.
 */
export const ALLOWED_API_ORIGINS = fromEnv("ALLOWED_API_ORIGINS", [
  "https://sportsmagicianaudio.vercel.app",
  "https://kevionics-audio-three.vercel.app",
  "https://spa-gules-ten.vercel.app",
])

/** Hostnames that are legitimately OUR deployment (anything else = a clone). */
export const OWN_HOSTS = fromEnv("OWN_HOSTS", [
  "sportsmagicianaudio.vercel.app",
  "kevionics-audio-three.vercel.app",
  "spa-gules-ten.vercel.app",
])

function headerContainsBlockedHost(value: string | null): boolean {
  if (!value) return false
  const lower = value.toLowerCase()
  return BLOCKED_API_HOSTS.some((host) => lower.includes(host))
}

/** True when the given host is one of our own deployments. */
export function isOwnHost(host: string | null | undefined): boolean {
  const h = String(host || "").toLowerCase()
  if (!h) return false
  return OWN_HOSTS.some((own) => h === own || h.endsWith(`.${own}`) || h.includes(own))
}

/** True when Origin/Referer match a known clone domain. */
export function isBlockedApiCaller(req: Request): boolean {
  return (
    headerContainsBlockedHost(req.headers.get("origin")) ||
    headerContainsBlockedHost(req.headers.get("referer"))
  )
}

/** Browser CORS requests must come from our app origin (or no Origin for native/server). */
export function isAllowedApiOrigin(req: Request): boolean {
  if (isBlockedApiCaller(req)) return false

  const origin = req.headers.get("origin")
  if (!origin) return true

  return ALLOWED_API_ORIGINS.some(
    (allowed) => origin === allowed || origin.startsWith(`${allowed}/`),
  )
}

export function forbiddenOriginResponse(): Response {
  return new Response(JSON.stringify({ error: "Forbidden" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  })
}

/** Domains that must never call our API (clone / retransmit sites). */
export const BLOCKED_API_HOSTS = ["intelsnipers.com", "www.intelsnipers.com"]

/** Browser origins allowed to call /api/* on our backend. */
export const ALLOWED_API_ORIGINS = [
  "https://sportsmagicianaudio.vercel.app",
  "https://spa-gules-ten.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]

function headerContainsBlockedHost(value: string | null): boolean {
  if (!value) return false
  const lower = value.toLowerCase()
  return BLOCKED_API_HOSTS.some((host) => lower.includes(host))
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

import { auth } from "@/lib/firebase"
import { getAppCheckToken } from "@/lib/client/app-check"

const SESSION_STORAGE_KEY = "sessionId"

export function getLocalSessionId(): string | null {
  if (typeof window === "undefined") return null
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setLocalSessionId(sessionId: string | null) {
  if (typeof window === "undefined") return
  try {
    if (sessionId) localStorage.setItem(SESSION_STORAGE_KEY, sessionId)
    else localStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    // ignore
  }
}

/** Attach the current user's Firebase ID token — used for all secured backend API calls. */
export async function fetchWithAuth(url: string, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser
  if (!user) {
    throw new Error("You must be signed in")
  }

  const idToken = await user.getIdToken()
  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${idToken}`)
  // Vercel's external-rewrite proxy strips `Authorization` but forwards custom
  // headers, so also send the token as `X-Id-Token` (backend accepts either).
  headers.set("X-Id-Token", idToken)

  const sessionId = getLocalSessionId()
  if (sessionId) {
    headers.set("X-Session-Id", sessionId)
  }

  // Prove the request comes from our registered app/domain (no-op until App Check is configured).
  const appCheckToken = await getAppCheckToken()
  if (appCheckToken) {
    headers.set("X-Firebase-AppCheck", appCheckToken)
  }

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  return fetch(url, { ...init, headers })
}

/**
 * Pre-login fetch: attaches the App Check token but no user token. Used by endpoints that
 * run before a Firebase Auth session exists (e.g. pending-user migration on sign-in).
 */
export async function fetchWithAppCheck(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const appCheckToken = await getAppCheckToken()
  if (appCheckToken) {
    headers.set("X-Firebase-AppCheck", appCheckToken)
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  return fetch(url, { ...init, headers })
}

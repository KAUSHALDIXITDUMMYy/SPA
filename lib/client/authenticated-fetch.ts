import { auth } from "@/lib/firebase"
import { getAppCheckToken } from "@/lib/client/app-check"

const VIEWER_DEVICE_KEY = "viewerDeviceId"

/** Stable per-browser id so analytics can show this install separately from other devices. */
export function getOrCreateViewerDeviceId(): string {
  if (typeof window === "undefined") return "server"
  try {
    let id = localStorage.getItem(VIEWER_DEVICE_KEY)
    if (!id || id.length < 8) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `vd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
      localStorage.setItem(VIEWER_DEVICE_KEY, id)
    }
    return id
  } catch {
    return `vd_tmp_${Date.now().toString(36)}`
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
  headers.set("X-Viewer-Device-Id", getOrCreateViewerDeviceId())

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

import { auth } from "@/lib/firebase"

/** Attach the current user's Firebase ID token — used for all secured backend API calls. */
export async function fetchWithAuth(url: string, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser
  if (!user) {
    throw new Error("You must be signed in")
  }

  const idToken = await user.getIdToken()
  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${idToken}`)
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  return fetch(url, { ...init, headers })
}

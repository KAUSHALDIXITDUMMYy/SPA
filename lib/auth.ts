import { auth } from "./firebase"
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth"
import { fetchWithAuth, fetchWithAppCheck } from "@/lib/client/authenticated-fetch"
import type { UserTenant } from "./tenant"

export type UserRole = "admin" | "publisher" | "subscriber"

export interface UserProfile {
  uid: string
  email: string
  role: UserRole
  /** Stored on create; omitted on legacy users → inferred from @kevionics.com email. */
  tenant?: UserTenant
  displayName?: string
  zoomUserId?: string
  zoomUserEmail?: string
  createdAt: Date
  isActive: boolean
  allowChat?: boolean // Subscribers only: can chat with assigned publishers
  sessionId?: string // For single-session enforcement
  lastLoginAt?: Date
  isPending?: boolean // Flag for users created by admin but not yet logged in
  pendingPassword?: string // Temporary password storage for pending users
  termsAcceptedAt?: Date // EULA/Terms acceptance (required for app store compliance)
  blockedUserIds?: string[] // Users this person has blocked
  totpEnabled?: boolean // Subscribers: TOTP (Google Authenticator) 2FA is enabled
  mustChangePassword?: boolean // Subscribers: force a password change on next login
}

const ACCOUNT_ENDPOINT = "/api/auth/account"

async function postAccount(action: string, payload: Record<string, any> = {}) {
  const res = await fetchWithAuth(ACCOUNT_ENDPOINT, {
    method: "POST",
    body: JSON.stringify({ action, payload }),
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, json }
}

/**
 * Sign in. Firebase Auth handles the credential check on the client (so the browser gets a
 * session); all Firestore work — pending-user migration and single-session enforcement —
 * happens on the backend.
 */
export const signIn = async (email: string, password: string) => {
  try {
    // 1) Backend migrates admin-created "pending" accounts into real Auth users (no-op otherwise).
    try {
      await fetchWithAppCheck("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      })
    } catch {
      // Non-fatal: fall through to a normal sign-in attempt.
    }

    // 2) Establish the browser session.
    const result = await signInWithEmailAndPassword(auth, email, password)

    // 3) Single-session enforcement for subscribers (server-side).
    const localSessionId = typeof window !== "undefined" ? localStorage.getItem("sessionId") : null
    const { ok, json } = await postAccount("establishSession", {
      localSessionId: localSessionId || undefined,
    })
    if (ok && json.ok === false) {
      await firebaseSignOut(auth)
      return { user: null, error: json.error || "This account is already logged in elsewhere." }
    }
    if (ok && json.sessionId && typeof window !== "undefined") {
      localStorage.setItem("sessionId", json.sessionId)
    }

    return { user: result.user, error: null }
  } catch (error: any) {
    return { user: null, error: error.message }
  }
}

export const signUp = async (email: string, password: string, role: UserRole, displayName?: string) => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password)
    await postAccount("createProfile", { email: result.user.email, role, displayName })
    return { user: result.user, error: null }
  } catch (error: any) {
    return { user: null, error: error.message }
  }
}

export const signOut = async () => {
  try {
    // Clear single-session marker server-side (best-effort) while we still have a token.
    try {
      await postAccount("clearSession")
    } catch {
      // ignore; we still sign out locally
    }

    if (typeof window !== "undefined") {
      localStorage.removeItem("sessionId")
      try {
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
          const key = sessionStorage.key(i)
          if (key && key.startsWith("mfa_verified_")) sessionStorage.removeItem(key)
        }
      } catch {
        // ignore storage access errors
      }
    }

    await firebaseSignOut(auth)
    return { error: null }
  } catch (error: any) {
    return { error: error.message }
  }
}

function reviveProfile(data: any): UserProfile {
  return {
    ...data,
    createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
    lastLoginAt: data.lastLoginAt ? new Date(data.lastLoginAt) : undefined,
    termsAcceptedAt: data.termsAcceptedAt ? new Date(data.termsAcceptedAt) : undefined,
    allowChat: data.allowChat === true,
  }
}

export const getUserProfile = async (uid: string, retryCount = 0): Promise<UserProfile | null> => {
  try {
    const res = await fetchWithAuth(`/api/auth/profile?uid=${encodeURIComponent(uid)}`, {
      method: "GET",
    })
    if (res.ok) {
      const json = await res.json()
      if (json.profile) return reviveProfile(json.profile)
    }

    // Handle the pending-user migration race: the doc may not exist for a moment.
    if (retryCount < 3) {
      await new Promise((resolve) => setTimeout(resolve, 300))
      return getUserProfile(uid, retryCount + 1)
    }
    return null
  } catch (error) {
    console.error("Error fetching user profile:", error)
    if (retryCount < 3) {
      await new Promise((resolve) => setTimeout(resolve, 300))
      return getUserProfile(uid, retryCount + 1)
    }
    return null
  }
}

export const onAuthStateChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback)
}

/** Record that the user accepted the Terms/EULA. Required for app store compliance. */
export const acceptTerms = async (_uid: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const { ok, json } = await postAccount("acceptTerms")
    return ok ? { success: true } : { success: false, error: json.error }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/** Server-side heartbeat to keep a subscriber's single session alive. */
export const heartbeatSession = async (): Promise<void> => {
  try {
    await postAccount("heartbeat")
  } catch {
    // best-effort
  }
}

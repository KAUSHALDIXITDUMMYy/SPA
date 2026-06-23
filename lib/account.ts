"use client"

import { auth } from "./firebase"
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth"
import { fetchWithAuth } from "@/lib/client/authenticated-fetch"

/**
 * Let the signed-in user change their own password. Firebase requires a recent
 * login to update credentials, so we re-authenticate with the current password
 * first.
 */
export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  const user = auth.currentUser
  if (!user || !user.email) {
    return { success: false, error: "You must be signed in to change your password." }
  }
  if (newPassword.length < 6) {
    return { success: false, error: "New password must be at least 6 characters." }
  }

  try {
    const credential = EmailAuthProvider.credential(user.email, currentPassword)
    await reauthenticateWithCredential(user, credential)
    await updatePassword(user, newPassword)
    // Clear the "must change password" requirement, if it was set (server-side).
    try {
      await fetchWithAuth("/api/auth/account", {
        method: "POST",
        body: JSON.stringify({ action: "clearMustChangePassword" }),
      })
    } catch {
      // Non-fatal: the password was still changed successfully.
    }
    markPasswordChanged(user.uid)
    return { success: true }
  } catch (error: any) {
    const code = error?.code || ""
    if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
      return { success: false, error: "Your current password is incorrect." }
    }
    if (code === "auth/weak-password") {
      return { success: false, error: "New password is too weak. Use at least 6 characters." }
    }
    if (code === "auth/too-many-requests") {
      return { success: false, error: "Too many attempts. Please wait a moment and try again." }
    }
    return { success: false, error: error?.message || "Could not change password." }
  }
}

/**
 * Whether a subscriber must change their password before using the app.
 * Old accounts won't have the flag at all → they must change once. Only an
 * explicit `false` (set after a successful change) clears the requirement.
 */
export function subscriberMustChangePassword(profile: {
  role?: string
  mustChangePassword?: boolean
} | null | undefined, uid?: string): boolean {
  if (!profile || profile.role !== "subscriber") return false
  if (profile.mustChangePassword === false) return false
  if (uid && isPasswordChangedThisSession(uid)) return false
  return true
}

// ---- Per-session "password changed" flag (avoids redirect races) ----------

const pwdKey = (uid: string) => `pwd_changed_${uid}`

export function markPasswordChanged(uid: string) {
  if (typeof window !== "undefined") sessionStorage.setItem(pwdKey(uid), "1")
}

export function isPasswordChangedThisSession(uid: string): boolean {
  if (typeof window === "undefined") return false
  return sessionStorage.getItem(pwdKey(uid)) === "1"
}

"use client"

/**
 * Client helpers for the TOTP (Google Authenticator) two-factor flow.
 * All server calls are authenticated with the current user's Firebase ID token.
 */
import { auth } from "./firebase"

async function authedFetch(path: string, body?: unknown) {
  const current = auth.currentUser
  if (!current) throw new Error("You must be signed in.")
  const idToken = await current.getIdToken()
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body || {}),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

export interface MfaSetupResult {
  otpauthUrl: string
  qr: string
  secret: string
}

export async function startMfaSetup(): Promise<MfaSetupResult> {
  const { ok, data } = await authedFetch("/api/mfa/setup")
  if (!ok) throw new Error(data?.error || "Failed to start 2FA setup")
  return data as MfaSetupResult
}

export async function confirmMfaSetup(code: string): Promise<void> {
  const { ok, data } = await authedFetch("/api/mfa/enable", { code })
  if (!ok) throw new Error(data?.error || "Failed to enable 2FA")
}

export async function verifyMfaCode(code: string): Promise<{ ok: boolean; enrolled: boolean; error?: string }> {
  const { ok, data } = await authedFetch("/api/mfa/verify", { code })
  return { ok: !!data?.ok && ok, enrolled: !!data?.enrolled, error: data?.error }
}

export async function disableMfa(targetUid?: string): Promise<void> {
  const { ok, data } = await authedFetch("/api/mfa/disable", targetUid ? { targetUid } : {})
  if (!ok) throw new Error(data?.error || "Failed to disable 2FA")
}

// ---- Per-session "this browser passed 2FA" flag --------------------------

const sessionKey = (uid: string) => `mfa_verified_${uid}`

export function markMfaVerified(uid: string) {
  if (typeof window !== "undefined") sessionStorage.setItem(sessionKey(uid), "1")
}

export function isMfaVerifiedThisSession(uid: string): boolean {
  if (typeof window === "undefined") return false
  return sessionStorage.getItem(sessionKey(uid)) === "1"
}

export function clearMfaVerified(uid: string) {
  if (typeof window !== "undefined") sessionStorage.removeItem(sessionKey(uid))
}

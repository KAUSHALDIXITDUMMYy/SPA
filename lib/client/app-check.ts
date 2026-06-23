/**
 * Firebase App Check (browser only).
 *
 * App Check attests that traffic genuinely originates from *your* registered web
 * app/domain (via reCAPTCHA). When enforcement is enabled in the Firebase Console,
 * Firestore / Auth / your API reject any request without a valid App Check token —
 * which blocks clone sites (e.g. intelsnipers.com) that merely copy the public config.
 *
 * Setup:
 *   1. Firebase Console → App Check → register the web app with reCAPTCHA v3
 *      (or Enterprise) and add ONLY your real domains as allowed sites.
 *   2. Put the reCAPTCHA site key in NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY.
 *   3. (local dev) Generate a debug token in the console and set
 *      NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN so localhost can attest.
 *
 * This module is a no-op (returns null tokens) until the site key is configured,
 * so it is safe to ship before the console side is finished.
 */
import type { FirebaseApp } from "firebase/app"
import { getToken, initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from "firebase/app-check"

let appCheck: AppCheck | null = null

const SITE_KEY = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY
const DEBUG_TOKEN = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN

export function initAppCheck(app: FirebaseApp): void {
  if (typeof window === "undefined") return
  if (appCheck || !SITE_KEY) return

  if (DEBUG_TOKEN) {
    // Allow localhost / CI to obtain valid tokens without real reCAPTCHA.
    ;(self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      DEBUG_TOKEN
  }

  try {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    })
  } catch (e) {
    console.error("[app-check] init failed:", e)
  }
}

/** Returns the current App Check token, or null when App Check is not configured. */
export async function getAppCheckToken(): Promise<string | null> {
  if (!appCheck) return null
  try {
    const result = await getToken(appCheck, /* forceRefresh */ false)
    return result.token
  } catch (e) {
    console.error("[app-check] getToken failed:", e)
    return null
  }
}

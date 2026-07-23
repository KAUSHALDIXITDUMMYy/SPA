/**
 * Server-only Firebase Admin helpers. Import ONLY from API routes / server code.
 *
 * Credentials are resolved from the FIREBASE_SERVICE_ACCOUNT env var (JSON), a local
 * service-account.json file, or application default credentials as a fallback.
 */

import { existsSync, readFileSync } from "fs"
import { join } from "path"

let admin: any = null

function readServiceAccountFromDisk(): Record<string, unknown> | null {
  const candidates = [
    join(process.cwd(), "scripts", "service-account.json"),
    join(process.cwd(), "service-account.json"),
  ]
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue
    try {
      return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>
    } catch {
      return null
    }
  }
  return null
}

async function getAdmin() {
  if (admin) return admin
  admin = await import("firebase-admin")

  if (!admin.apps.length) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccount)),
      })
    } else {
      const fromDisk = readServiceAccountFromDisk()
      if (fromDisk) {
        admin.initializeApp({
          credential: admin.credential.cert(fromDisk),
          projectId: String(fromDisk.project_id || ""),
        })
      } else {
        try {
          admin.initializeApp({ credential: admin.credential.applicationDefault() })
        } catch {
          admin.initializeApp()
        }
      }
    }
  }
  return admin
}

export async function getAdminAuth() {
  const a = await getAdmin()
  return a.auth()
}

export async function getAdminDb() {
  const a = await getAdmin()
  return a.firestore()
}

export async function getAdminAppCheck() {
  const a = await getAdmin()
  return a.appCheck()
}

/**
 * Verify the Firebase App Check token in the `X-Firebase-AppCheck` header.
 *
 * Returns true when the token is valid OR when enforcement is disabled. Returns
 * false only when APPCHECK_ENFORCE === "true" and the token is missing/invalid.
 * This lets you deploy the code first, finish the Firebase Console setup, then
 * flip APPCHECK_ENFORCE=true to start rejecting clone-site traffic.
 */
export async function verifyAppCheck(req: Request): Promise<boolean> {
  if (process.env.APPCHECK_ENFORCE !== "true") return true

  const token =
    req.headers.get("x-firebase-appcheck") || req.headers.get("X-Firebase-AppCheck")
  if (!token) return false

  try {
    const appCheck = await getAdminAppCheck()
    await appCheck.verifyToken(token)
    return true
  } catch {
    return false
  }
}

/**
 * Extract the Firebase ID token from a request.
 *
 * Reads `Authorization: Bearer <token>` first, then falls back to the custom
 * `X-Id-Token` header. The fallback exists because Vercel's rewrite proxy
 * (frontend → VPS backend) strips the `Authorization` header on external
 * origins, while custom `X-*` headers are forwarded intact.
 */
function extractIdToken(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization")
  if (header && header.toLowerCase().startsWith("bearer ")) {
    const t = header.slice(7).trim()
    if (t) return t
  }
  const x = req.headers.get("x-id-token") || req.headers.get("X-Id-Token")
  if (x && x.trim()) return x.trim()
  return null
}

export interface VerifiedUser {
  uid: string
  email?: string
}

export interface VerifiedUserProfile extends VerifiedUser {
  role: "admin" | "publisher" | "subscriber"
  isActive: boolean
}

function extractSessionId(req: Request): string | null {
  const h = req.headers.get("x-session-id") || req.headers.get("X-Session-Id")
  return h && h.trim() ? h.trim() : null
}

/**
 * For subscribers, require X-Session-Id to match users/{uid}.sessionId.
 * Used after a login takeover so the previous web/app client is rejected.
 */
async function subscriberSessionMatches(uid: string, clientSessionId: string | null): Promise<boolean> {
  const db = await getAdminDb()
  const snap = await db.collection("users").doc(uid).get()
  if (!snap.exists) return false
  const data = snap.data() as { role?: string; isActive?: boolean; sessionId?: string | null }
  if (data.isActive === false) return false
  if (data.role !== "subscriber") return true
  const serverSid = data.sessionId
  if (!serverSid) return false
  return !!clientSessionId && clientSessionId === serverSid
}

/**
 * Verify a Firebase ID token sent in the Authorization: Bearer <token> header.
 * Returns the decoded user, or null when missing/invalid.
 */
export async function verifyRequestUser(req: Request): Promise<VerifiedUser | null> {
  const idToken = extractIdToken(req)
  if (!idToken) return null
  try {
    const auth = await getAdminAuth()
    const decoded = await auth.verifyIdToken(idToken)
    return { uid: decoded.uid, email: decoded.email }
  } catch {
    return null
  }
}

/** Like verifyRequestUser, but also loads the Firestore profile and rejects inactive users. */
export async function verifyRequestUserProfile(
  req: Request,
  options?: { enforceSession?: boolean },
): Promise<VerifiedUserProfile | null> {
  const idToken = extractIdToken(req)
  if (!idToken) return null
  const enforceSession = options?.enforceSession !== false

  try {
    const auth = await getAdminAuth()
    const decoded = await auth.verifyIdToken(idToken, false)
    const claimRole = decoded.role as VerifiedUserProfile["role"] | undefined

    let profile: VerifiedUserProfile | null = null

    if (claimRole === "admin" || claimRole === "publisher" || claimRole === "subscriber") {
      profile = {
        uid: decoded.uid,
        email: decoded.email,
        role: claimRole,
        isActive: true,
      }
    } else {
      const db = await getAdminDb()
      const snap = await db.collection("users").doc(decoded.uid).get()
      if (!snap.exists) return null

      const data = snap.data() as { role?: string; isActive?: boolean }
      if (data.isActive === false) return null
      if (data.role !== "admin" && data.role !== "publisher" && data.role !== "subscriber") return null

      profile = {
        uid: decoded.uid,
        email: decoded.email,
        role: data.role,
        isActive: true,
      }

      // Warm custom claims in the background so later token checks skip Firestore.
      void auth.setCustomUserClaims(decoded.uid, { role: data.role }).catch(() => {})
    }

    if (
      enforceSession &&
      profile.role === "subscriber" &&
      !(await subscriberSessionMatches(profile.uid, extractSessionId(req)))
    ) {
      return null
    }

    return profile
  } catch {
    return null
  }
}

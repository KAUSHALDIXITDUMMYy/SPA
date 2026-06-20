/**
 * Server-only Firebase Admin helpers. Import ONLY from API routes / server code.
 *
 * Credentials are resolved from the FIREBASE_SERVICE_ACCOUNT env var (JSON), or
 * application default credentials as a fallback (Cloud / Firebase hosting).
 */

let admin: any = null

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
      try {
        admin.initializeApp({ credential: admin.credential.applicationDefault() })
      } catch {
        admin.initializeApp()
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

export interface VerifiedUser {
  uid: string
  email?: string
}

/**
 * Verify a Firebase ID token sent in the Authorization: Bearer <token> header.
 * Returns the decoded user, or null when missing/invalid.
 */
export async function verifyRequestUser(req: Request): Promise<VerifiedUser | null> {
  const header = req.headers.get("authorization") || req.headers.get("Authorization")
  if (!header || !header.toLowerCase().startsWith("bearer ")) return null
  const idToken = header.slice(7).trim()
  if (!idToken) return null
  try {
    const auth = await getAdminAuth()
    const decoded = await auth.verifyIdToken(idToken)
    return { uid: decoded.uid, email: decoded.email }
  } catch {
    return null
  }
}

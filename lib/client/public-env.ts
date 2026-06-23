/**
 * Browser-safe Firebase configuration, sourced entirely from environment variables.
 *
 * IMPORTANT: these NEXT_PUBLIC_* values are inlined into the client bundle at build time
 * and are visible to anyone. That is expected — the Firebase web "apiKey" is an identifier,
 * not a secret. Database security comes from Firestore Rules + backend (Admin SDK) access,
 * NOT from hiding these values.
 *
 * There is deliberately NO hardcoded fallback config: a missing env var throws a clear
 * error so a build can never silently point at the wrong (e.g. old/compromised) project.
 */

function requiredPublic(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required public environment variable: ${name}. ` +
        `Set all NEXT_PUBLIC_FIREBASE_* values in your environment (.env.local for dev, ` +
        `project settings for production). See .env.example.`,
    )
  }
  return value
}

export const publicFirebaseConfig = {
  apiKey: requiredPublic("NEXT_PUBLIC_FIREBASE_API_KEY", process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  authDomain: requiredPublic(
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  ),
  projectId: requiredPublic(
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  ),
  storageBucket: requiredPublic(
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  ),
  messagingSenderId: requiredPublic(
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  ),
  appId: requiredPublic("NEXT_PUBLIC_FIREBASE_APP_ID", process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

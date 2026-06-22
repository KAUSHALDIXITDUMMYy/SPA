/**
 * Browser-safe configuration only. Never put secrets here — use server env vars instead.
 */

/** Used when .env.local is not configured (local dev / CI build). */
export const devFirebaseFallback = {
  apiKey: "AIzaSyDnSdq0hxP0xmrZT-QuBM8Gfh2jeKj0QT0",
  authDomain: "sportsmagician-audio.firebaseapp.com",
  projectId: "sportsmagician-audio",
  storageBucket: "sportsmagician-audio.firebasestorage.app",
  messagingSenderId: "527934608433",
  appId: "1:527934608433:web:95d450cb32e2f1513fb110",
  measurementId: "G-CMEYMHRY34",
}

function requiredPublic(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing public environment variable: ${name}`)
  }
  return value
}

function hasPublicFirebaseEnv(): boolean {
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  return key != null && key !== ""
}

export const publicFirebaseConfig = hasPublicFirebaseEnv()
  ? {
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
  : devFirebaseFallback

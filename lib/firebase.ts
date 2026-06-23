import { initializeApp } from "firebase/app"
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth"
import { getFirestore } from "firebase/firestore"
import { publicFirebaseConfig } from "@/lib/client/public-env"
import { initAppCheck } from "@/lib/client/app-check"

const app = initializeApp(publicFirebaseConfig)

// Attest that requests come from our registered domains (blocks clone sites).
// No-op until NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY is configured.
initAppCheck(app)

export const auth = getAuth(app)

setPersistence(auth, browserLocalPersistence).catch((e) => {
  console.error("[firebase] setPersistence failed:", e)
})

export const db = getFirestore(app)
export default app

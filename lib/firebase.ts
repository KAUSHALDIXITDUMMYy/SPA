import { initializeApp } from "firebase/app"
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth"
import { getFirestore } from "firebase/firestore"
import { publicFirebaseConfig } from "@/lib/client/public-env"

const app = initializeApp(publicFirebaseConfig)
export const auth = getAuth(app)

setPersistence(auth, browserLocalPersistence).catch((e) => {
  console.error("[firebase] setPersistence failed:", e)
})

export const db = getFirestore(app)
export default app

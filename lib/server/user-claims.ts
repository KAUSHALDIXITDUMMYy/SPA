import { getAdminAuth } from "@/lib/firebase-admin"
import type { UserRole } from "@/lib/auth"

/** Sync role into Firebase Auth custom claims so token verification avoids extra Firestore reads. */
export async function syncUserRoleClaim(uid: string, role: UserRole): Promise<void> {
  const auth = await getAdminAuth()
  await auth.setCustomUserClaims(uid, { role })
}

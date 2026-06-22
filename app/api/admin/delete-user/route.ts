import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/firebase"
import { doc, getDoc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore"
import { adminCanManageTargetUser } from "@/lib/tenant"
import { getAdminAuth } from "@/lib/firebase-admin"
import { requireAdmin } from "@/lib/server/api-auth"

/** Delete all docs in a collection matching field == value. */
async function deleteWhere(collectionName: string, field: string, value: string) {
  try {
    const snap = await getDocs(query(collection(db, collectionName), where(field, "==", value)))
    await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, collectionName, d.id)).catch(() => {})))
  } catch {
    // ignore cleanup errors for missing collections / rules
  }
}

export async function POST(req: NextRequest) {
  try {
    const profile = await requireAdmin(req)
    if (profile instanceof NextResponse) return profile

    const { userId, adminId } = await req.json()

    if (!userId) {
      return NextResponse.json({ success: false, error: "User ID is required" }, { status: 400 })
    }
    if (adminId && adminId !== profile.uid) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const adminSnap = await getDoc(doc(db, "users", profile.uid))
    if (!adminSnap.exists() || adminSnap.data().role !== "admin") {
      return NextResponse.json({ success: false, error: "Unauthorized: Admin access required" }, { status: 403 })
    }

    // Load target user.
    const userRef = doc(db, "users", userId)
    const userSnap = await getDoc(userRef)
    if (!userSnap.exists()) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
    }
    const userData = userSnap.data()

    if (profile.uid === userId) {
      return NextResponse.json({ success: false, error: "You cannot delete your own account." }, { status: 400 })
    }

    if (!adminCanManageTargetUser(adminSnap.data() as any, userData as any)) {
      return NextResponse.json(
        { success: false, error: "You do not have permission to delete this user." },
        { status: 403 },
      )
    }

    let authDeleted = false
    let authNote = ""

    // Delete the Firebase Auth account (only exists once they've logged in at least once).
    if (!userData.isPending && userData.email) {
      try {
        const auth = await getAdminAuth()
        if (auth) {
          try {
            const authUser = await auth.getUserByEmail(userData.email)
            await auth.deleteUser(authUser.uid)
            authDeleted = true
          } catch (e: any) {
            if (e?.code === "auth/user-not-found") {
              authDeleted = true // nothing to delete in Auth
            } else {
              throw e
            }
          }
        } else {
          authNote =
            " Note: the sign-in (Auth) account could not be removed because Firebase Admin is not configured, so this person may still be able to sign in. Set FIREBASE_SERVICE_ACCOUNT to fully delete accounts."
        }
      } catch (e: any) {
        authNote = ` Note: could not delete the sign-in account (${e?.message || "unknown error"}).`
      }
    } else {
      authDeleted = true // pending users have no Auth account yet
    }

    // Remove related data, then the profile document.
    await Promise.all([
      deleteWhere("streamPermissions", "subscriberId", userId),
      deleteWhere("streamPermissions", "publisherId", userId),
      deleteWhere("streamAssignments", "subscriberId", userId),
      deleteWhere("zoomPublisherAssignments", "subscriberId", userId),
      deleteWhere("zoomCallAssignments", "subscriberId", userId),
    ])
    await deleteDoc(doc(db, "mfaSecrets", userId)).catch(() => {})
    await deleteDoc(userRef)

    return NextResponse.json({
      success: true,
      authDeleted,
      message: `User ${userData.email} deleted.${authNote}`,
    })
  } catch (error: any) {
    console.error("Error deleting user:", error)
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete user" },
      { status: 500 },
    )
  }
}

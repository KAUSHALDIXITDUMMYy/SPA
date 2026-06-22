import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/firebase"
import { doc, getDoc, updateDoc } from "firebase/firestore"
import { adminCanManageTargetUser } from "@/lib/tenant"
import { syncUserRoleClaim } from "@/lib/server/user-claims"
import { getAdminAuth } from "@/lib/firebase-admin"
import { requireAdmin } from "@/lib/server/api-auth"

export async function POST(req: NextRequest) {
  try {
    const profile = await requireAdmin(req)
    if (profile instanceof NextResponse) return profile

    const body = await req.json()
    const { userId, newPassword, adminId } = body

    if (!userId || !newPassword) {
      return NextResponse.json(
        { success: false, error: "User ID and new password are required" },
        { status: 400 },
      )
    }

    if (adminId && adminId !== profile.uid) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const adminUserRef = doc(db, "users", profile.uid)
    const adminUserSnap = await getDoc(adminUserRef)

    if (!adminUserSnap.exists()) {
      return NextResponse.json({ success: false, error: "Admin user not found" }, { status: 404 })
    }

    const adminUserData = adminUserSnap.data()
    if (adminUserData.role !== "admin") {
      return NextResponse.json({ success: false, error: "Unauthorized: Admin access required" }, { status: 403 })
    }

    const userRef = doc(db, "users", userId)
    const userSnap = await getDoc(userRef)

    if (!userSnap.exists()) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
    }

    const userData = userSnap.data()

    if (!adminCanManageTargetUser(adminUserData as any, userData as any)) {
      return NextResponse.json(
        { success: false, error: "You do not have permission to reset this user's password." },
        { status: 403 },
      )
    }

    if (userData.role === "subscriber") {
      await updateDoc(userRef, { mustChangePassword: true })
    }

    if (userData.isPending) {
      await updateDoc(userRef, {
        pendingPassword: newPassword,
      })

      return NextResponse.json({
        success: true,
        message: "Password updated for pending user. They will use this password on first login.",
      })
    }

    try {
      const auth = await getAdminAuth()

      if (!auth) {
        await updateDoc(userRef, {
          pendingPassword: newPassword,
        })
        return NextResponse.json({
          success: true,
          message:
            "Password updated in database. Configure FIREBASE_SERVICE_ACCOUNT to reset passwords for users who have already signed in.",
        })
      }

      let firebaseAuthUser
      try {
        firebaseAuthUser = await auth.getUserByEmail(userData.email)
      } catch (error: any) {
        if (error.code === "auth/user-not-found") {
          await updateDoc(userRef, {
            pendingPassword: newPassword,
          })
          return NextResponse.json({
            success: true,
            message: "Password updated. User will use this password on next login.",
          })
        }
        throw error
      }

      await auth.updateUser(firebaseAuthUser.uid, {
        password: newPassword,
      })

      if (userData.role === "admin" || userData.role === "publisher" || userData.role === "subscriber") {
        void syncUserRoleClaim(firebaseAuthUser.uid, userData.role).catch(() => {})
      }

      return NextResponse.json({
        success: true,
        message: "Password reset successfully",
      })
    } catch (error: any) {
      console.error("Error resetting password:", error)

      if (error.message?.includes("firebase-admin") || error.message?.includes("Admin SDK") || !error.code) {
        await updateDoc(userRef, {
          pendingPassword: newPassword,
        })
        return NextResponse.json({
          success: true,
          message:
            "Password updated in database. Configure FIREBASE_SERVICE_ACCOUNT for full password reset support.",
        })
      }

      return NextResponse.json(
        { success: false, error: error.message || "Failed to reset password" },
        { status: 500 },
      )
    }
  } catch (error: any) {
    console.error("Error in reset password API:", error)
    return NextResponse.json({ success: false, error: error.message || "Internal server error" }, { status: 500 })
  }
}

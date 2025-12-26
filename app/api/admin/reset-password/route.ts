import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/firebase"
import { doc, getDoc, updateDoc, query, where, getDocs, collection } from "firebase/firestore"

// Initialize Firebase Admin SDK
let admin: any = null
let adminAuth: any = null

async function getAdminAuth() {
  if (adminAuth) return adminAuth

  try {
    // Dynamically import firebase-admin
    admin = await import("firebase-admin")
    
    if (!admin.apps.length) {
      // Initialize with service account or use default credentials
      // For production, you should use environment variables for the service account
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
      
      if (serviceAccount) {
        // If service account JSON is provided as env variable
        const serviceAccountJson = JSON.parse(serviceAccount)
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccountJson),
        })
      } else {
        // Try to use default credentials (for Firebase hosting/Cloud Functions)
        // Or use application default credentials
        try {
          admin.initializeApp({
            credential: admin.credential.applicationDefault(),
          })
        } catch (e) {
          // Fallback: Initialize without credentials (will use environment variables)
          admin.initializeApp()
        }
      }
    }
    
    adminAuth = admin.auth()
    return adminAuth
  } catch (error: any) {
    // If firebase-admin is not installed, return null
    if (error.code === "MODULE_NOT_FOUND" || error.message?.includes("Cannot find module")) {
      console.warn("Firebase Admin SDK not installed. Password reset will work for pending users only.")
      return null
    }
    console.error("Error initializing Firebase Admin:", error)
    throw new Error("Failed to initialize Firebase Admin SDK. Please ensure firebase-admin is installed and configured.")
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, newPassword, adminId } = body

    if (!userId || !newPassword) {
      return NextResponse.json(
        { success: false, error: "User ID and new password are required" },
        { status: 400 }
      )
    }

    // Verify admin is making the request
    if (!adminId) {
      return NextResponse.json(
        { success: false, error: "Admin authentication required" },
        { status: 401 }
      )
    }

    // Verify the requester is an admin
    const adminUserRef = doc(db, "users", adminId)
    const adminUserSnap = await getDoc(adminUserRef)
    
    if (!adminUserSnap.exists()) {
      return NextResponse.json(
        { success: false, error: "Admin user not found" },
        { status: 404 }
      )
    }

    const adminUserData = adminUserSnap.data()
    if (adminUserData.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Admin access required" },
        { status: 403 }
      )
    }

    // Get the target user
    const userRef = doc(db, "users", userId)
    const userSnap = await getDoc(userRef)

    if (!userSnap.exists()) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      )
    }

    const userData = userSnap.data()

    // Check if user is pending (not yet created in Firebase Auth)
    if (userData.isPending) {
      // For pending users, just update the pendingPassword in Firestore
      await updateDoc(userRef, {
        pendingPassword: newPassword,
      })

      return NextResponse.json({
        success: true,
        message: "Password updated for pending user. They will use this password on first login.",
      })
    }

    // For existing users, use Firebase Admin SDK to update password
    try {
      const auth = await getAdminAuth()
      
      // If Admin SDK is not available, fallback to updating pendingPassword
      if (!auth) {
        await updateDoc(userRef, {
          pendingPassword: newPassword,
        })
        return NextResponse.json({
          success: true,
          message: "Password updated in database. Note: Firebase Admin SDK is not installed. For existing users who have already logged in, install firebase-admin package and configure it to reset their passwords.",
        })
      }
      
      // Find the user by email in Firebase Auth
      let firebaseAuthUser
      try {
        firebaseAuthUser = await auth.getUserByEmail(userData.email)
      } catch (error: any) {
        // If user doesn't exist in Auth yet, update pendingPassword
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

      // Update password using Admin SDK
      await auth.updateUser(firebaseAuthUser.uid, {
        password: newPassword,
      })

      return NextResponse.json({
        success: true,
        message: "Password reset successfully",
      })
    } catch (error: any) {
      console.error("Error resetting password:", error)
      
      // If Admin SDK is not available, fallback to updating pendingPassword
      if (error.message?.includes("firebase-admin") || error.message?.includes("Admin SDK") || !error.code) {
        await updateDoc(userRef, {
          pendingPassword: newPassword,
        })
        return NextResponse.json({
          success: true,
          message: "Password updated in database. Note: Firebase Admin SDK is not configured. For existing users, they may need to use password reset email instead.",
        })
      }

      return NextResponse.json(
        { success: false, error: error.message || "Failed to reset password" },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error("Error in reset password API:", error)
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}


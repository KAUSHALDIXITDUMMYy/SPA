import { db } from "./firebase"
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, orderBy, setDoc } from "firebase/firestore"
import { type UserRole } from "./auth"

export interface StreamPermission {
  id?: string
  subscriberId: string
  publisherId: string
  allowVideo: boolean
  allowAudio: boolean
  createdAt: Date
  isActive: boolean
}

export interface StreamSession {
  id?: string
  publisherId: string
  publisherName: string
  roomId: string
  isActive: boolean
  createdAt: Date
  endedAt?: Date
  title?: string
  description?: string
}

export interface StreamAssignment {
  id?: string
  subscriberId: string
  streamSessionId: string
  createdAt: Date
  isActive: boolean
}

export const createUser = async (email: string, password: string, role: UserRole, displayName?: string) => {
  try {
    // Create user ONLY in Firestore database (not in Firebase Auth yet)
    // They will be created in Auth when they log in for the first time
    
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return { user: null, error: "Please enter a valid email address" }
    }

    // Check if user already exists in Firestore (case-insensitive)
    const usersRef = collection(db, "users")
    const q = query(usersRef, where("email", "==", normalizedEmail))
    const existingUsers = await getDocs(q)
    
    if (!existingUsers.empty) {
      return { user: null, error: "A user with this email already exists" }
    }

    // Generate a unique ID for the pending user
    const pendingUserId = `pending_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    
    // Create user profile in Firestore with pending status
    const userProfile = {
      uid: pendingUserId, // Temporary ID until they log in
      email: normalizedEmail,
      role,
      displayName: displayName || email.split("@")[0],
      createdAt: new Date(),
      isActive: true,
      isPending: true, // Flag indicating they need to log in to activate
      pendingPassword: password, // Store password temporarily (will be removed on first login)
    }

    await setDoc(doc(db, "users", pendingUserId), userProfile)

    return { 
      user: { uid: pendingUserId, email } as any, 
      error: null,
      message: "User created successfully. They can now log in with their credentials."
    }
  } catch (error: any) {
    return { user: null, error: error.message }
  }
}

export const getAllUsers = async () => {
  try {
    const usersRef = collection(db, "users")
    const q = query(usersRef, orderBy("createdAt", "desc"))
    const querySnapshot = await getDocs(q)

    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
  } catch (error) {
    console.error("Error fetching users:", error)
    return []
  }
}

export const getUsersByRole = async (role: UserRole) => {
  try {
    const usersRef = collection(db, "users")
    const q = query(usersRef, where("role", "==", role))
    const querySnapshot = await getDocs(q)

    const users = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))

    // Sort by createdAt in memory to avoid composite index
    return users.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } catch (error) {
    console.error("Error fetching users by role:", error)
    return []
  }
}

export const updateUserStatus = async (userId: string, isActive: boolean) => {
  try {
    const userRef = doc(db, "users", userId)
    await updateDoc(userRef, { isActive })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export const updateUserChatPermission = async (userId: string, allowChat: boolean) => {
  try {
    const userRef = doc(db, "users", userId)
    await updateDoc(userRef, { allowChat })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export const updatePublisherZoomMapping = async (userId: string, updates: { zoomUserId?: string; zoomUserEmail?: string }) => {
  try {
    const userRef = doc(db, "users", userId)
    await updateDoc(userRef, updates as any)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export const createStreamPermission = async (permission: Omit<StreamPermission, "id" | "createdAt">) => {
  try {
    const permissionData = {
      ...permission,
      createdAt: new Date(),
    }

    const docRef = await addDoc(collection(db, "streamPermissions"), permissionData)
    return { success: true, id: docRef.id }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export const getStreamPermissions = async () => {
  try {
    const permissionsRef = collection(db, "streamPermissions")
    const q = query(permissionsRef)
    const querySnapshot = await getDocs(q)

    const permissions = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as StreamPermission[]

    // Sort by createdAt in memory to avoid composite index
    return permissions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } catch (error) {
    console.error("Error fetching stream permissions:", error)
    return []
  }
}

export const updateStreamPermission = async (permissionId: string, updates: Partial<StreamPermission>) => {
  try {
    const permissionRef = doc(db, "streamPermissions", permissionId)
    await updateDoc(permissionRef, updates)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export const deleteStreamPermission = async (permissionId: string) => {
  try {
    await deleteDoc(doc(db, "streamPermissions", permissionId))
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export const logoutAllUsers = async () => {
  try {
    // Get all users
    const usersRef = collection(db, "users")
    const querySnapshot = await getDocs(usersRef)
    
    // Clear sessionId for all users
    const updatePromises: Promise<void>[] = []
    querySnapshot.docs.forEach((userDoc) => {
      const userData = userDoc.data()
      if (userData.sessionId) {
        updatePromises.push(
          updateDoc(doc(db, "users", userDoc.id), {
            sessionId: null,
          })
        )
      }
    })
    
    await Promise.all(updatePromises)
    
    return { success: true, count: updatePromises.length }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export const resetUserPassword = async (userId: string, newPassword: string, adminId: string) => {
  try {
    const response = await fetch("/api/admin/reset-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId,
        newPassword,
        adminId,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return { success: false, error: data.error || "Failed to reset password" }
    }

    return { success: true, message: data.message }
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to reset password" }
  }
}

// Stream Assignment Functions
export const createStreamAssignment = async (assignment: Omit<StreamAssignment, "id" | "createdAt">) => {
  try {
    const assignmentData = {
      ...assignment,
      createdAt: new Date(),
    }

    const docRef = await addDoc(collection(db, "streamAssignments"), assignmentData)
    return { success: true, id: docRef.id }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export const getStreamAssignments = async () => {
  try {
    const assignmentsRef = collection(db, "streamAssignments")
    const q = query(assignmentsRef)
    const querySnapshot = await getDocs(q)

    const assignments = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as StreamAssignment[]

    return assignments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } catch (error) {
    console.error("Error fetching stream assignments:", error)
    return []
  }
}

export const deleteStreamAssignment = async (assignmentId: string) => {
  try {
    await deleteDoc(doc(db, "streamAssignments", assignmentId))
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export const updateStreamAssignment = async (assignmentId: string, updates: Partial<StreamAssignment>) => {
  try {
    const assignmentRef = doc(db, "streamAssignments", assignmentId)
    await updateDoc(assignmentRef, updates)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
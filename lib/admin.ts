import { db } from "./firebase"
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, orderBy, setDoc, arrayUnion, onSnapshot, type Unsubscribe } from "firebase/firestore"
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

// Contact messages (from Contact Us page)
export interface ContactMessage {
  id?: string
  name: string
  email: string
  subject: string
  message: string
  createdAt: Date
  read?: boolean
}

export const getContactMessages = async () => {
  try {
    const ref = collection(db, "contactMessages")
    const q = query(ref, orderBy("createdAt", "desc"))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.() ?? d.data().createdAt,
    })) as ContactMessage[]
  } catch (error) {
    console.error("Error fetching contact messages:", error)
    return []
  }
}

export const markContactMessageRead = async (messageId: string) => {
  try {
    const messageRef = doc(db, "contactMessages", messageId)
    await updateDoc(messageRef, { read: true })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/** Broadcast messages from admin to subscribers who have at least one publisher or stream assignment */
export interface AdminBroadcast {
  id?: string
  message: string
  createdAt: Date
  createdByUid: string
  createdByName?: string
}

export const createAdminBroadcast = async (
  message: string,
  createdByUid: string,
  createdByName?: string
): Promise<{ success: boolean; id?: string; error?: string }> => {
  const trimmed = message.trim()
  if (!trimmed) {
    return { success: false, error: "Message cannot be empty" }
  }
  try {
    const docRef = await addDoc(collection(db, "adminBroadcasts"), {
      message: trimmed,
      createdAt: new Date(),
      createdByUid,
      createdByName: createdByName?.trim() || undefined,
    })
    return { success: true, id: docRef.id }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export const getAdminBroadcasts = async (): Promise<AdminBroadcast[]> => {
  try {
    const ref = collection(db, "adminBroadcasts")
    const q = query(ref, orderBy("createdAt", "desc"))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        message: data.message,
        createdByUid: data.createdByUid,
        createdByName: data.createdByName,
        createdAt: data.createdAt?.toDate?.() ?? data.createdAt,
      }
    }) as AdminBroadcast[]
  } catch (error) {
    console.error("Error fetching admin broadcasts:", error)
    return []
  }
}

/** Real-time list of admin broadcasts (newest first). */
export const subscribeAdminBroadcasts = (onUpdate: (items: AdminBroadcast[]) => void): Unsubscribe => {
  const ref = collection(db, "adminBroadcasts")
  const q = query(ref, orderBy("createdAt", "desc"))
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          message: data.message,
          createdByUid: data.createdByUid,
          createdByName: data.createdByName,
          createdAt: data.createdAt?.toDate?.() ?? data.createdAt,
        }
      }) as AdminBroadcast[]
      onUpdate(items)
    },
    (err) => {
      console.error("subscribeAdminBroadcasts:", err)
      onUpdate([])
    }
  )
}

// Reports (flag content/users) – app store compliance
export type ReportStatus = "pending" | "resolved"

export interface Report {
  id?: string
  reporterId: string
  reporterName: string
  reporterEmail?: string
  reportedUserId?: string
  reportedUserName?: string
  contentType: "user" | "chat_message" | "stream" | "other"
  contentId?: string
  reason: string
  details?: string
  createdAt: Date
  status: ReportStatus
  resolvedAt?: Date
  resolvedBy?: string
}

export const createReport = async (report: Omit<Report, "id" | "createdAt" | "status">) => {
  try {
    const docRef = await addDoc(collection(db, "reports"), {
      ...report,
      createdAt: new Date(),
      status: "pending",
    })
    return { success: true, id: docRef.id }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export const getReports = async () => {
  try {
    const ref = collection(db, "reports")
    const q = query(ref, orderBy("createdAt", "desc"))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() ?? data.createdAt,
        resolvedAt: data.resolvedAt?.toDate?.() ?? data.resolvedAt,
      }
    }) as Report[]
  } catch (error) {
    console.error("Error fetching reports:", error)
    return []
  }
}

export const resolveReport = async (reportId: string, resolvedBy: string) => {
  try {
    const reportRef = doc(db, "reports", reportId)
    await updateDoc(reportRef, {
      status: "resolved",
      resolvedAt: new Date(),
      resolvedBy,
    })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// Block events (notify admin when someone is blocked)
export interface BlockEvent {
  id?: string
  blockerId: string
  blockerName: string
  blockedUserId: string
  blockedUserName: string
  createdAt: Date
}

export const addBlockEvent = async (event: Omit<BlockEvent, "id" | "createdAt">) => {
  try {
    await addDoc(collection(db, "blockEvents"), {
      ...event,
      createdAt: new Date(),
    })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export const getBlockEvents = async () => {
  try {
    const ref = collection(db, "blockEvents")
    const q = query(ref, orderBy("createdAt", "desc"))
    const snapshot = await getDocs(q)
    return snapshot.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() ?? data.createdAt,
      }
    }) as BlockEvent[]
  } catch (error) {
    console.error("Error fetching block events:", error)
    return []
  }
}

/** Block a user (add to blocker's blockedUserIds and notify admin). Call from client with current user. */
export const blockUser = async (
  blockerId: string,
  blockerName: string,
  blockedUserId: string,
  blockedUserName: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const userRef = doc(db, "users", blockerId)
    await updateDoc(userRef, {
      blockedUserIds: arrayUnion(blockedUserId),
    })
    await addBlockEvent({
      blockerId,
      blockerName,
      blockedUserId,
      blockedUserName,
    })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
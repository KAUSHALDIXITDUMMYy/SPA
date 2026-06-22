import { db } from "./firebase"
import { onSnapshot, collection, query, where } from "firebase/firestore"
import type { StreamPermission } from "./admin"

export interface PermissionWithDetails extends StreamPermission {
  publisherName: string
  subscriberName: string
  publisherEmail: string
  subscriberEmail: string
}

export class PermissionsManager {
  private static instance: PermissionsManager
  private listeners: Map<string, () => void> = new Map()

  static getInstance(): PermissionsManager {
    if (!PermissionsManager.instance) {
      PermissionsManager.instance = new PermissionsManager()
    }
    return PermissionsManager.instance
  }

  subscribeToUserPermissions(subscriberId: string, callback: (permissions: StreamPermission[]) => void): () => void {
    const permissionsRef = collection(db, "streamPermissions")
    const q = query(permissionsRef, where("subscriberId", "==", subscriberId), where("isActive", "==", true))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const permissions = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as StreamPermission[]

      // Sort by createdAt in memory to avoid composite index
      permissions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      callback(permissions)
    })

    const listenerId = `user-${subscriberId}`
    this.listeners.set(listenerId, unsubscribe)
    return unsubscribe
  }

  subscribeToAllPermissions(callback: (permissions: StreamPermission[]) => void): () => void {
    const permissionsRef = collection(db, "streamPermissions")
    const q = query(permissionsRef)

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const permissions = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as StreamPermission[]

      // Sort by createdAt in memory to avoid composite index
      permissions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      callback(permissions)
    })

    const listenerId = "admin-all"
    this.listeners.set(listenerId, unsubscribe)
    return unsubscribe
  }

  // Check if user has permission to access a specific stream
  async checkStreamAccess(
    subscriberId: string,
    publisherId: string,
  ): Promise<{ hasAccess: boolean; permission?: StreamPermission }> {
    try {
      const permissionsRef = collection(db, "streamPermissions")
      const q = query(
        permissionsRef,
        where("subscriberId", "==", subscriberId),
        where("publisherId", "==", publisherId),
        where("isActive", "==", true),
      )

      return new Promise((resolve) => {
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const permissions = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as StreamPermission[]

          if (permissions.length > 0) {
            resolve({ hasAccess: true, permission: permissions[0] })
          } else {
            resolve({ hasAccess: false })
          }
          unsubscribe()
        })
      })
    } catch (error) {
      console.error("Error checking stream access:", error)
      return { hasAccess: false }
    }
  }

  // Cleanup all listeners
  cleanup(): void {
    this.listeners.forEach((unsubscribe) => unsubscribe())
    this.listeners.clear()
  }

  // Remove specific listener
  removeListener(listenerId: string): void {
    const unsubscribe = this.listeners.get(listenerId)
    if (unsubscribe) {
      unsubscribe()
      this.listeners.delete(listenerId)
    }
  }
}

export const permissionsManager = PermissionsManager.getInstance()

// Permission validation utilities
export const validateStreamPermission = (permission: StreamPermission, action: "video" | "audio"): boolean => {
  if (!permission.isActive) return false

  switch (action) {
    case "video":
      return permission.allowVideo
    case "audio":
      return permission.allowAudio
    default:
      return false
  }
}

export const getPermissionSummary = (permission: StreamPermission): string => {
  const permissions = []
  if (permission.allowVideo) permissions.push("Video")
  if (permission.allowAudio) permissions.push("Audio")

  if (permissions.length === 0) return "No access"
  if (permissions.length === 2) return "Full access"
  return permissions.join(", ") + " only"
}

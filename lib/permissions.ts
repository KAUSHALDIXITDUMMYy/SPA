import { fetchWithAuth } from "@/lib/client/authenticated-fetch"
import { PAGE_SIZE, type PaginatedResult } from "@/lib/pagination"
import type { StreamPermission } from "./admin"

const ENDPOINT = "/api/subscriber"

export interface PermissionWithDetails extends StreamPermission {
  publisherName: string
  subscriberName: string
  publisherEmail: string
  subscriberEmail: string
}

async function getPermissions(params: Record<string, string>): Promise<StreamPermission[]> {
  try {
    const qs = new URLSearchParams(params).toString()
    const res = await fetchWithAuth(`${ENDPOINT}?${qs}`, { method: "GET" })
    if (!res.ok) return []
    const json = await res.json()
    return (json.permissions || json.items || []) as StreamPermission[]
  } catch (error) {
    console.error("Error fetching permissions:", error)
    return []
  }
}

export async function getAllPermissionsPage(
  cursor?: string | null,
): Promise<PaginatedResult<StreamPermission>> {
  try {
    const qs = new URLSearchParams({
      type: "allPermissions",
      limit: String(PAGE_SIZE),
    })
    if (cursor) qs.set("cursor", cursor)
    const res = await fetchWithAuth(`${ENDPOINT}?${qs.toString()}`, { method: "GET" })
    if (!res.ok) return { items: [], nextCursor: null, hasMore: false }
    const json = await res.json()
    return {
      items: (json.items || []) as StreamPermission[],
      nextCursor: (json.nextCursor as string | null) ?? null,
      hasMore: Boolean(json.hasMore),
    }
  } catch (error) {
    console.error("Error fetching permissions page:", error)
    return { items: [], nextCursor: null, hasMore: false }
  }
}

export async function getPermissionsForSubscriberIds(
  subscriberIds: string[],
): Promise<StreamPermission[]> {
  if (!subscriberIds.length) return []
  try {
    const qs = new URLSearchParams({
      type: "permissionsForSubscribers",
      subscriberIds: subscriberIds.join(","),
    })
    const res = await fetchWithAuth(`${ENDPOINT}?${qs.toString()}`, { method: "GET" })
    if (!res.ok) return []
    const json = await res.json()
    return (json.permissions || []) as StreamPermission[]
  } catch (error) {
    console.error("Error fetching permissions for subscribers:", error)
    return []
  }
}

/**
 * Backend-backed permissions access. The old Firestore realtime listeners are replaced
 * with short polling; the public API (subscribe*, checkStreamAccess, cleanup) is preserved.
 */
export class PermissionsManager {
  private static instance: PermissionsManager
  private listeners: Map<string, () => void> = new Map()

  static getInstance(): PermissionsManager {
    if (!PermissionsManager.instance) {
      PermissionsManager.instance = new PermissionsManager()
    }
    return PermissionsManager.instance
  }

  subscribeToUserPermissions(
    subscriberId: string,
    callback: (permissions: StreamPermission[]) => void,
  ): () => void {
    let active = true
    const poll = async () => {
      const permissions = await getPermissions({ type: "userPermissions", subscriberId })
      if (active) callback(permissions)
    }
    void poll()
    const interval = setInterval(poll, 8000)
    const unsubscribe = () => {
      active = false
      clearInterval(interval)
    }
    this.listeners.set(`user-${subscriberId}`, unsubscribe)
    return unsubscribe
  }

  subscribeToAllPermissions(callback: (permissions: StreamPermission[]) => void): () => void {
    let active = true
    const poll = async () => {
      const page = await getAllPermissionsPage()
      if (active) callback(page.items)
    }
    void poll()
    const interval = setInterval(poll, 8000)
    const unsubscribe = () => {
      active = false
      clearInterval(interval)
    }
    this.listeners.set("admin-all", unsubscribe)
    return unsubscribe
  }

  async checkStreamAccess(
    subscriberId: string,
    publisherId: string,
  ): Promise<{ hasAccess: boolean; permission?: StreamPermission }> {
    try {
      const qs = new URLSearchParams({ type: "checkAccess", subscriberId, publisherId }).toString()
      const res = await fetchWithAuth(`${ENDPOINT}?${qs}`, { method: "GET" })
      if (!res.ok) return { hasAccess: false }
      return (await res.json()) as { hasAccess: boolean; permission?: StreamPermission }
    } catch (error) {
      console.error("Error checking stream access:", error)
      return { hasAccess: false }
    }
  }

  cleanup(): void {
    this.listeners.forEach((unsubscribe) => unsubscribe())
    this.listeners.clear()
  }

  removeListener(listenerId: string): void {
    const unsubscribe = this.listeners.get(listenerId)
    if (unsubscribe) {
      unsubscribe()
      this.listeners.delete(listenerId)
    }
  }
}

export const permissionsManager = PermissionsManager.getInstance()

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
  return permissions.length > 0 ? permissions.join(", ") : "No permissions"
}

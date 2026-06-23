import { fetchWithAuth } from "@/lib/client/authenticated-fetch"
import { type UserProfile, type UserRole } from "./auth"
import { parseStreamSessions, type StreamSession as StreamingSession } from "./streaming"
import { type UserTenant } from "./tenant"

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

export type CreateUserCreatorContext = { tenant: UserTenant; role: UserRole }

const ADMIN_ENDPOINT = "/api/admin/data"
const COMMUNITY_ENDPOINT = "/api/community"

const toDate = (v: any): Date => (v instanceof Date ? v : new Date(v))

/** POST an admin action; returns { ok, json }. */
async function postAdmin(action: string, payload: Record<string, any> = {}) {
  try {
    const res = await fetchWithAuth(ADMIN_ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ action, payload }),
    })
    const json = await res.json().catch(() => ({}))
    return { ok: res.ok, json }
  } catch (error: any) {
    return { ok: false, json: { error: error?.message || "Request failed" } }
  }
}

async function postCommunity(action: string, payload: Record<string, any> = {}) {
  try {
    const res = await fetchWithAuth(COMMUNITY_ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ action, payload }),
    })
    const json = await res.json().catch(() => ({}))
    return { ok: res.ok, json }
  } catch (error: any) {
    return { ok: false, json: { error: error?.message || "Request failed" } }
  }
}

// ── Users ───────────────────────────────────────────────────────────────────
export const createUser = async (
  email: string,
  password: string,
  role: UserRole,
  displayName?: string,
  _creator?: CreateUserCreatorContext, // creator is now derived server-side from the caller
) => {
  const { ok, json } = await postAdmin("createUser", { email, password, role, displayName })
  if (!ok) return { user: null, error: json.error || "Failed to create user" }
  return json
}

export const getAllUsers = async (_adminViewer?: UserProfile | null) => {
  const { ok, json } = await postAdmin("getAllUsers")
  if (!ok) return []
  return (json.users || []) as (UserProfile & { id: string })[]
}

export const getUsersByRole = async (role: UserRole, _adminViewer?: UserProfile | null) => {
  const { ok, json } = await postAdmin("getUsersByRole", { role })
  if (!ok) return []
  return (json.users || []) as (UserProfile & { id: string })[]
}

export const updateUserStatus = async (userId: string, isActive: boolean) => {
  const { ok, json } = await postAdmin("updateUserStatus", { userId, isActive })
  return ok ? { success: true } : { success: false, error: json.error }
}

export const updateUserChatPermission = async (userId: string, allowChat: boolean) => {
  const { ok, json } = await postAdmin("updateUserChatPermission", { userId, allowChat })
  return ok ? { success: true } : { success: false, error: json.error }
}

export const updatePublisherZoomMapping = async (
  userId: string,
  updates: { zoomUserId?: string; zoomUserEmail?: string },
) => {
  const { ok, json } = await postAdmin("updatePublisherZoomMapping", { userId, updates })
  return ok ? { success: true } : { success: false, error: json.error }
}

export const logoutAllUsers = async (_adminViewer?: UserProfile | null) => {
  const { ok, json } = await postAdmin("logoutAllUsers")
  return ok ? { success: true, count: json.count } : { success: false, error: json.error }
}

export const deleteUserAccount = async (userId: string, adminId: string) => {
  try {
    const response = await fetchWithAuth("/api/admin/delete-user", {
      method: "POST",
      body: JSON.stringify({ userId, adminId }),
    })
    const data = await response.json()
    if (!response.ok) return { success: false, error: data.error || "Failed to delete user" }
    return { success: true, message: data.message }
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to delete user" }
  }
}

export const resetUserPassword = async (userId: string, newPassword: string, adminId: string) => {
  try {
    const response = await fetchWithAuth("/api/admin/reset-password", {
      method: "POST",
      body: JSON.stringify({ userId, newPassword, adminId }),
    })
    const data = await response.json()
    if (!response.ok) return { success: false, error: data.error || "Failed to reset password" }
    return { success: true, message: data.message }
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to reset password" }
  }
}

// ── Stream permissions ────────────────────────────────────────────────────────
export const createStreamPermission = async (
  permission: Omit<StreamPermission, "id" | "createdAt">,
) => {
  const { ok, json } = await postAdmin("createStreamPermission", { permission })
  return ok ? { success: true, id: json.id } : { success: false, error: json.error }
}

export const getStreamPermissions = async () => {
  const { ok, json } = await postAdmin("getStreamPermissions")
  if (!ok) return []
  return (json.permissions || []).map((p: any) => ({ ...p, createdAt: toDate(p.createdAt) })) as StreamPermission[]
}

export const updateStreamPermission = async (
  permissionId: string,
  updates: Partial<StreamPermission>,
) => {
  const { ok, json } = await postAdmin("updateStreamPermission", { permissionId, updates })
  return ok ? { success: true } : { success: false, error: json.error }
}

export const deleteStreamPermission = async (permissionId: string) => {
  const { ok, json } = await postAdmin("deleteStreamPermission", { permissionId })
  return ok ? { success: true } : { success: false, error: json.error }
}

// ── Stream assignments ──────────────────────────────────────────────────────
export const createStreamAssignment = async (
  assignment: Omit<StreamAssignment, "id" | "createdAt">,
) => {
  const { ok, json } = await postAdmin("createStreamAssignment", { assignment })
  return ok ? { success: true, id: json.id } : { success: false, error: json.error }
}

export const getStreamAssignments = async () => {
  const { ok, json } = await postAdmin("getStreamAssignments")
  if (!ok) return []
  return (json.assignments || []).map((a: any) => ({ ...a, createdAt: toDate(a.createdAt) })) as StreamAssignment[]
}

export type StreamAssignmentsBootstrap = {
  subscribers: (UserProfile & { id: string })[]
  streams: StreamingSession[]
  assignments: StreamAssignment[]
}

let streamAssignmentsBootstrapCache: StreamAssignmentsBootstrap | null = null
let streamAssignmentsBootstrapPromise: Promise<StreamAssignmentsBootstrap> | null = null

function mapStreamAssignmentsBootstrap(json: Record<string, unknown>): StreamAssignmentsBootstrap {
  return {
    subscribers: (json.subscribers || []) as (UserProfile & { id: string })[],
    streams: parseStreamSessions((json.streams || []) as unknown[]),
    assignments: ((json.assignments || []) as any[]).map((a) => ({
      ...a,
      createdAt: toDate(a.createdAt),
    })) as StreamAssignment[],
  }
}

export const invalidateStreamAssignmentsBootstrap = () => {
  streamAssignmentsBootstrapCache = null
  streamAssignmentsBootstrapPromise = null
}

export const getStreamAssignmentsBootstrap = async (
  options?: { force?: boolean },
): Promise<StreamAssignmentsBootstrap> => {
  if (!options?.force && streamAssignmentsBootstrapCache) {
    return streamAssignmentsBootstrapCache
  }
  if (!options?.force && streamAssignmentsBootstrapPromise) {
    return streamAssignmentsBootstrapPromise
  }

  const load = async (): Promise<StreamAssignmentsBootstrap> => {
    const { ok, json } = await postAdmin("getStreamAssignmentsBootstrap")
    const data = ok
      ? mapStreamAssignmentsBootstrap(json)
      : { subscribers: [], streams: [], assignments: [] }
    streamAssignmentsBootstrapCache = data
    streamAssignmentsBootstrapPromise = null
    return data
  }

  streamAssignmentsBootstrapPromise = load()
  return streamAssignmentsBootstrapPromise
}

export const deleteStreamAssignment = async (assignmentId: string) => {
  const { ok, json } = await postAdmin("deleteStreamAssignment", { assignmentId })
  return ok ? { success: true } : { success: false, error: json.error }
}

export const updateStreamAssignment = async (
  assignmentId: string,
  updates: Partial<StreamAssignment>,
) => {
  const { ok, json } = await postAdmin("updateStreamAssignment", { assignmentId, updates })
  return ok ? { success: true } : { success: false, error: json.error }
}

// ── Contact messages ──────────────────────────────────────────────────────────
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
  const { ok, json } = await postAdmin("getContactMessages")
  if (!ok) return []
  return (json.messages || []).map((m: any) => ({ ...m, createdAt: toDate(m.createdAt) })) as ContactMessage[]
}

export const markContactMessageRead = async (messageId: string) => {
  const { ok, json } = await postAdmin("markContactMessageRead", { messageId })
  return ok ? { success: true } : { success: false, error: json.error }
}

// ── Admin broadcasts ──────────────────────────────────────────────────────────
export interface AdminBroadcast {
  id?: string
  message: string
  createdAt: Date
  createdByUid: string
  createdByName?: string
  targetTenant?: UserTenant
}

export const createAdminBroadcast = async (
  message: string,
  _createdByUid: string, // derived server-side from the authenticated admin
  createdByName?: string,
  targetTenant: UserTenant = "default",
): Promise<{ success: boolean; id?: string; error?: string }> => {
  const { ok, json } = await postAdmin("createAdminBroadcast", {
    message,
    createdByName,
    targetTenant,
  })
  return ok ? { success: true, id: json.id } : { success: false, error: json.error }
}

export const getAdminBroadcasts = async (): Promise<AdminBroadcast[]> => {
  try {
    const res = await fetchWithAuth(`${COMMUNITY_ENDPOINT}?action=broadcasts`, { method: "GET" })
    if (!res.ok) return []
    const json = await res.json()
    return (json.broadcasts || []).map((b: any) => ({
      id: b.id,
      message: b.message,
      createdByUid: b.createdByUid,
      createdByName: b.createdByName || undefined,
      createdAt: toDate(b.createdAt),
      targetTenant: b.targetTenant as UserTenant | undefined,
    })) as AdminBroadcast[]
  } catch (error) {
    console.error("Error fetching admin broadcasts:", error)
    return []
  }
}

/**
 * Live list of admin broadcasts. Firestore realtime is replaced with short polling
 * against the backend; the returned function stops polling (same Unsubscribe shape).
 */
export const subscribeAdminBroadcasts = (
  onUpdate: (items: AdminBroadcast[]) => void,
): (() => void) => {
  let active = true
  const poll = async () => {
    const items = await getAdminBroadcasts()
    if (active) onUpdate(items)
  }
  void poll()
  const interval = setInterval(poll, 15000)
  return () => {
    active = false
    clearInterval(interval)
  }
}

// ── Reports ─────────────────────────────────────────────────────────────────
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
  const { ok, json } = await postCommunity("createReport", report)
  return ok ? { success: true, id: json.id } : { success: false, error: json.error }
}

export const getReports = async () => {
  const { ok, json } = await postAdmin("getReports")
  if (!ok) return []
  return (json.reports || []).map((r: any) => ({
    ...r,
    createdAt: toDate(r.createdAt),
    resolvedAt: r.resolvedAt ? toDate(r.resolvedAt) : undefined,
  })) as Report[]
}

export const resolveReport = async (reportId: string, _resolvedBy: string) => {
  const { ok, json } = await postAdmin("resolveReport", { reportId })
  return ok ? { success: true } : { success: false, error: json.error }
}

// ── Block events ──────────────────────────────────────────────────────────────
export interface BlockEvent {
  id?: string
  blockerId: string
  blockerName: string
  blockedUserId: string
  blockedUserName: string
  createdAt: Date
}

export const addBlockEvent = async (event: Omit<BlockEvent, "id" | "createdAt">) => {
  const { ok, json } = await postCommunity("addBlockEvent", event)
  return ok ? { success: true } : { success: false, error: json.error }
}

export const getBlockEvents = async () => {
  const { ok, json } = await postAdmin("getBlockEvents")
  if (!ok) return []
  return (json.events || []).map((e: any) => ({ ...e, createdAt: toDate(e.createdAt) })) as BlockEvent[]
}

export const blockUser = async (
  _blockerId: string, // a user can only block on their own behalf (enforced server-side)
  blockerName: string,
  blockedUserId: string,
  blockedUserName: string,
): Promise<{ success: boolean; error?: string }> => {
  const { ok, json } = await postCommunity("blockUser", {
    blockerName,
    blockedUserId,
    blockedUserName,
  })
  return ok ? { success: true } : { success: false, error: json.error }
}

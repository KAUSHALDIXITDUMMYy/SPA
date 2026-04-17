import { db } from "./firebase"
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  limit,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore"
import type { StreamPermission, StreamAssignment } from "./admin"
import type { StreamSession } from "./streaming"

/** Earliest time first (ascending). Missing dates sort last. */
export function streamSessionCreatedAtMs(session: StreamSession | undefined): number {
  if (!session?.createdAt) return Number.MAX_SAFE_INTEGER
  const c = session.createdAt as Date | { toDate?: () => Date } | string | number
  if (c instanceof Date) return c.getTime()
  if (typeof (c as { toDate?: () => Date }).toDate === "function") {
    return (c as { toDate: () => Date }).toDate().getTime()
  }
  const d = new Date(c as string | number)
  return Number.isNaN(d.getTime()) ? Number.MAX_SAFE_INTEGER : d.getTime()
}

/** Sort live / ad-hoc streams by session start time (createdAt), then publisher name. */
export function compareSubscriberPermissionsByStreamStart(a: SubscriberPermission, b: SubscriberPermission): number {
  const ta = streamSessionCreatedAtMs(a.streamSession)
  const tb = streamSessionCreatedAtMs(b.streamSession)
  if (ta !== tb) return ta - tb
  return (a.publisherName || "").localeCompare(b.publisherName || "")
}

export interface SubscriberPermission extends StreamPermission {
  publisherName: string
  streamSession?: StreamSession
}

export const getSubscriberPermissions = async (subscriberId: string): Promise<SubscriberPermission[]> => {
  try {
    console.log("[v0] Fetching permissions for subscriber:", subscriberId)

    // Get permissions for this subscriber (publisher-based)
    const permissionsRef = collection(db, "streamPermissions")
    const permissionsQuery = query(
      permissionsRef,
      where("subscriberId", "==", subscriberId),
      where("isActive", "==", true),
    )
    const permissionsSnapshot = await getDocs(permissionsQuery)
    const permissions = permissionsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as StreamPermission[]

    // Get stream assignments for this subscriber (stream-based)
    const assignmentsRef = collection(db, "streamAssignments")
    const assignmentsQuery = query(
      assignmentsRef,
      where("subscriberId", "==", subscriberId),
      where("isActive", "==", true),
    )
    const assignmentsSnapshot = await getDocs(assignmentsQuery)
    const assignments = assignmentsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as StreamAssignment[]

    console.log("[v0] Found permissions:", permissions.length, "Found stream assignments:", assignments.length)

    // Get all users and active streams in parallel
    const usersRef = collection(db, "users")
    const streamsRef = collection(db, "streamSessions")

    const [usersSnapshot, streamsSnapshot] = await Promise.all([
      getDocs(usersRef),
      getDocs(query(streamsRef, where("isActive", "==", true))),
    ])

    // Create lookup maps for better performance
    const usersMap = new Map()
    usersSnapshot.docs.forEach((doc) => {
      const userData = doc.data()
      usersMap.set(userData.uid, userData)
    })

    const activeStreamsMap = new Map()
    streamsSnapshot.docs.forEach((doc) => {
      const streamData = { id: doc.id, ...doc.data() } as any
      activeStreamsMap.set(streamData.id, streamData)
    })

    console.log("[v0] Active streams found:", activeStreamsMap.size)

    // Process publisher-based permissions — one row per active stream for that publisher (scheduled rooms + ad-hoc)
    const enrichedPermissions: SubscriberPermission[] = []
    permissions.forEach((permission) => {
      const publisherData = usersMap.get(permission.publisherId)
      const publisherName = publisherData?.displayName || publisherData?.email || "Unknown Publisher"
      const streamsForPublisher = Array.from(activeStreamsMap.values()).filter(
        (s: any) => s.publisherId === permission.publisherId,
      )

      if (streamsForPublisher.length === 0) {
        console.log("[v0] Processing permission for publisher:", permission.publisherId, "Stream active:", false)
        enrichedPermissions.push({
          ...permission,
          publisherName,
          streamSession: undefined,
        } as SubscriberPermission)
        return
      }

      streamsForPublisher.forEach((streamData: any) => {
        console.log("[v0] Processing permission for publisher:", permission.publisherId, "Stream:", streamData.id)
        enrichedPermissions.push({
          ...permission,
          id: `${permission.id}_${streamData.id}`,
          publisherName,
          streamSession: streamData,
        } as SubscriberPermission)
      })
    })

    // Process stream-based assignments
    assignments.forEach((assignment) => {
      const streamData = activeStreamsMap.get(assignment.streamSessionId)
      if (streamData) {
        const publisherData = usersMap.get(streamData.publisherId)
        enrichedPermissions.push({
          id: assignment.id,
          subscriberId: assignment.subscriberId,
          publisherId: streamData.publisherId,
          publisherName: publisherData?.displayName || publisherData?.email || "Unknown Publisher",
          allowVideo: true,
          allowAudio: true,
          isActive: true,
          createdAt: assignment.createdAt,
          streamSession: streamData,
        } as SubscriberPermission)
      }
    })

    // Remove duplicates (same subscriber + publisher + stream session)
    const uniquePermissions = new Map<string, SubscriberPermission>()
    enrichedPermissions.forEach((perm) => {
      const sid = perm.streamSession?.id ?? perm.id ?? "none"
      const key = `${perm.subscriberId}_${perm.publisherId}_${sid}`
      if (!uniquePermissions.has(key)) {
        uniquePermissions.set(key, perm)
      }
    })

    console.log("[v0] Enriched permissions (unique):", uniquePermissions.size)
    return Array.from(uniquePermissions.values())
  } catch (error) {
    console.error("Error fetching subscriber permissions:", error)
    return []
  }
}

export const getAvailableStreams = async (subscriberId: string): Promise<SubscriberPermission[]> => {
  const permissions = await getSubscriberPermissions(subscriberId)
  const availableStreams = permissions.filter((permission) => permission.streamSession?.isActive)
  console.log("[v0] Available streams for subscriber:", availableStreams.length)
  return availableStreams
}

/** Admin-scheduled Agora room: linked call id and/or `sched-…` room IDs from schedule imports. */
export function streamSessionIsScheduledRoom(session: StreamSession | undefined): boolean {
  if (!session) return false
  if (session.scheduledCallId) return true
  const rid = session.roomId?.trim() ?? ""
  return rid.startsWith("sched-")
}

/**
 * Split active streams: publisher-started (ad-hoc) vs admin-scheduled rooms.
 */
export async function getAvailableStreamsSplit(subscriberId: string): Promise<{
  adHoc: SubscriberPermission[]
  scheduled: SubscriberPermission[]
}> {
  const all = await getAvailableStreams(subscriberId)
  return {
    adHoc: all.filter((p) => !streamSessionIsScheduledRoom(p.streamSession)),
    scheduled: all.filter((p) => streamSessionIsScheduledRoom(p.streamSession)),
  }
}

/** Publisher IDs this subscriber may hear (publisher assignments + publishers owning assigned stream sessions). */
export async function getAccessiblePublisherIdsForSubscriber(subscriberId: string): Promise<Set<string>> {
  const ids = new Set<string>()
  try {
    const permsQ = query(
      collection(db, "streamPermissions"),
      where("subscriberId", "==", subscriberId),
      where("isActive", "==", true),
    )
    const assignQ = query(
      collection(db, "streamAssignments"),
      where("subscriberId", "==", subscriberId),
      where("isActive", "==", true),
    )
    const [permsSnap, assignSnap] = await Promise.all([getDocs(permsQ), getDocs(assignQ)])
    permsSnap.docs.forEach((d) => {
      const pid = d.data().publisherId as string | undefined
      if (pid) ids.add(pid)
    })
    const sessionReads = assignSnap.docs
      .map((d) => d.data().streamSessionId as string | undefined)
      .filter((sid): sid is string => Boolean(sid))
      .map((sid) => getDoc(doc(db, "streamSessions", sid)))
    const sessionSnaps = await Promise.all(sessionReads)
    sessionSnaps.forEach((snap) => {
      if (snap.exists()) {
        const pid = snap.data()?.publisherId as string | undefined
        if (pid) ids.add(pid)
      }
    })
  } catch (e) {
    console.error("getAccessiblePublisherIdsForSubscriber:", e)
  }
  return ids
}

/** True if the subscriber has at least one active publisher (streamPermissions) or stream (streamAssignments) assignment. */
export const subscriberHasAnyAssignment = async (subscriberId: string): Promise<boolean> => {
  try {
    const permsQ = query(
      collection(db, "streamPermissions"),
      where("subscriberId", "==", subscriberId),
      where("isActive", "==", true),
      limit(1)
    )
    const assignQ = query(
      collection(db, "streamAssignments"),
      where("subscriberId", "==", subscriberId),
      where("isActive", "==", true),
      limit(1)
    )
    const [permsSnap, assignSnap] = await Promise.all([getDocs(permsQ), getDocs(assignQ)])
    return !permsSnap.empty || !assignSnap.empty
  } catch (error) {
    console.error("subscriberHasAnyAssignment:", error)
    return false
  }
}

/**
 * Fires whenever eligibility changes (assignments added/removed or toggled).
 * Eligible = at least one active streamPermission OR streamAssignment for this subscriber.
 */
export const subscribeSubscriberAssignmentEligibility = (
  subscriberId: string,
  onEligible: (eligible: boolean) => void
): Unsubscribe => {
  const permsQ = query(
    collection(db, "streamPermissions"),
    where("subscriberId", "==", subscriberId),
    where("isActive", "==", true),
    limit(1)
  )
  const assignQ = query(
    collection(db, "streamAssignments"),
    where("subscriberId", "==", subscriberId),
    where("isActive", "==", true),
    limit(1)
  )
  let hasPerm = false
  let hasAssign = false
  const emit = () => onEligible(hasPerm || hasAssign)
  const unsub1 = onSnapshot(permsQ, (snap) => {
    hasPerm = !snap.empty
    emit()
  })
  const unsub2 = onSnapshot(assignQ, (snap) => {
    hasAssign = !snap.empty
    emit()
  })
  return () => {
    unsub1()
    unsub2()
  }
}

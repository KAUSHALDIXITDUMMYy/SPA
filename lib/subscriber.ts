import { db } from "./firebase"
import { collection, query, where, getDocs } from "firebase/firestore"
import type { StreamPermission, StreamAssignment } from "./admin"
import type { StreamSession } from "./streaming"

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

    // Process publisher-based permissions
    const enrichedPermissions: SubscriberPermission[] = permissions.map((permission) => {
      const publisherData = usersMap.get(permission.publisherId)
      // Find stream by publisherId
      const streamData = Array.from(activeStreamsMap.values()).find(
        (s: any) => s.publisherId === permission.publisherId
      )

      console.log("[v0] Processing permission for publisher:", permission.publisherId, "Stream active:", !!streamData)

      return {
        ...permission,
        publisherName: publisherData?.displayName || publisherData?.email || "Unknown Publisher",
        streamSession: streamData || undefined,
      } as SubscriberPermission
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

    // Remove duplicates (same publisherId + subscriberId combination)
    const uniquePermissions = new Map<string, SubscriberPermission>()
    enrichedPermissions.forEach((perm) => {
      const key = `${perm.subscriberId}_${perm.publisherId}`
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

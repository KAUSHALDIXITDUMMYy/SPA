import { db } from "./firebase"
import { FS } from "./firestore-paths"
import { collection, query, where, getDocs, addDoc, updateDoc, doc, orderBy, limit, onSnapshot, Timestamp } from "firebase/firestore"
import type { ViewerLocation } from "./viewer-location"
import type { UserTenant } from "./tenant"

export type { ViewerLocation } from "./viewer-location"

function toDate(value: unknown): Date {
  if (value instanceof Date) return value
  if (value instanceof Timestamp) return value.toDate()
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate()
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return new Date()
}

export interface StreamAnalytics {
  id?: string
  streamSessionId: string
  subscriberId: string
  subscriberName: string
  publisherId: string
  publisherName: string
  action: 'join' | 'leave' | 'viewing'
  timestamp: Date
  duration?: number
}

export interface StreamViewer {
  id?: string
  streamSessionId: string
  subscriberId: string
  subscriberName: string
  publisherId: string
  publisherName: string
  joinedAt: Date
  lastSeen: Date
  isActive: boolean
  subscriberTenant?: UserTenant
  /** Approximate location (usually IP-based) when the viewer joined */
  location?: ViewerLocation | null
}

export interface AnalyticsSummary {
  totalAnalytics: number
  activeViewersCount: number
  activeStreamsCount: number
  uniqueViewers: number
  averageViewDuration: number
}

function mapActiveViewerDoc(viewerDoc: { id: string; data: () => Record<string, unknown> }): StreamViewer {
  const data = viewerDoc.data()
  return {
    id: viewerDoc.id,
    streamSessionId: data.streamSessionId as string,
    subscriberId: data.subscriberId as string,
    subscriberName: (data.subscriberName as string) || "Unknown",
    publisherId: data.publisherId as string,
    publisherName: (data.publisherName as string) || "Unknown",
    joinedAt: toDate(data.joinedAt),
    lastSeen: toDate(data.lastSeen),
    isActive: data.isActive !== false,
    subscriberTenant: data.subscriberTenant as UserTenant | undefined,
    location: data.location as ViewerLocation | null | undefined,
  }
}

// Track subscriber activity
export const trackSubscriberActivity = async (data: {
  streamSessionId: string
  subscriberId: string
  subscriberName: string
  publisherId: string
  publisherName: string
  action: 'join' | 'leave' | 'viewing'
  duration?: number
  subscriberTenant?: UserTenant
  /** Stored on activeViewers for live admin map/list; not written to streamAnalytics */
  location?: ViewerLocation | null
}) => {
  try {
    const { location, ...activityRest } = data
    const analyticsData: Omit<StreamAnalytics, "id"> = {
      ...activityRest,
      timestamp: new Date(),
    }

    // Update active viewers collection before analytics so live dashboards see joiners immediately
    if (data.action === 'join') {
      const activeViewersRef = collection(db, "activeViewers")
      const q = query(
        activeViewersRef,
        where("streamSessionId", "==", data.streamSessionId),
        where("subscriberId", "==", data.subscriberId)
      )
      const snapshot = await getDocs(q)

      const loc = location ?? undefined
      const tenantFields =
        data.subscriberTenant !== undefined ? { subscriberTenant: data.subscriberTenant } : {}
      const viewerFields = {
        isActive: true,
        joinedAt: new Date(),
        lastSeen: new Date(),
        subscriberName: data.subscriberName,
        publisherName: data.publisherName,
        ...tenantFields,
        ...(loc ? { location: loc } : {}),
      }

      if (snapshot.empty) {
        await addDoc(collection(db, "activeViewers"), {
          streamSessionId: data.streamSessionId,
          subscriberId: data.subscriberId,
          publisherId: data.publisherId,
          ...viewerFields,
        })
      } else {
        const [primaryDoc, ...duplicateDocs] = snapshot.docs
        await updateDoc(doc(db, "activeViewers", primaryDoc.id), viewerFields)
        await Promise.all(
          duplicateDocs.map((viewerDoc) =>
            updateDoc(doc(db, "activeViewers", viewerDoc.id), {
              isActive: false,
              lastSeen: new Date(),
            }),
          ),
        )
      }
    } else if (data.action === 'leave') {
      const activeViewersRef = collection(db, "activeViewers")
      const q = query(
        activeViewersRef,
        where("streamSessionId", "==", data.streamSessionId),
        where("subscriberId", "==", data.subscriberId),
        where("isActive", "==", true)
      )
      const snapshot = await getDocs(q)
      
      await Promise.all(
        snapshot.docs.map((viewerDoc) =>
          updateDoc(doc(db, "activeViewers", viewerDoc.id), {
            isActive: false,
            lastSeen: new Date(),
          }),
        ),
      )
    } else if (data.action === 'viewing') {
      const activeViewersRef = collection(db, "activeViewers")
      const q = query(
        activeViewersRef,
        where("streamSessionId", "==", data.streamSessionId),
        where("subscriberId", "==", data.subscriberId),
        where("isActive", "==", true)
      )
      const snapshot = await getDocs(q)
      
      await Promise.all(
        snapshot.docs.map((viewerDoc) =>
          updateDoc(doc(db, "activeViewers", viewerDoc.id), {
            lastSeen: new Date(),
          }),
        ),
      )
    }

    const docRef = await addDoc(collection(db, "streamAnalytics"), analyticsData)

    return { success: true, id: docRef.id }
  } catch (error: any) {
    console.error("Error tracking analytics:", error)
    return { success: false, error: error.message }
  }
}

// Get admin analytics overview
export const getAdminAnalytics = async (limitCount: number = 100) => {
  try {
    const analyticsRef = collection(db, "streamAnalytics")
    const q = query(analyticsRef, orderBy("timestamp", "desc"), limit(limitCount))
    
    const snapshot = await getDocs(q)
    const analytics = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as StreamAnalytics[]

    // Get current active viewers
    const activeViewersRef = collection(db, "activeViewers")
    const activeSnapshot = await getDocs(query(activeViewersRef, where("isActive", "==", true)))
    const activeViewers = activeSnapshot.docs.map((viewerDoc) => mapActiveViewerDoc(viewerDoc))

    // Get stream sessions for context
    const streamsRef = collection(db, FS.streams.live)
    const streamsSnapshot = await getDocs(query(streamsRef, where("isActive", "==", true)))
    const activeStreams = streamsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    // Calculate summary statistics
    const uniqueViewers = new Set(analytics.map(a => a.subscriberId)).size
    const joinEvents = analytics.filter(a => a.action === 'join')
    const leaveEvents = analytics.filter(a => a.action === 'leave')
    const averageViewDuration = leaveEvents.length > 0 
      ? leaveEvents.reduce((sum, event) => sum + (event.duration || 0), 0) / leaveEvents.length
      : 0

    const summary: AnalyticsSummary = {
      totalAnalytics: analytics.length,
      activeViewersCount: activeViewers.length,
      activeStreamsCount: activeStreams.length,
      uniqueViewers,
      averageViewDuration: Math.round(averageViewDuration)
    }

    return {
      analytics,
      activeViewers,
      activeStreams,
      summary
    }
  } catch (error: any) {
    console.error("Error fetching admin analytics:", error)
    return { analytics: [], activeViewers: [], activeStreams: [], summary: null }
  }
}

// Get publisher analytics
export const getPublisherAnalytics = async (publisherId: string, limitCount: number = 100) => {
  try {
    const analyticsRef = collection(db, "streamAnalytics")
    const q = query(
      analyticsRef, 
      where("publisherId", "==", publisherId),
      orderBy("timestamp", "desc"),
      limit(limitCount)
    )
    
    const snapshot = await getDocs(q)
    const analytics = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as StreamAnalytics[]

    // Get current viewers for this publisher's active streams
    const activeViewersRef = collection(db, "activeViewers")
    const activeSnapshot = await getDocs(query(activeViewersRef, where("publisherId", "==", publisherId)))
    const currentViewers = activeSnapshot.docs.map((viewerDoc) => mapActiveViewerDoc(viewerDoc))

    // Get this publisher's stream sessions
    const streamsRef = collection(db, FS.streams.live)
    const streamsSnapshot = await getDocs(query(streamsRef, where("publisherId", "==", publisherId)))
    const streamSessions = streamsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    // Calculate publisher-specific statistics
    const uniqueViewers = new Set(analytics.map(a => a.subscriberId)).size
    const totalViews = analytics.filter(a => a.action === 'join').length
    const currentViewersCount = currentViewers.filter((v) => v.isActive).length

    return {
      analytics,
      currentViewers,
      streamSessions,
      summary: {
        totalAnalytics: analytics.length,
        currentViewersCount,
        totalStreams: streamSessions.length,
        activeStreams: streamSessions.filter((s: any) => s.isActive).length,
        uniqueViewers,
        totalViews
      }
    }
  } catch (error: any) {
    console.error("Error fetching publisher analytics:", error)
    return { analytics: [], currentViewers: [], streamSessions: [], summary: null }
  }
}

// Get stream-specific analytics
export const getStreamAnalytics = async (streamSessionId: string) => {
  try {
    const analyticsRef = collection(db, "streamAnalytics")
    const q = query(
      analyticsRef,
      where("streamSessionId", "==", streamSessionId),
      orderBy("timestamp", "desc")
    )
    
    const snapshot = await getDocs(q)
    const analytics = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as StreamAnalytics[]

    return { analytics }
  } catch (error: any) {
    console.error("Error fetching stream analytics:", error)
    return { analytics: [] }
  }
}

// Real-time analytics subscription
export const subscribeToAnalytics = (
  publisherId: string,
  callback: (data: { analytics: StreamAnalytics[], currentViewers: StreamViewer[] }) => void
) => {
  const analyticsRef = collection(db, "streamAnalytics")
  const activeViewersRef = collection(db, "activeViewers")

  const analyticsQuery = query(
    analyticsRef,
    where("publisherId", "==", publisherId),
    orderBy("timestamp", "desc"),
    limit(50)
  )

  const viewersQuery = query(
    activeViewersRef,
    where("publisherId", "==", publisherId),
    where("isActive", "==", true)
  )

  let latestAnalytics: StreamAnalytics[] = []
  let latestViewers: StreamViewer[] = []
  let analyticsReady = false
  let viewersReady = false

  const emit = () => {
    if (analyticsReady && viewersReady) {
      callback({ analytics: latestAnalytics, currentViewers: latestViewers })
    }
  }

  const unsubscribeAnalytics = onSnapshot(analyticsQuery, (snapshot) => {
    latestAnalytics = snapshot.docs.map((analyticsDoc) => ({
      id: analyticsDoc.id,
      ...analyticsDoc.data(),
      timestamp: toDate(analyticsDoc.data().timestamp),
    })) as StreamAnalytics[]
    analyticsReady = true
    emit()
  })

  const unsubscribeViewers = onSnapshot(viewersQuery, (snapshot) => {
    latestViewers = snapshot.docs.map((viewerDoc) => mapActiveViewerDoc(viewerDoc))
    viewersReady = true
    emit()
  })

  return () => {
    unsubscribeAnalytics()
    unsubscribeViewers()
  }
}

// Cleanup old analytics data (can be called periodically)
export const cleanupOldAnalytics = async (daysToKeep: number = 30) => {
  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

    const analyticsRef = collection(db, "streamAnalytics")
    const q = query(analyticsRef, where("timestamp", "<", cutoffDate))
    
    const snapshot = await getDocs(q)
    const batch = []
    
    for (const doc of snapshot.docs) {
      batch.push(doc.ref.delete())
    }

    await Promise.all(batch)
    return { success: true, deletedCount: batch.length }
  } catch (error: any) {
    console.error("Error cleaning up analytics:", error)
    return { success: false, error: error.message }
  }
}

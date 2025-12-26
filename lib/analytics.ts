import { db } from "./firebase"
import { collection, query, where, getDocs, addDoc, updateDoc, doc, orderBy, limit, onSnapshot } from "firebase/firestore"

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
}

export interface AnalyticsSummary {
  totalAnalytics: number
  activeViewersCount: number
  activeStreamsCount: number
  uniqueViewers: number
  averageViewDuration: number
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
}) => {
  try {
    const analyticsData: Omit<StreamAnalytics, "id"> = {
      ...data,
      timestamp: new Date(),
    }

    const docRef = await addDoc(collection(db, "streamAnalytics"), analyticsData)
    
    // Update active viewers collection
    if (data.action === 'join') {
      // Check if viewer already exists (active or inactive) for this stream
      const activeViewersRef = collection(db, "activeViewers")
      const q = query(
        activeViewersRef,
        where("streamSessionId", "==", data.streamSessionId),
        where("subscriberId", "==", data.subscriberId)
      )
      const snapshot = await getDocs(q)
      
      if (snapshot.empty) {
        // No existing document, create new one
        await addDoc(collection(db, "activeViewers"), {
          streamSessionId: data.streamSessionId,
          subscriberId: data.subscriberId,
          subscriberName: data.subscriberName,
          publisherId: data.publisherId,
          publisherName: data.publisherName,
          joinedAt: new Date(),
          lastSeen: new Date(),
          isActive: true,
        })
      } else {
        // Existing document found, reactivate it
        const viewerDoc = snapshot.docs[0]
        await updateDoc(doc(db, "activeViewers", viewerDoc.id), {
          isActive: true,
          joinedAt: new Date(),
          lastSeen: new Date(),
          // Update name in case it changed
          subscriberName: data.subscriberName,
          publisherName: data.publisherName,
        })
      }
    } else if (data.action === 'leave') {
      // Mark viewer as inactive
      const activeViewersRef = collection(db, "activeViewers")
      const q = query(
        activeViewersRef,
        where("streamSessionId", "==", data.streamSessionId),
        where("subscriberId", "==", data.subscriberId),
        where("isActive", "==", true) // Only update active viewers
      )
      const snapshot = await getDocs(q)
      
      for (const viewerDoc of snapshot.docs) {
        await updateDoc(doc(db, "activeViewers", viewerDoc.id), {
          isActive: false,
          lastSeen: new Date(),
        })
      }
    } else if (data.action === 'viewing') {
      // Update lastSeen for active viewers
      const activeViewersRef = collection(db, "activeViewers")
      const q = query(
        activeViewersRef,
        where("streamSessionId", "==", data.streamSessionId),
        where("subscriberId", "==", data.subscriberId),
        where("isActive", "==", true)
      )
      const snapshot = await getDocs(q)
      
      for (const viewerDoc of snapshot.docs) {
        await updateDoc(doc(db, "activeViewers", viewerDoc.id), {
          lastSeen: new Date(),
        })
      }
    }

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
    const activeViewers = activeSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as StreamViewer[]

    // Get stream sessions for context
    const streamsRef = collection(db, "streamSessions")
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
    const currentViewers = activeSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as StreamViewer[]

    // Get this publisher's stream sessions
    const streamsRef = collection(db, "streamSessions")
    const streamsSnapshot = await getDocs(query(streamsRef, where("publisherId", "==", publisherId)))
    const streamSessions = streamsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    // Calculate publisher-specific statistics
    const uniqueViewers = new Set(analytics.map(a => a.subscriberId)).size
    const totalViews = analytics.filter(a => a.action === 'join').length
    const activeViewersCount = currentViewers.filter(v => v.isActive).length

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

  const unsubscribeAnalytics = onSnapshot(analyticsQuery, (snapshot) => {
    const analytics = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as StreamAnalytics[]

    // Get current viewers
    getDocs(viewersQuery).then((viewersSnapshot) => {
      const currentViewers = viewersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as StreamViewer[]

      callback({ analytics, currentViewers })
    })
  })

  return () => {
    unsubscribeAnalytics()
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

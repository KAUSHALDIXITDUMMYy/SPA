import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/firebase"
import { collection, query, where, getDocs, addDoc, updateDoc, doc, orderBy, limit } from "firebase/firestore"

export interface StreamAnalytics {
  id?: string
  streamSessionId: string
  subscriberId: string
  subscriberName: string
  publisherId: string
  publisherName: string
  action: 'join' | 'leave' | 'viewing'
  timestamp: Date
  duration?: number // in seconds
}

export interface StreamViewer {
  subscriberId: string
  subscriberName: string
  joinedAt: Date
  lastSeen: Date
  isActive: boolean
}

// Track subscriber activity
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { streamSessionId, subscriberId, subscriberName, publisherId, publisherName, action, duration } = body

    if (!streamSessionId || !subscriberId || !action) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const analyticsData: Omit<StreamAnalytics, "id"> = {
      streamSessionId,
      subscriberId,
      subscriberName: subscriberName || "Unknown",
      publisherId,
      publisherName: publisherName || "Unknown",
      action,
      timestamp: new Date(),
      duration: duration || undefined,
    }

    const docRef = await addDoc(collection(db, "streamAnalytics"), analyticsData)

    return NextResponse.json({ 
      success: true, 
      id: docRef.id,
      analytics: { ...analyticsData, id: docRef.id }
    })
  } catch (error: any) {
    console.error("Error tracking analytics:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Get analytics data
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get("type")
    const publisherId = searchParams.get("publisherId")
    const streamSessionId = searchParams.get("streamSessionId")
    const limitCount = parseInt(searchParams.get("limit") || "100")

    if (type === "admin") {
      // Admin analytics - overview of all activity
      const analyticsRef = collection(db, "streamAnalytics")
      let q = query(analyticsRef, orderBy("timestamp", "desc"), limit(limitCount))
      
      const snapshot = await getDocs(q)
      const analytics = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      // Get current active viewers
      const activeViewersRef = collection(db, "activeViewers")
      const activeSnapshot = await getDocs(activeViewersRef)
      const activeViewers = activeSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      // Get stream sessions for context
      const streamsRef = collection(db, "streamSessions")
      const streamsSnapshot = await getDocs(query(streamsRef, where("isActive", "==", true)))
      const activeStreams = streamsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      return NextResponse.json({
        analytics,
        activeViewers,
        activeStreams,
        summary: {
          totalAnalytics: analytics.length,
          activeViewersCount: activeViewers.length,
          activeStreamsCount: activeStreams.length
        }
      })
    }

    if (type === "publisher" && publisherId) {
      // Publisher analytics - who is watching their streams
      const analyticsRef = collection(db, "streamAnalytics")
      let q = query(
        analyticsRef, 
        where("publisherId", "==", publisherId),
        orderBy("timestamp", "desc"),
        limit(limitCount)
      )
      
      const snapshot = await getDocs(q)
      const analytics = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      // Get current viewers for this publisher's active streams
      const activeViewersRef = collection(db, "activeViewers")
      const activeSnapshot = await getDocs(query(activeViewersRef, where("publisherId", "==", publisherId)))
      const currentViewers = activeSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      // Get this publisher's stream sessions
      const streamsRef = collection(db, "streamSessions")
      const streamsSnapshot = await getDocs(query(streamsRef, where("publisherId", "==", publisherId)))
      const streamSessions = streamsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))

      return NextResponse.json({
        analytics,
        currentViewers,
        streamSessions,
        summary: {
          totalAnalytics: analytics.length,
          currentViewersCount: currentViewers.length,
          totalStreams: streamSessions.length,
          activeStreams: streamSessions.filter((s: any) => s.isActive).length
        }
      })
    }

    if (type === "stream" && streamSessionId) {
      // Stream-specific analytics
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
      }))

      return NextResponse.json({ analytics })
    }

    return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 })
  } catch (error: any) {
    console.error("Error fetching analytics:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

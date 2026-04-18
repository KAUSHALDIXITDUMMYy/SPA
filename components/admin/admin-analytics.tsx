"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  Users, 
  Eye, 
  Play, 
  Clock, 
  TrendingUp, 
  Activity,
  RefreshCw,
  BarChart3,
  UserCheck,
  Monitor,
  Wifi,
  Radio,
  ChevronDown,
  ChevronUp,
  MapPin,
  ExternalLink,
  MessageSquare,
  Headphones,
} from "lucide-react"
import { type StreamAnalytics, type StreamViewer, type AnalyticsSummary } from "@/lib/analytics"
import { formatViewerLocationLabel, normalizeViewerLocation } from "@/lib/viewer-location"
import { db } from "@/lib/firebase"
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useIsMobile } from "@/hooks/use-mobile"
import { useAuth } from "@/hooks/use-auth"
import { StreamChatPanel } from "@/components/ui/stream-chat-panel"
import { StreamViewer } from "@/components/subscriber/stream-viewer"
import type { SubscriberPermission } from "@/lib/subscriber"
import type { StreamSession } from "@/lib/streaming"

/** Polling interval — avoids permanent snapshot listeners that multiply Firestore reads (quota). */
const ADMIN_ANALYTICS_POLL_MS = 20_000

type ActiveStreamRow = {
  id: string
  publisherId: string
  publisherName: string
  roomId: string
  isActive: boolean
  createdAt: Date
  title?: string
  description?: string
  scheduledCallId?: string
  awaitingBroadcast?: boolean
  sport?: string
}

/** Synthetic permission so admin can join Agora as audience (same path as subscribers). */
function activeStreamToAdminListenPermission(stream: ActiveStreamRow, adminUid: string): SubscriberPermission {
  const session: StreamSession = {
    id: stream.id,
    publisherId: stream.publisherId,
    publisherName: stream.publisherName || "",
    roomId: stream.roomId,
    isActive: stream.isActive,
    createdAt: stream.createdAt,
    title: stream.title,
    description: stream.description,
    scheduledCallId: stream.scheduledCallId,
    awaitingBroadcast: stream.awaitingBroadcast,
    sport: stream.sport,
  }
  return {
    id: `admin-listen-${stream.id}`,
    subscriberId: adminUid,
    publisherId: stream.publisherId,
    publisherName: stream.publisherName || "",
    allowVideo: true,
    allowAudio: true,
    createdAt: stream.createdAt,
    isActive: true,
    streamSession: session,
  }
}

export function AdminAnalytics() {
  const [analytics, setAnalytics] = useState<StreamAnalytics[]>([])
  const [activeViewers, setActiveViewers] = useState<StreamViewer[]>([])
  const [activeStreams, setActiveStreams] = useState<any[]>([])
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [isLive, setIsLive] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  /** Which live stream’s chat panel is expanded (only one at a time to limit listeners). */
  const [openStreamChatId, setOpenStreamChatId] = useState<string | null>(null)
  /** Which stream the admin is preview-listening to via Agora (one at a time). */
  const [adminListeningStreamId, setAdminListeningStreamId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const isMobile = useIsMobile()
  const { user, userProfile } = useAuth()
  const dashboardUnmountRef = useRef(false)

  const fetchDashboard = useCallback(async (options?: { manual?: boolean }) => {
    const isManual = options?.manual === true
    if (isManual) setRefreshing(true)
    try {
      const activeViewersQuery = query(collection(db, "activeViewers"), where("isActive", "==", true))
      const activeStreamsQuery = query(collection(db, "streamSessions"), where("isActive", "==", true))
      const analyticsQuery = query(
        collection(db, "streamAnalytics"),
        orderBy("timestamp", "desc"),
        limit(100),
      )

      const [viewersSnap, streamsSnap, analyticsSnap] = await Promise.all([
        getDocs(activeViewersQuery),
        getDocs(activeStreamsQuery),
        getDocs(analyticsQuery),
      ])

      if (dashboardUnmountRef.current) return

      const viewers = viewersSnap.docs.map((doc) => {
        const data = doc.data()
        return {
          id: doc.id,
          streamSessionId: data.streamSessionId,
          subscriberId: data.subscriberId,
          subscriberName: data.subscriberName,
          publisherId: data.publisherId,
          publisherName: data.publisherName,
          joinedAt: data.joinedAt?.toDate?.() || new Date(data.joinedAt),
          lastSeen: data.lastSeen?.toDate?.() || new Date(data.lastSeen),
          isActive: data.isActive,
          location: normalizeViewerLocation(data.location),
        }
      }) as StreamViewer[]

      const streams = streamsSnap.docs.map((doc) => {
        const data = doc.data()
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
        }
      })

      const analyticsData = analyticsSnap.docs.map((doc) => {
        const data = doc.data()
        return {
          id: doc.id,
          streamSessionId: data.streamSessionId,
          subscriberId: data.subscriberId,
          subscriberName: data.subscriberName,
          publisherId: data.publisherId,
          publisherName: data.publisherName,
          action: data.action,
          timestamp: data.timestamp?.toDate?.() || new Date(data.timestamp),
          duration: data.duration,
        }
      }) as StreamAnalytics[]

      setActiveViewers(viewers)
      setActiveStreams(streams)
      setAnalytics(analyticsData)
      setLastUpdated(new Date())
      setIsLive(true)
      setError("")
      setLoading(false)
    } catch (err: unknown) {
      if (!dashboardUnmountRef.current) {
        const message = err instanceof Error ? err.message : "Failed to load analytics"
        setError(message)
        setIsLive(false)
        setLoading(false)
      }
    } finally {
      if (isManual && !dashboardUnmountRef.current) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    dashboardUnmountRef.current = false
    setLoading(true)
    setError("")
    void fetchDashboard()
    const intervalId = setInterval(() => void fetchDashboard(), ADMIN_ANALYTICS_POLL_MS)
    return () => {
      dashboardUnmountRef.current = true
      clearInterval(intervalId)
    }
  }, [fetchDashboard])
  
  // Filter viewers to only show those watching actually active streams and are currently active
  const validActiveViewers = useMemo(() => {
    const activeStreamIds = new Set(activeStreams.map(s => s.id))
    return activeViewers.filter(viewer => 
      activeStreamIds.has(viewer.streamSessionId) && viewer.isActive === true
    )
  }, [activeViewers, activeStreams])
  
  useEffect(() => {
    const uniqueViewers = new Set(analytics.map((a) => a.subscriberId)).size
    const leaveEvents = analytics.filter((a) => a.action === "leave")
    const averageViewDuration =
      leaveEvents.length > 0
        ? leaveEvents.reduce((sum, event) => sum + (event.duration || 0), 0) / leaveEvents.length
        : 0

    setSummary({
      totalAnalytics: analytics.length,
      activeViewersCount: validActiveViewers.length,
      activeStreamsCount: activeStreams.length,
      uniqueViewers,
      averageViewDuration: Math.round(averageViewDuration),
    })
  }, [validActiveViewers, activeStreams, analytics])

  /** Stop preview listen if that stream is no longer active. */
  useEffect(() => {
    if (!adminListeningStreamId) return
    if (!activeStreams.some((s) => s.id === adminListeningStreamId)) {
      setAdminListeningStreamId(null)
    }
  }, [activeStreams, adminListeningStreamId])

  const getActionBadgeVariant = (action: string) => {
    switch (action) {
      case 'join':
        return "default"
      case 'leave':
        return "secondary"
      case 'viewing':
        return "outline"
      default:
        return "outline"
    }
  }

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  const getRecentActivity = () => {
    return analytics.slice(0, 10)
  }

  const getTopStreams = () => {
    const streamStats = new Map()
    
    analytics.forEach(activity => {
      const key = activity.streamSessionId
      if (!streamStats.has(key)) {
        streamStats.set(key, {
          streamSessionId: key,
          publisherName: activity.publisherName,
          title: `Stream by ${activity.publisherName}`,
          viewCount: 0,
          uniqueViewers: new Set()
        })
      }
      
      const stats = streamStats.get(key)
      if (activity.action === 'join') {
        stats.viewCount++
        stats.uniqueViewers.add(activity.subscriberId)
      }
    })

    return Array.from(streamStats.values())
      .map(stats => ({
        ...stats,
        uniqueViewers: stats.uniqueViewers.size
      }))
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, 5)
  }

  if (loading && analytics.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h2 className="text-xl sm:text-2xl font-bold">Analytics Dashboard</h2>
            <div className="flex flex-shrink-0 items-center gap-2 rounded-full border border-green-200/80 bg-muted/50 px-2 py-1 sm:px-3 sm:py-1.5 dark:border-green-800">
              <Radio className={`h-3 w-3 sm:h-3.5 sm:w-3.5 text-green-600 dark:text-green-400 ${isLive ? 'animate-pulse' : ''}`} />
              <span className="text-xs font-semibold text-green-700 dark:text-green-300 whitespace-nowrap">
                {isLive ? "LIVE" : "CONNECTING..."}
              </span>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Data refreshes about every {ADMIN_ANALYTICS_POLL_MS / 1000}s to reduce Firestore usage
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:max-w-md sm:flex-row sm:items-center sm:justify-end sm:gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 w-full gap-2 sm:h-9 sm:w-auto sm:min-w-[8.5rem]"
            disabled={loading || refreshing}
            onClick={() => void fetchDashboard({ manual: true })}
          >
            <RefreshCw className={`h-4 w-4 shrink-0 ${refreshing ? "animate-spin" : ""}`} />
            Refresh data
          </Button>
          <div className="flex items-center justify-between gap-3 border-t border-border pt-2 sm:border-t-0 sm:pt-0">
            <div className="text-left sm:text-right">
              <p className="text-xs text-muted-foreground">Last update</p>
              <p className="text-xs sm:text-sm font-medium">{lastUpdated.toLocaleTimeString()}</p>
            </div>
            <Wifi className="h-4 w-4 shrink-0 sm:h-5 sm:w-5 text-green-600 dark:text-green-400 animate-pulse" />
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Summary Cards - Collapsible on Mobile */}
      {summary && (
        <Collapsible 
          open={isMobile ? statsOpen : true} 
          onOpenChange={setStatsOpen}
          className="md:!block"
        >
          <CollapsibleTrigger asChild className="md:hidden w-full mb-2">
            <Button variant="outline" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Analytics Summary
              </span>
              {statsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="md:!block">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border bg-card border-blue-200/80 dark:border-blue-800">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Total Subscribers</p>
                  <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">{summary.uniqueViewers}</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">who have viewed streams</p>
                </div>
                <div className="p-3 rounded-full bg-blue-600 dark:bg-blue-500">
                  <Users className="h-5 w-5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border bg-card border-green-200/80 dark:border-green-800">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">Watching Now</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-bold text-green-900 dark:text-green-100">{validActiveViewers.length}</p>
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  </div>
                  <p className="text-xs text-green-600 dark:text-green-400">live viewers right now</p>
                </div>
                <div className="p-3 rounded-full bg-green-600 dark:bg-green-500 animate-pulse">
                  <Eye className="h-5 w-5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border bg-card border-purple-200/80 dark:border-purple-800">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-purple-700 dark:text-purple-300">Live Streams</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-bold text-purple-900 dark:text-purple-100">{activeStreams.length}</p>
                    {activeStreams.length > 0 && <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                  </div>
                  <p className="text-xs text-purple-600 dark:text-purple-400">broadcasting now</p>
                </div>
                <div className={`p-3 rounded-full bg-purple-600 dark:bg-purple-500 ${activeStreams.length > 0 ? 'animate-pulse' : ''}`}>
                  <Play className="h-5 w-5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border bg-card border-orange-200/80 dark:border-orange-800">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-orange-700 dark:text-orange-300">Avg. Watch Time</p>
                  <p className="text-3xl font-bold text-orange-900 dark:text-orange-100">{formatDuration(summary.averageViewDuration)}</p>
                  <p className="text-xs text-orange-600 dark:text-orange-400">per viewing session</p>
                </div>
                <div className="p-3 rounded-full bg-orange-600 dark:bg-orange-500">
                  <Clock className="h-5 w-5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Analytics Tabs */}
      <Tabs defaultValue="overview" className="space-y-4 overflow-x-hidden">
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <TabsList className="w-full min-w-max sm:w-auto h-auto">
            <TabsTrigger value="overview" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-1.5 text-xs sm:text-sm whitespace-nowrap">
              Overview
            </TabsTrigger>
            <TabsTrigger value="viewers" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-1.5 text-xs sm:text-sm whitespace-nowrap">
              <span className="hidden xs:inline">Active Viewers</span>
              <span className="xs:hidden">Viewers</span>
            </TabsTrigger>
            <TabsTrigger value="streams" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-1.5 text-xs sm:text-sm whitespace-nowrap">
              <span className="hidden xs:inline">Stream Performance</span>
              <span className="xs:hidden">Streams</span>
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-1.5 text-xs sm:text-sm whitespace-nowrap">
              <span className="hidden xs:inline">Recent Activity</span>
              <span className="xs:hidden">Activity</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-4 overflow-x-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Current Active Viewers - Who is watching What */}
            <Card className="border-2 overflow-hidden">
              <CardHeader className="border-b bg-muted/40 p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base sm:text-lg">
                      <UserCheck className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 flex-shrink-0" />
                      <span className="break-words">Who is Watching What</span>
                    </CardTitle>
                    <CardDescription className="mt-1 text-xs sm:text-sm">
                      Viewer list refreshes with the dashboard (about every {ADMIN_ANALYTICS_POLL_MS / 1000}s)
                      <span className="block text-muted-foreground mt-1">
                        Approximate location (city/region) from IP when each listener joins.
                      </span>
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700 text-xs whitespace-nowrap flex-shrink-0">
                    {validActiveViewers.length} watching now
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
                {validActiveViewers.length > 0 ? (
                  <ScrollArea className="h-[400px] pr-2 sm:pr-4">
                    <div className="space-y-3">
                      {validActiveViewers.map((viewer) => {
                        const watchTime = Math.floor((new Date().getTime() - new Date(viewer.joinedAt).getTime()) / 1000)
                        return (
                          <div 
                            key={viewer.id} 
                            className="group relative rounded-lg border border-green-200/80 dark:border-green-900 bg-card p-3 sm:p-4 transition-colors hover:bg-muted/50"
                          >
                            <div className="absolute top-2 right-2">
                              <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shadow-lg shadow-green-500/50" />
                            </div>
                            <div className="space-y-2 pr-6">
                              <div className="flex items-start justify-between">
                                <div className="space-y-1 min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <Users className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                                    <p className="font-semibold text-sm sm:text-base truncate">{viewer.subscriberName}</p>
                                  </div>
                                  <div className="flex items-center gap-2 ml-6">
                                    <Eye className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                    <p className="text-xs sm:text-sm text-muted-foreground">watching</p>
                                  </div>
                                  <div className="flex items-center gap-2 ml-6">
                                    <Monitor className="h-4 w-4 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                                    <p className="font-medium text-xs sm:text-sm text-purple-700 dark:text-purple-300 truncate">
                                      {viewer.publisherName}
                                    </p>
                                  </div>
                                  <div className="flex items-start gap-2 ml-6">
                                    <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                                    <div className="min-w-0">
                                      <p className="text-xs sm:text-sm text-muted-foreground break-words">
                                        {formatViewerLocationLabel(viewer.location)}
                                      </p>
                                      {viewer.location?.latitude != null &&
                                        viewer.location?.longitude != null && (
                                          <a
                                            href={`https://www.openstreetmap.org/?mlat=${viewer.location.latitude}&mlon=${viewer.location.longitude}&zoom=9`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-primary inline-flex items-center gap-0.5 mt-0.5 hover:underline"
                                          >
                                            Open map
                                            <ExternalLink className="h-3 w-3" />
                                          </a>
                                        )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-muted-foreground ml-6 pt-1 border-t border-green-100 dark:border-green-900">
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3 flex-shrink-0" />
                                  <span className="whitespace-nowrap">Started {new Date(viewer.joinedAt).toLocaleTimeString()}</span>
                                </div>
                                <div className="w-1 h-1 rounded-full bg-muted-foreground/50 hidden sm:block" />
                                <div className="flex items-center gap-1">
                                  <TrendingUp className="h-3 w-3 flex-shrink-0" />
                                  <span className="whitespace-nowrap">{formatDuration(watchTime)} elapsed</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="text-center text-muted-foreground py-16">
                    <Eye className="mx-auto mb-4 h-16 w-16 text-muted-foreground/35" />
                    <p className="font-medium text-foreground">No Active Viewers</p>
                    <p className="mt-1 text-sm">Viewers will appear here when they join streams</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Active Streams */}
            <Card className="border-2 overflow-hidden">
              <CardHeader className="border-b bg-muted/40 p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base sm:text-lg">
                      <Monitor className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 flex-shrink-0" />
                      <span className="break-words">Live Streams</span>
                    </CardTitle>
                    <CardDescription className="mt-1 text-xs sm:text-sm">
                      Active broadcasts right now. Open live chat to read messages or reply as admin. Use{" "}
                      <strong className="text-foreground">Listen to audio</strong> to hear the same feed subscribers hear
                      (does not count as a viewer in analytics).
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700 text-xs whitespace-nowrap flex-shrink-0">
                    {activeStreams.length} live
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
                {activeStreams.length > 0 ? (
                  <ScrollArea className="h-[400px] pr-2 sm:pr-4">
                    <div className="space-y-3">
                      {activeStreams.map((stream) => {
                        const row = stream as ActiveStreamRow
                        const viewersCount = validActiveViewers.filter(v => v.streamSessionId === stream.id).length
                        const streamDuration = Math.floor((new Date().getTime() - new Date(stream.createdAt).getTime()) / 1000)
                        const chatOpen = openStreamChatId === stream.id
                        const listeningHere = adminListeningStreamId === stream.id
                        return (
                          <div 
                            key={stream.id} 
                            className="group rounded-lg border border-purple-200/80 dark:border-purple-900 bg-card p-3 sm:p-4 transition-colors hover:bg-muted/50"
                          >
                            <div className="space-y-3">
                              <div className="flex items-start justify-between">
                                <div className="space-y-1 flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="destructive" className="animate-pulse text-xs">
                                      <Radio className="h-3 w-3 mr-1" />
                                      LIVE
                                    </Badge>
                                  </div>
                                  <p className="font-semibold text-sm sm:text-base mt-2 break-words">
                                    {stream.title || "Untitled Stream"}
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <Monitor className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                    <p className="text-xs sm:text-sm text-muted-foreground truncate">
                                      by {stream.publisherName}
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-purple-100 dark:border-purple-900">
                                <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-muted-foreground">
                                  <div className="flex items-center gap-1">
                                    <Eye className="h-3 w-3 flex-shrink-0" />
                                    <span className="font-medium whitespace-nowrap">{viewersCount} watching</span>
                                  </div>
                                  <div className="w-1 h-1 rounded-full bg-muted-foreground/50 hidden sm:block" />
                                  <div className="flex items-center gap-1">
                                    <Clock className="h-3 w-3 flex-shrink-0" />
                                    <span className="whitespace-nowrap">{formatDuration(streamDuration)}</span>
                                  </div>
                                </div>
                                <p className="text-xs text-muted-foreground whitespace-nowrap">
                                  {new Date(stream.createdAt).toLocaleTimeString()}
                                </p>
                              </div>
                              <div className="pt-1 space-y-3">
                                <div className="flex flex-col xs:flex-row flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="w-full xs:w-auto gap-2 text-xs sm:text-sm"
                                    onClick={() =>
                                      setOpenStreamChatId((prev) => (prev === stream.id ? null : stream.id))
                                    }
                                  >
                                    <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                                    {chatOpen ? "Hide live chat" : "Show live chat"}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant={listeningHere ? "default" : "outline"}
                                    size="sm"
                                    className="w-full xs:w-auto gap-2 text-xs sm:text-sm"
                                    disabled={!user}
                                    onClick={() =>
                                      setAdminListeningStreamId((prev) => (prev === stream.id ? null : stream.id))
                                    }
                                  >
                                    <Headphones className="h-3.5 w-3.5 shrink-0" />
                                    {listeningHere ? "Stop listening" : "Listen to audio"}
                                  </Button>
                                </div>
                                {!user && (
                                  <p className="text-xs text-muted-foreground">Sign in to use live chat and audio preview.</p>
                                )}
                                {chatOpen && user && (
                                  <StreamChatPanel
                                    streamSessionId={stream.id}
                                    streamTitle={stream.title}
                                    currentUserId={user.uid}
                                    currentUserName={
                                      userProfile?.displayName || userProfile?.email || user.email || "Admin"
                                    }
                                    currentUserEmail={userProfile?.email ?? user.email ?? undefined}
                                    isPublisher={false}
                                    canChat={false}
                                    isAdmin
                                  />
                                )}
                                {listeningHere && user && (
                                  <div className="rounded-lg border border-purple-200/80 dark:border-purple-900 bg-muted/30 p-2">
                                    <p className="text-[11px] text-muted-foreground mb-2">
                                      Admin preview — same channel as subscribers; not counted in viewer analytics.
                                    </p>
                                    <StreamViewer
                                      key={stream.id}
                                      permission={activeStreamToAdminListenPermission(row, user.uid)}
                                      layout="mobileInline"
                                      autoJoin
                                      skipActivityAnalytics
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="text-center text-muted-foreground py-16">
                    <Play className="mx-auto mb-4 h-16 w-16 text-muted-foreground/35" />
                    <p className="font-medium text-foreground">No Live Streams</p>
                    <p className="mt-1 text-sm">Streams will appear here when publishers go live</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="viewers" className="space-y-4 overflow-x-hidden">
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">All Active Viewers</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Complete list of subscribers currently watching streams, with approximate location (IP-based)
                when available.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 sm:p-6">
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <div className="inline-block min-w-full align-middle px-4 sm:px-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[120px]">Subscriber</TableHead>
                        <TableHead className="min-w-[120px]">Watching</TableHead>
                        <TableHead className="min-w-[160px]">Location</TableHead>
                        <TableHead className="hidden md:table-cell min-w-[140px]">Joined At</TableHead>
                        <TableHead className="hidden lg:table-cell min-w-[140px]">Last Seen</TableHead>
                        <TableHead className="min-w-[80px]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validActiveViewers.map((viewer) => (
                        <TableRow key={viewer.id}>
                          <TableCell className="font-medium">
                            <div className="flex flex-col">
                              <span className="text-xs sm:text-sm truncate">{viewer.subscriberName}</span>
                              <span className="text-xs text-muted-foreground md:hidden">
                                Joined: {new Date(viewer.joinedAt).toLocaleDateString()}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs sm:text-sm truncate block">{viewer.publisherName}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 py-2 sm:py-0">
                              <div className="flex items-start gap-1.5 min-w-0">
                                <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                                <span className="text-xs sm:text-sm break-words">
                                  {formatViewerLocationLabel(viewer.location)}
                                </span>
                              </div>
                              {viewer.location?.latitude != null &&
                                viewer.location?.longitude != null && (
                                  <a
                                    href={`https://www.openstreetmap.org/?mlat=${viewer.location.latitude}&mlon=${viewer.location.longitude}&zoom=9`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary inline-flex items-center gap-0.5 shrink-0 sm:ml-0"
                                  >
                                    Map
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <div className="text-xs sm:text-sm">
                              <div>{new Date(viewer.joinedAt).toLocaleDateString()}</div>
                              <div className="text-muted-foreground">{new Date(viewer.joinedAt).toLocaleTimeString()}</div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <div className="text-xs sm:text-sm">
                              <div>{new Date(viewer.lastSeen).toLocaleDateString()}</div>
                              <div className="text-muted-foreground">{new Date(viewer.lastSeen).toLocaleTimeString()}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={viewer.isActive ? "default" : "secondary"} className="text-xs">
                              {viewer.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="streams" className="space-y-4 overflow-x-hidden">
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">Stream Performance</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Top performing streams by view count
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 sm:p-6">
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <div className="inline-block min-w-full align-middle px-4 sm:px-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[150px]">Stream</TableHead>
                        <TableHead className="min-w-[120px]">Publisher</TableHead>
                        <TableHead className="min-w-[100px]">Total Views</TableHead>
                        <TableHead className="min-w-[100px]">Unique Viewers</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getTopStreams().map((stream, index) => (
                        <TableRow key={stream.streamSessionId}>
                          <TableCell className="font-medium">
                            <div className="flex flex-col">
                              <span className="text-xs sm:text-sm">
                                <span className="text-muted-foreground">#{index + 1}</span>{" "}
                                <span className="truncate block">{stream.title || "Untitled Stream"}</span>
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs sm:text-sm truncate block">{stream.publisherName}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs sm:text-sm font-medium">{stream.viewCount}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs sm:text-sm font-medium">{stream.uniqueViewers}</span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4 overflow-x-hidden">
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">Recent Activity</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Latest subscriber actions across all streams
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 sm:p-6">
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <div className="inline-block min-w-full align-middle px-4 sm:px-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[120px]">Subscriber</TableHead>
                        <TableHead className="min-w-[80px]">Action</TableHead>
                        <TableHead className="hidden md:table-cell min-w-[100px]">Stream</TableHead>
                        <TableHead className="min-w-[120px]">Publisher</TableHead>
                        <TableHead className="hidden lg:table-cell min-w-[100px]">Duration</TableHead>
                        <TableHead className="min-w-[140px]">Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getRecentActivity().map((activity) => (
                        <TableRow key={activity.id}>
                          <TableCell className="font-medium">
                            <span className="text-xs sm:text-sm truncate block">{activity.subscriberName}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getActionBadgeVariant(activity.action)} className="text-xs">
                              {activity.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <span className="text-xs sm:text-sm">Stream Session</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs sm:text-sm truncate block">{activity.publisherName}</span>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <span className="text-xs sm:text-sm">
                              {activity.duration ? formatDuration(activity.duration) : "-"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col text-xs sm:text-sm">
                              <span>{new Date(activity.timestamp).toLocaleDateString()}</span>
                              <span className="text-muted-foreground">{new Date(activity.timestamp).toLocaleTimeString()}</span>
                              {activity.duration && (
                                <span className="text-muted-foreground lg:hidden mt-1">
                                  Duration: {formatDuration(activity.duration)}
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

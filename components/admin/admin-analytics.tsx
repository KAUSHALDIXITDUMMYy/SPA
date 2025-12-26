"use client"

import { useState, useEffect, useMemo } from "react"
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
  ChevronUp
} from "lucide-react"
import { type StreamAnalytics, type StreamViewer, type AnalyticsSummary } from "@/lib/analytics"
import { db } from "@/lib/firebase"
import { collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useIsMobile } from "@/hooks/use-mobile"

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
  const isMobile = useIsMobile()

  useEffect(() => {
    setLoading(true)
    setError("")
    
    // Real-time listener for active viewers
    const activeViewersRef = collection(db, "activeViewers")
    const activeViewersQuery = query(activeViewersRef, where("isActive", "==", true))
    
    const unsubViewers = onSnapshot(
      activeViewersQuery,
      (snapshot) => {
        const viewers = snapshot.docs.map(doc => {
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
            isActive: data.isActive
          }
        }) as StreamViewer[]
        
        setActiveViewers(viewers)
        setLastUpdated(new Date())
        setIsLive(true)
      },
      (err) => {
        setError(err.message || "Failed to subscribe to active viewers")
        setIsLive(false)
      }
    )
    
    // Real-time listener for active streams
    const streamsRef = collection(db, "streamSessions")
    const activeStreamsQuery = query(streamsRef, where("isActive", "==", true))
    
    const unsubStreams = onSnapshot(
      activeStreamsQuery,
      (snapshot) => {
        const streams = snapshot.docs.map(doc => {
          const data = doc.data()
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt)
          }
        })
        
        setActiveStreams(streams)
        setLastUpdated(new Date())
      },
      (err) => {
        console.error("Error subscribing to streams:", err)
      }
    )
    
    // Real-time listener for recent analytics
    const analyticsRef = collection(db, "streamAnalytics")
    const analyticsQuery = query(analyticsRef, orderBy("timestamp", "desc"), limit(100))
    
    const unsubAnalytics = onSnapshot(
      analyticsQuery,
      (snapshot) => {
        const analyticsData = snapshot.docs.map(doc => {
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
            duration: data.duration
          }
        }) as StreamAnalytics[]
        
        setAnalytics(analyticsData)
        
        // Calculate summary statistics
        const uniqueViewers = new Set(analyticsData.map(a => a.subscriberId)).size
        const leaveEvents = analyticsData.filter(a => a.action === 'leave')
        const averageViewDuration = leaveEvents.length > 0 
          ? leaveEvents.reduce((sum, event) => sum + (event.duration || 0), 0) / leaveEvents.length
          : 0
        
        setSummary({
          totalAnalytics: analyticsData.length,
          activeViewersCount: activeViewers.length,
          activeStreamsCount: activeStreams.length,
          uniqueViewers,
          averageViewDuration: Math.round(averageViewDuration)
        })
        
        setLastUpdated(new Date())
        setLoading(false)
      },
      (err) => {
        setError(err.message || "Failed to subscribe to analytics")
        setLoading(false)
      }
    )
    
    return () => {
      unsubViewers()
      unsubStreams()
      unsubAnalytics()
    }
  }, [])
  
  // Filter viewers to only show those watching actually active streams and are currently active
  const validActiveViewers = useMemo(() => {
    const activeStreamIds = new Set(activeStreams.map(s => s.id))
    return activeViewers.filter(viewer => 
      activeStreamIds.has(viewer.streamSessionId) && viewer.isActive === true
    )
  }, [activeViewers, activeStreams])
  
  // Update summary when activeViewers or activeStreams change
  useEffect(() => {
    if (analytics.length > 0 || validActiveViewers.length > 0 || activeStreams.length > 0) {
      const uniqueViewers = new Set(analytics.map(a => a.subscriberId)).size
      const leaveEvents = analytics.filter(a => a.action === 'leave')
      const averageViewDuration = leaveEvents.length > 0 
        ? leaveEvents.reduce((sum, event) => sum + (event.duration || 0), 0) / leaveEvents.length
        : 0
      
      setSummary({
        totalAnalytics: analytics.length,
        activeViewersCount: validActiveViewers.length,
        activeStreamsCount: activeStreams.length,
        uniqueViewers,
        averageViewDuration: Math.round(averageViewDuration)
      })
    }
  }, [validActiveViewers, activeStreams, analytics])

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
            <div className="flex items-center gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-200 dark:border-green-800 flex-shrink-0">
              <Radio className={`h-3 w-3 sm:h-3.5 sm:w-3.5 text-green-600 dark:text-green-400 ${isLive ? 'animate-pulse' : ''}`} />
              <span className="text-xs font-semibold text-green-700 dark:text-green-300 whitespace-nowrap">
                {isLive ? "LIVE" : "CONNECTING..."}
              </span>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Real-time insights • Updates automatically as viewers join and leave
          </p>
        </div>
        <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Last update</p>
            <p className="text-xs sm:text-sm font-medium">{lastUpdated.toLocaleTimeString()}</p>
          </div>
          <div className="h-8 w-px bg-border hidden sm:block" />
          <Wifi className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400 animate-pulse" />
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
          <Card className="border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20">
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

          <Card className="border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20">
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

          <Card className="border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/20">
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

          <Card className="border-orange-200 dark:border-orange-800 bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-950/30 dark:to-orange-900/20">
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
              <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base sm:text-lg">
                      <UserCheck className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 flex-shrink-0" />
                      <span className="break-words">Who is Watching What</span>
                    </CardTitle>
                    <CardDescription className="mt-1 text-xs sm:text-sm">
                      Real-time viewer activity • Updates live
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
                            className="group relative p-3 sm:p-4 bg-gradient-to-r from-white to-green-50/30 dark:from-slate-900 dark:to-green-950/20 rounded-lg border border-green-200 dark:border-green-900 hover:shadow-md transition-all duration-200 overflow-hidden"
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
                    <div className="relative inline-block">
                      <Eye className="h-16 w-16 mx-auto mb-4 opacity-20" />
                      <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
                    </div>
                    <p className="font-medium">No Active Viewers</p>
                    <p className="text-sm mt-1">Viewers will appear here when they join streams</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Active Streams */}
            <Card className="border-2 overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base sm:text-lg">
                      <Monitor className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 flex-shrink-0" />
                      <span className="break-words">Live Streams</span>
                    </CardTitle>
                    <CardDescription className="mt-1 text-xs sm:text-sm">
                      Active broadcasts right now
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
                        const viewersCount = validActiveViewers.filter(v => v.streamSessionId === stream.id).length
                        const streamDuration = Math.floor((new Date().getTime() - new Date(stream.createdAt).getTime()) / 1000)
                        return (
                          <div 
                            key={stream.id} 
                            className="group p-3 sm:p-4 bg-gradient-to-r from-white to-purple-50/30 dark:from-slate-900 dark:to-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-900 hover:shadow-md transition-all duration-200 overflow-hidden"
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
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="text-center text-muted-foreground py-16">
                    <div className="relative inline-block">
                      <Play className="h-16 w-16 mx-auto mb-4 opacity-20" />
                      <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
                    </div>
                    <p className="font-medium">No Live Streams</p>
                    <p className="text-sm mt-1">Streams will appear here when publishers go live</p>
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
                Complete list of subscribers currently watching streams
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

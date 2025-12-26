"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  Timer,
  ChevronDown,
  ChevronUp
} from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { getPublisherAnalytics, subscribeToAnalytics, type StreamAnalytics, type StreamViewer } from "@/lib/analytics"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useIsMobile } from "@/hooks/use-mobile"

export function PublisherAnalytics() {
  const { user } = useAuth()
  const [analytics, setAnalytics] = useState<StreamAnalytics[]>([])
  const [currentViewers, setCurrentViewers] = useState<StreamViewer[]>([])
  const [streamSessions, setStreamSessions] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [statsOpen, setStatsOpen] = useState(false)
  const isMobile = useIsMobile()

  const loadAnalytics = async () => {
    if (!user?.uid) return
    
    setLoading(true)
    setError("")
    
    try {
      const data = await getPublisherAnalytics(user.uid, 100)
      setAnalytics(data.analytics)
      setCurrentViewers(data.currentViewers)
      setStreamSessions(data.streamSessions)
      setSummary(data.summary)
      setLastUpdated(new Date())
    } catch (err: any) {
      setError(err.message || "Failed to load analytics")
    }
    
    setLoading(false)
  }

  useEffect(() => {
    if (!user?.uid) return

    loadAnalytics()
    
    // Set up real-time subscription
    const unsubscribe = subscribeToAnalytics(user.uid, (data) => {
      setAnalytics(data.analytics)
      setCurrentViewers(data.currentViewers)
      setLastUpdated(new Date())
    })

    // Auto-refresh every 30 seconds as backup
    const interval = setInterval(loadAnalytics, 30000)
    
    return () => {
      unsubscribe()
      clearInterval(interval)
    }
  }, [user?.uid])

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

  const getCurrentStreamViewers = () => {
    return currentViewers.filter(viewer => viewer.isActive)
  }

  const getStreamStats = () => {
    const activeStream = streamSessions.find(s => s.isActive)
    if (!activeStream) return null

    const streamAnalytics = analytics.filter(a => a.streamSessionId === activeStream.id)
    const joinEvents = streamAnalytics.filter(a => a.action === 'join')
    const leaveEvents = streamAnalytics.filter(a => a.action === 'leave')
    
    return {
      streamId: activeStream.id,
      title: activeStream.title,
      createdAt: activeStream.createdAt,
      totalViews: joinEvents.length,
      uniqueViewers: new Set(joinEvents.map(e => e.subscriberId)).size,
      currentViewers: getCurrentStreamViewers().length,
      averageViewDuration: leaveEvents.length > 0 
        ? leaveEvents.reduce((sum, event) => sum + (event.duration || 0), 0) / leaveEvents.length
        : 0
    }
  }

  if (loading && analytics.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  const streamStats = getStreamStats()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Your Stream Analytics</h2>
          <p className="text-muted-foreground">
            Track who's watching your streams and analyze viewer engagement
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-muted-foreground">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </span>
          <Button variant="outline" size="sm" onClick={loadAnalytics} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
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
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Eye className="h-4 w-4 text-green-600" />
                <div>
                  <p className="text-sm font-medium">Current Viewers</p>
                  <p className="text-2xl font-bold">{summary.currentViewersCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Users className="h-4 w-4 text-blue-600" />
                <div>
                  <p className="text-sm font-medium">Total Views</p>
                  <p className="text-2xl font-bold">{summary.totalViews || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <UserCheck className="h-4 w-4 text-purple-600" />
                <div>
                  <p className="text-sm font-medium">Unique Viewers</p>
                  <p className="text-2xl font-bold">{summary.uniqueViewers || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Play className="h-4 w-4 text-orange-600" />
                <div>
                  <p className="text-sm font-medium">Total Streams</p>
                  <p className="text-2xl font-bold">{summary.totalStreams || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Current Stream Stats - Collapsible on Mobile */}
      {streamStats && (
        <Collapsible 
          open={isMobile ? statsOpen : true} 
          onOpenChange={setStatsOpen}
          className="md:!block"
        >
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center space-x-2">
                    <Badge variant="destructive" className="animate-pulse">
                      LIVE
                    </Badge>
                    <span className="text-base sm:text-lg">Current Stream: {streamStats.title}</span>
                  </CardTitle>
                  <CardDescription>
                    Started at {new Date(streamStats.createdAt).toLocaleString()}
                  </CardDescription>
                </div>
                <CollapsibleTrigger asChild className="md:hidden">
                  <Button variant="ghost" size="sm">
                    {statsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
              </div>
            </CardHeader>
            <CollapsibleContent className="md:!block">
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-600">{streamStats.currentViewers}</p>
                    <p className="text-sm text-muted-foreground">Currently Watching</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-600">{streamStats.totalViews}</p>
                    <p className="text-sm text-muted-foreground">Total Views</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-purple-600">{streamStats.uniqueViewers}</p>
                    <p className="text-sm text-muted-foreground">Unique Viewers</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-orange-600">
                      {formatDuration(Math.round(streamStats.averageViewDuration))}
                    </p>
                    <p className="text-sm text-muted-foreground">Avg. View Duration</p>
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Analytics Tabs */}
      <Tabs defaultValue="viewers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="viewers">Current Viewers</TabsTrigger>
          <TabsTrigger value="history">View History</TabsTrigger>
          <TabsTrigger value="activity">Recent Activity</TabsTrigger>
          <TabsTrigger value="streams">Stream History</TabsTrigger>
        </TabsList>

        <TabsContent value="viewers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <UserCheck className="h-5 w-5" />
                <span>Who's Watching Right Now</span>
              </CardTitle>
              <CardDescription>
                Subscribers currently viewing your stream
              </CardDescription>
            </CardHeader>
            <CardContent>
              {getCurrentStreamViewers().length > 0 ? (
                <div className="space-y-2">
                  {getCurrentStreamViewers().map((viewer) => (
                    <div key={viewer.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white text-sm font-medium">
                          {viewer.subscriberName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{viewer.subscriberName}</p>
                          <p className="text-sm text-muted-foreground">
                            Joined {new Date(viewer.joinedAt).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="text-xs">
                          <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
                          Watching
                        </Badge>
                        <p className="text-sm text-muted-foreground mt-1">
                          {Math.floor((Date.now() - new Date(viewer.joinedAt).getTime()) / 60000)}m ago
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No one is currently watching</p>
                  <p className="text-sm">Start streaming to see viewers here</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Viewer History</CardTitle>
              <CardDescription>
                Complete list of subscribers who have watched your streams
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subscriber</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Stream</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.map((activity) => (
                    <TableRow key={activity.id}>
                      <TableCell className="font-medium">{activity.subscriberName}</TableCell>
                      <TableCell>
                        <Badge variant={getActionBadgeVariant(activity.action)}>
                          {activity.action}
                        </Badge>
                      </TableCell>
                      <TableCell>Stream Session</TableCell>
                      <TableCell>
                        {activity.duration ? formatDuration(activity.duration) : "-"}
                      </TableCell>
                      <TableCell>{new Date(activity.timestamp).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>
                Latest viewer actions on your streams
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {getRecentActivity().map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white text-sm font-medium">
                        {activity.subscriberName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{activity.subscriberName}</p>
                        <p className="text-sm text-muted-foreground">
                          {activity.action === 'join' ? 'joined your stream' : 
                           activity.action === 'leave' ? 'left your stream' : 
                           'is viewing your stream'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={getActionBadgeVariant(activity.action)}>
                        {activity.action}
                      </Badge>
                      <p className="text-sm text-muted-foreground mt-1">
                        {new Date(activity.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="streams" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Stream History</CardTitle>
              <CardDescription>
                All your past and current streams
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Ended</TableHead>
                    <TableHead>Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {streamSessions.map((stream) => (
                    <TableRow key={stream.id}>
                      <TableCell className="font-medium">
                        {stream.title || "Untitled Stream"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={stream.isActive ? "destructive" : "secondary"}>
                          {stream.isActive ? "Live" : "Ended"}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(stream.createdAt).toLocaleString()}</TableCell>
                      <TableCell>
                        {stream.endedAt ? new Date(stream.endedAt).toLocaleString() : "-"}
                      </TableCell>
                      <TableCell>
                        {stream.endedAt 
                          ? formatDuration(Math.floor((new Date(stream.endedAt).getTime() - new Date(stream.createdAt).getTime()) / 1000))
                          : stream.isActive 
                            ? formatDuration(Math.floor((Date.now() - new Date(stream.createdAt).getTime()) / 1000))
                            : "-"
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

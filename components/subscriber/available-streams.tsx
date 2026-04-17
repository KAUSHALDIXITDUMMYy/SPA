"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/hooks/use-auth"
import {
  compareSubscriberPermissionsByStreamStart,
  getAvailableStreamsSplit,
  type SubscriberPermission,
} from "@/lib/subscriber"
import { isAwaitingBroadcastSession } from "@/lib/streaming"
import {
  US_STREAM_SPORTS,
  SPORT_FILTER_ALL,
  SPORT_FILTER_UNSPECIFIED,
  matchesSportFilter,
  streamSportLabel,
} from "@/lib/sports"
import { StreamViewer, type StreamViewerHandle } from "./stream-viewer"
import { Radio, Users, Volume2, Clock, RefreshCw, Filter } from "lucide-react"

export function AvailableStreams() {
  const { user } = useAuth()
  const [permissions, setPermissions] = useState<SubscriberPermission[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStream, setSelectedStream] = useState<SubscriberPermission | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [sportFilter, setSportFilter] = useState<string>(SPORT_FILTER_ALL)
  const streamViewerRef = useRef<StreamViewerHandle>(null)

  const filteredPermissions = useMemo(
    () => permissions.filter((p) => matchesSportFilter(p.streamSession?.sport, sportFilter)),
    [permissions, sportFilter],
  )

  useEffect(() => {
    if (user) {
      loadStreams()
      // Set up periodic refresh for live streams
      const interval = setInterval(loadStreams, 30000) // Refresh every 30 seconds
      return () => clearInterval(interval)
    }
  }, [user])

  const loadStreams = async () => {
    if (!user) return

    const isInitialLoad = loading
    if (!isInitialLoad) setRefreshing(true)

    try {
      const { adHoc: availableStreams } = await getAvailableStreamsSplit(user.uid)
      
      const sortedStreams = [...availableStreams].sort(compareSubscriberPermissionsByStreamStart)
      
      setPermissions(sortedStreams)

      // If currently selected stream is no longer available, clear selection
      if (selectedStream && !availableStreams.find((p) => p.id === selectedStream.id)) {
        setSelectedStream(null)
      }
    } catch (error) {
      console.error("Error loading streams:", error)
    }

    setLoading(false)
    setRefreshing(false)
  }

  const handleSelectStream = (permission: SubscriberPermission) => {
    // Auto-join when selecting stream
    setSelectedStream(permission)
  }

  const handleBackToList = () => {
    void streamViewerRef.current?.leaveStream()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading available audio streams...</p>
        </div>
      </div>
    )
  }

  // Show selected stream viewer
  if (selectedStream) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-4">
          <Button type="button" variant="outline" onClick={handleBackToList} className="w-full sm:w-auto text-sm sm:text-base">
            ← Back to Streams
          </Button>
          <Button variant="outline" onClick={loadStreams} disabled={refreshing} className="w-full sm:w-auto text-sm sm:text-base">
            <RefreshCw className={`h-4 w-4 mr-2 flex-shrink-0 ${refreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
        </div>
        <StreamViewer
          ref={streamViewerRef}
          permission={selectedStream}
          onLeaveStream={() => setSelectedStream(null)}
          autoJoin={true}
        />
      </div>
    )
  }

  // Show streams list
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl sm:text-2xl font-bold">Available Audio Streams</h2>
          <p className="text-sm sm:text-base text-muted-foreground">
            {permissions.length} audio stream{permissions.length !== 1 ? "s" : ""} available to you
          </p>
        </div>
        <Button variant="outline" onClick={loadStreams} disabled={refreshing} className="w-full sm:w-auto text-sm sm:text-base">
          <RefreshCw className={`h-4 w-4 mr-2 flex-shrink-0 ${refreshing ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Streams Grid */}
      {permissions.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center p-12">
            <div className="text-center text-muted-foreground">
              <Radio className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No Active Audio Streams</h3>
              <p>There are currently no live audio streams available to you.</p>
              <p className="text-sm mt-2">Check back later or contact your administrator for access.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2 max-w-md">
            <Label htmlFor="available-sport-filter" className="flex items-center gap-2 text-sm font-medium">
              <Filter className="h-4 w-4 text-muted-foreground" />
              Filter by sport
            </Label>
            <Select value={sportFilter} onValueChange={setSportFilter}>
              <SelectTrigger id="available-sport-filter" className="w-full text-sm sm:text-base">
                <SelectValue placeholder="All sports" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SPORT_FILTER_ALL}>All sports</SelectItem>
                <SelectItem value={SPORT_FILTER_UNSPECIFIED}>Not specified</SelectItem>
                {US_STREAM_SPORTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filteredPermissions.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                No streams match this sport. Try another filter or &quot;All sports&quot;.
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {filteredPermissions.map((permission) => (
            <Card key={permission.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="p-4 sm:p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 min-w-0 flex-1">
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      {permission.streamSession && isAwaitingBroadcastSession(permission.streamSession) ? (
                        <Badge variant="secondary" className="text-xs flex-shrink-0">
                          Waiting for host
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="animate-pulse text-xs flex-shrink-0">
                          LIVE
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs font-normal">
                        {streamSportLabel(permission.streamSession?.sport)}
                      </Badge>
                      <span className="break-words text-sm sm:text-base">{permission.streamSession?.title}</span>
                    </CardTitle>
                    <CardDescription className="space-y-1 text-xs sm:text-sm">
                      <div className="flex items-center space-x-1">
                        <Users className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                        <span className="truncate">Publisher: {permission.publisherName}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Clock className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                        <span>Started: {new Date(permission.streamSession!.createdAt).toLocaleTimeString()}</span>
                      </div>
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 pt-0">
                {/* Stream Description */}
                {permission.streamSession?.description && (
                  <p className="text-xs sm:text-sm text-muted-foreground break-words">{permission.streamSession.description}</p>
                )}

                {/* Permissions */}
                <div className="flex items-center space-x-4 p-2 sm:p-3 bg-muted rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Volume2 className={`h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0 ${permission.allowAudio ? "text-green-600" : "text-gray-400"}`} />
                    <span className="text-xs sm:text-sm">Audio</span>
                  </div>
                </div>

                {/* Action Button */}
                <Button onClick={() => handleSelectStream(permission)} className="w-full text-sm sm:text-base">
                  <Radio className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="truncate">Listen to Stream</span>
                </Button>
              </CardContent>
            </Card>
          ))}
          </div>
        </div>
      )}
    </div>
  )
}

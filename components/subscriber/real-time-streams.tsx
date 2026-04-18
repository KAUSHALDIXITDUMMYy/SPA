"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/hooks/use-auth"
import { compareSubscriberPermissionsByStreamStart, getAvailableStreamsSplit } from "@/lib/subscriber"
import { isAwaitingBroadcastSession } from "@/lib/streaming"
import type { SubscriberPermission } from "@/lib/subscriber"
import { US_STREAM_SPORTS, SPORT_FILTER_ALL, SPORT_FILTER_UNSPECIFIED, streamSportLabel } from "@/lib/sports"
import { StreamViewer, type StreamViewerHandle } from "./stream-viewer"
import { SubscriberFloatingChat } from "@/components/subscriber/subscriber-floating-chat"
import { useIsMobile } from "@/hooks/use-mobile"
import { Radio, Activity, Filter as FilterIcon, RefreshCw, Loader2, Square } from "lucide-react"

export function RealTimeStreams() {
  const { user, userProfile } = useAuth()
  const isMobile = useIsMobile()
  const [availableStreams, setAvailableStreams] = useState<SubscriberPermission[]>([])
  const [selectedStream, setSelectedStream] = useState<SubscriberPermission | null>(null)
  const [sportFilter, setSportFilter] = useState<string>(SPORT_FILTER_ALL)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const streamViewerRef = useRef<StreamViewerHandle>(null)
  /**
   * After leave completes we set selection to null (full StreamViewer unmount, same as "Back to Streams").
   * Then we open the stream the user tapped. A direct A→B swap kept the viewer mounted in one commit and
   * overlapped Agora teardown with the next join, which on mobile often produced ~2s audio then silence.
   */
  const pendingStreamRef = useRef<SubscriberPermission | null>(null)

  const filteredStreams = availableStreams.filter((perm) => {
    const sport = perm.streamSession?.sport
    if (sportFilter === SPORT_FILTER_ALL) return true
    const s = sport?.trim() ?? ""
    if (sportFilter === SPORT_FILTER_UNSPECIFIED) return s === ""
    return s === sportFilter
  })

  const loadStreams = useCallback(
    async (options?: { manual?: boolean }) => {
      if (!user) return
      const isManual = options?.manual === true
      if (isManual) setRefreshing(true)
      try {
        const { adHoc: streams } = await getAvailableStreamsSplit(user.uid)
        const sortedStreams = [...streams].sort(compareSubscriberPermissionsByStreamStart)
        setAvailableStreams(sortedStreams)
        setSelectedStream((current) => {
          if (!current) return current
          const updated = streams.find((s) => s.id === current.id) || null
          return updated
        })
        setError("")
      } catch (err: any) {
        console.error("[v0] Error loading streams:", err)
        setError("Failed to load streams")
      } finally {
        setLoading(false)
        if (isManual) setRefreshing(false)
      }
    },
    [user],
  )

  useEffect(() => {
    if (!user) return
    void loadStreams()
    const interval = setInterval(() => void loadStreams(), 15_000)
    return () => clearInterval(interval)
  }, [user, loadStreams])

  /** Apply pending stream only after viewer has fully unmounted (selectedStream === null). */
  useEffect(() => {
    if (selectedStream !== null) return
    const next = pendingStreamRef.current
    if (!next) return
    pendingStreamRef.current = null
    setSelectedStream(next)
  }, [selectedStream])

  const handleAfterLeaveStream = useCallback(() => {
    setSelectedStream(null)
  }, [])

  const handleSelectStream = async (stream: SubscriberPermission) => {
    console.log("[v0] Selecting stream:", stream.id)
    if (selectedStream?.id === stream.id) return
    if (!selectedStream && pendingStreamRef.current?.id === stream.id) return

    if (selectedStream && selectedStream.id !== stream.id) {
      pendingStreamRef.current = stream
      await streamViewerRef.current?.leaveStream()
      return
    }
    if (!selectedStream && pendingStreamRef.current) {
      pendingStreamRef.current = stream
      return
    }
    setSelectedStream(stream)
  }

  const handleBackToList = () => {
    pendingStreamRef.current = null
    void streamViewerRef.current?.leaveStream()
  }

  const handleStopStream = useCallback(() => {
    pendingStreamRef.current = null
    void streamViewerRef.current?.leaveStream()
  }, [])

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading audio streams...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const streamListSection = (
    <div className="space-y-3 sm:space-y-4">
      <div className="space-y-2">
        <Label htmlFor="sport-filter" className="flex items-center gap-2 text-sm font-medium">
          <FilterIcon className="h-4 w-4 text-muted-foreground" />
          Filter by sport
        </Label>
        <Select value={sportFilter} onValueChange={setSportFilter}>
          <SelectTrigger id="sport-filter" className="w-full text-sm sm:text-base">
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

      {filteredStreams.length === 0 && availableStreams.length > 0 && (
        <Alert>
          <AlertDescription>
            No live streams match this sport. Try &quot;All sports&quot; or pick another category.
          </AlertDescription>
        </Alert>
      )}

      {filteredStreams.map((perm) => {
        const isSelected = selectedStream?.id === perm.id
        return (
          <Card
            key={perm.id}
            className={`transition-shadow hover:shadow-lg ${isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
          >
            <CardHeader
              className="cursor-pointer p-3 sm:p-4 lg:p-6"
              onClick={() => void handleSelectStream(perm)}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {perm.streamSession && isAwaitingBroadcastSession(perm.streamSession) ? (
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        Waiting for host
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="animate-pulse shrink-0 text-xs">
                        LIVE
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs font-normal">
                      {streamSportLabel(perm.streamSession?.sport)}
                    </Badge>
                    <span className="break-words text-sm sm:text-base">
                      {perm.streamSession?.title || "Untitled Stream"}
                    </span>
                  </CardTitle>
                  <CardDescription className="truncate text-xs sm:text-sm">
                    Publisher: {perm.publisherName}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-0 p-3 pt-0 sm:p-4 sm:pt-0 lg:p-6 lg:pt-0">
              <div className="flex gap-2">
                <Button
                  type="button"
                  className="min-w-0 flex-1"
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleSelectStream(perm)
                  }}
                >
                  <Radio className="mr-2 h-4 w-4 shrink-0" />
                  Listen
                </Button>
                {isSelected ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0 gap-1"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleStopStream()
                    }}
                  >
                    <Square className="h-3.5 w-3.5" />
                    Stop
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )

  const rightPane = (
    <div className="p-0">
      {selectedStream ? (
        <StreamViewer
          ref={streamViewerRef}
          key={selectedStream.streamSession?.id || selectedStream.id}
          permission={selectedStream}
          onLeaveStream={handleAfterLeaveStream}
          autoJoin={true}
          layout="standard"
        />
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center p-12 text-muted-foreground">
            Select an audio stream to start listening
          </CardContent>
        </Card>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Real-time Status */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <Activity className="h-5 w-5 text-green-500 shrink-0" />
              <CardTitle>Live Audio Streams</CardTitle>
              <Badge variant="outline" className="animate-pulse">
                Auto-updating
              </Badge>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 w-full shrink-0 gap-2 sm:w-auto sm:min-w-[8.5rem]"
              disabled={loading || refreshing}
              onClick={() => void loadStreams({ manual: true })}
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
          <CardDescription>
            Only <strong className="text-foreground">publisher-started</strong> streams (not tied to a scheduled game room).
            Admin-scheduled rooms are under the <strong className="text-foreground">Calls</strong> tab.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Available Streams + Viewer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {availableStreams.length === 0 ? (
          <Card className="lg:col-span-3">
            <CardContent className="flex items-center justify-center p-8 sm:p-12">
              <div className="text-center text-muted-foreground">
                <Radio className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-4 opacity-50" />
                <h3 className="text-base sm:text-lg font-medium mb-2">No publisher streams right now</h3>
                <p className="text-sm sm:text-base">
                  No direct streams from your publishers. Scheduled game rooms are in the <strong>Calls</strong> tab.
                </p>
                <p className="text-xs sm:text-sm mt-2">
                  Contact your administrator for access, or wait for a publisher to go live outside a scheduled room.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 gap-2"
                  disabled={refreshing}
                  onClick={() => void loadStreams({ manual: true })}
                >
                  {refreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Check again
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : isMobile && selectedStream ? (
          <div className="lg:col-span-3 space-y-4">
            <p className="text-xs text-muted-foreground">
              Tap another stream to switch. Audio starts as soon as you open a live feed.
            </p>
            {streamListSection}
            <StreamViewer
              ref={streamViewerRef}
              key={selectedStream.streamSession?.id || selectedStream.id}
              permission={selectedStream}
              onLeaveStream={handleAfterLeaveStream}
              autoJoin={true}
              layout="mobileInline"
            />
            {user && userProfile && selectedStream.streamSession?.id ? (
              <SubscriberFloatingChat
                streamSessionId={selectedStream.streamSession.id}
                streamTitle={selectedStream.streamSession.title}
                userId={user.uid}
                userName={userProfile.displayName || userProfile.email || ""}
                userEmail={userProfile.email}
                allowChat={userProfile.allowChat === true}
              />
            ) : null}
          </div>
        ) : selectedStream ? (
          <div className="lg:col-span-3">
            <div className="mb-4">
              <Button variant="outline" onClick={handleBackToList} className="w-full text-sm sm:w-auto sm:text-base">
                ← Back to Streams
              </Button>
            </div>
            {rightPane}
          </div>
        ) : (
          <>
            <div className="space-y-3 sm:space-y-4 lg:col-span-1">{streamListSection}</div>
            <div className="hidden lg:col-span-2 lg:block">{rightPane}</div>
          </>
        )}
      </div>
    </div>
  )
}

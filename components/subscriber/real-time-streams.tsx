"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/hooks/use-auth"
import { useSubscriberDashboard } from "@/hooks/use-subscriber-dashboard"
import { compareSubscriberPermissionsByStreamStart } from "@/lib/subscriber"
import { isAwaitingBroadcastSession } from "@/lib/streaming"
import type { SubscriberPermission } from "@/lib/subscriber"
import { US_STREAM_SPORTS, SPORT_FILTER_ALL, SPORT_FILTER_UNSPECIFIED, streamSportLabel } from "@/lib/sports"
import { StreamViewer, type StreamViewerHandle } from "./stream-viewer"
import { SubscriberFloatingChat } from "@/components/subscriber/subscriber-floating-chat"
import { useIsMobile } from "@/hooks/use-mobile"
import { Radio, Activity, Filter as FilterIcon, RefreshCw, Loader2, Square } from "lucide-react"

export function RealTimeStreams() {
  const { user, userProfile } = useAuth()
  const { adHoc, loading, refreshing, error, refresh } = useSubscriberDashboard()
  const isMobile = useIsMobile()
  const [selectedStream, setSelectedStream] = useState<SubscriberPermission | null>(null)
  const [sportFilter, setSportFilter] = useState<string>(SPORT_FILTER_ALL)
  const streamViewerRef = useRef<StreamViewerHandle>(null)
  const pendingStreamRef = useRef<SubscriberPermission | null>(null)

  const availableStreams = useMemo(
    () => [...adHoc].sort(compareSubscriberPermissionsByStreamStart),
    [adHoc],
  )

  useEffect(() => {
    setSelectedStream((current) => {
      if (!current) return current
      return availableStreams.find((s) => s.id === current.id) ?? null
    })
  }, [availableStreams])

  const filteredStreams = availableStreams.filter((perm) => {
    const sport = perm.streamSession?.sport
    if (sportFilter === SPORT_FILTER_ALL) return true
    const s = sport?.trim() ?? ""
    if (sportFilter === SPORT_FILTER_UNSPECIFIED) return s === ""
    return s === sportFilter
  })

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

  const handleStopStream = useCallback(() => {
    pendingStreamRef.current = null
    void streamViewerRef.current?.leaveStream()
  }, [])

  if (loading) {
    return (
      <div className="border border-border rounded-lg p-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
        <p className="text-muted-foreground text-sm font-mono">LOADING STREAMS...</p>
      </div>
    )
  }

  const streamListSection = (
    <div className="space-y-3">
      {/* Sport filter */}
      <div className="space-y-2">
        <Label htmlFor="sport-filter" className="flex items-center gap-2 text-xs font-mono tracking-wider text-muted-foreground">
          <FilterIcon className="h-3.5 w-3.5" />
          FILTER BY SPORT
        </Label>
        <Select value={sportFilter} onValueChange={setSportFilter}>
          <SelectTrigger id="sport-filter" className="w-full text-sm bg-secondary border-border font-mono">
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
          <AlertDescription className="font-mono text-xs">
            No live streams match this sport. Try &quot;All sports&quot; or pick another category.
          </AlertDescription>
        </Alert>
      )}

      {/* Stream cards */}
      {filteredStreams.map((perm) => {
        const isSelected = selectedStream?.id === perm.id
        const isAwaiting = perm.streamSession && isAwaitingBroadcastSession(perm.streamSession)
        return (
          <div
            key={perm.id}
            onClick={() => void handleSelectStream(perm)}
            className={`border rounded-lg p-4 cursor-pointer transition-all ${
              isSelected
                ? "border-primary bg-primary/5"
                : "border-border bg-card hover:border-primary/30"
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                {isAwaiting ? (
                  <span className="text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
                    PENDING
                  </span>
                ) : (
                  <span className="text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse">
                    LIVE
                  </span>
                )}
                <span className="text-[10px] font-mono text-muted-foreground px-2 py-0.5 rounded bg-secondary border border-border">
                  {streamSportLabel(perm.streamSession?.sport)}
                </span>
              </div>
            </div>
            <h4 className="font-medium text-sm text-foreground mb-1 break-words">
              {perm.streamSession?.title || "Untitled Stream"}
            </h4>
            <p className="text-xs text-muted-foreground font-mono mb-3">
              HOST: {perm.publisherName?.toUpperCase()}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className="flex-1 font-mono tracking-wider text-xs"
                onClick={(e) => {
                  e.stopPropagation()
                  void handleSelectStream(perm)
                }}
              >
                <Radio className="mr-2 h-3.5 w-3.5" />
                LISTEN
              </Button>
              {isSelected && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0 font-mono tracking-wider text-xs"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleStopStream()
                  }}
                >
                  <Square className="h-3 w-3 mr-1" />
                  STOP
                </Button>
              )}
            </div>
          </div>
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
        <div className="border border-border rounded-lg p-12 text-center">
          <Radio className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-mono">SELECT A STREAM TO LISTEN</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Choose from the list to begin playback.</p>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-mono text-lg font-bold tracking-wide uppercase">Streams</h2>
            <p className="text-[10px] font-mono text-muted-foreground tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              AUTO-UPDATING
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="font-mono text-xs tracking-wider"
          disabled={loading || refreshing}
          onClick={() => void refresh(true)}
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
          CHECK AGAIN
        </Button>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {availableStreams.length === 0 ? (
          <div className="lg:col-span-3 border border-border rounded-lg p-12 text-center">
            <Radio className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="font-mono text-base font-bold text-foreground mb-2 uppercase">No Streams Right Now</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              No direct streams from your publishers. Scheduled game rooms are in the Calls tab.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-4 font-mono text-xs tracking-wider"
              disabled={refreshing}
              onClick={() => void refresh(true)}
            >
              {refreshing ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
              CHECK AGAIN
            </Button>
          </div>
        ) : isMobile && selectedStream ? (
          <div className="lg:col-span-3 space-y-4">
            <p className="text-xs text-muted-foreground font-mono">
              Tap another stream to switch. Audio starts immediately.
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
        ) : isMobile ? (
          <div className="lg:col-span-3">{streamListSection}</div>
        ) : (
          <>
            <div className="lg:col-span-1 min-h-0 lg:max-h-[min(75vh,640px)] lg:overflow-y-auto lg:pr-1">
              {streamListSection}
            </div>
            <div className="lg:col-span-2 min-h-0 space-y-4">
              {rightPane}
              {selectedStream && user && userProfile && selectedStream.streamSession?.id ? (
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
          </>
        )}
      </div>
    </div>
  )
}

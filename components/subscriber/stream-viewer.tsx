"use client"

import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { agoraManager } from "@/lib/agora"
import { startSilentAudio, stopSilentAudio } from "@/lib/silent-audio"
import type { SubscriberPermission } from "@/lib/subscriber"
import { isAwaitingBroadcastSession } from "@/lib/streaming"
import { trackSubscriberActivity } from "@/lib/analytics"
import { fetchApproximateViewerLocation } from "@/lib/viewer-location"
import { useAuth } from "@/hooks/use-auth"
import { Volume2, VolumeX, Users, Clock, Radio, Headphones, Square } from "lucide-react"
import { StreamChatPanel } from "@/components/ui/stream-chat-panel"
import { streamSportLabel } from "@/lib/sports"
import { AudioPlayingIndicator } from "@/components/subscriber/audio-playing-indicator"

export type StreamViewerLayout = "standard" | "mobileInline"

/** Imperative API so parents can run the same cleanup as the Stop button before switching streams or going back. */
export type StreamViewerHandle = {
  leaveStream: () => Promise<void>
}

interface StreamViewerProps {
  permission: SubscriberPermission
  onJoinStream?: (permission: SubscriberPermission) => void
  onLeaveStream?: () => void
  autoJoin?: boolean
  /** Compact in-list player on phone; chat is expected via floating sheet. */
  layout?: StreamViewerLayout
}

export const StreamViewer = forwardRef<StreamViewerHandle, StreamViewerProps>(function StreamViewer(
  {
    permission,
    onJoinStream,
    onLeaveStream,
    autoJoin = true,
    layout = "standard",
  },
  ref,
) {
  const { user, userProfile } = useAuth()
  const [isConnected, setIsConnected] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [audioEnabled, setAudioEnabled] = useState(true) // Audio enabled by default for audio-only streams
  const [joinTime, setJoinTime] = useState<Date | null>(null)
  const jitsiContainerRef = useRef<HTMLDivElement>(null)
  const currentStreamIdRef = useRef<string | null>(null)
  /** Permission for the stream we're currently in (for correct leave analytics when switching) */
  const currentPermissionRef = useRef<SubscriberPermission | null>(null)
  const isJoiningRef = useRef(false)
  const switchGenerationRef = useRef(0)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const handleJoinStream = async () => {
    if (isJoiningRef.current) return // Prevent duplicate join calls
    if (!permission.streamSession || !user || !userProfile) return

    isJoiningRef.current = true
    setLoading(true)
    setError("")

    try {
      const [, approxLocation] = await Promise.all([
        agoraManager.join({
          channelName: permission.streamSession.roomId,
          role: "audience",
          container: jitsiContainerRef.current || document.body, // Container not needed for audio-only
          width: "100%",
          height: 500,
        }),
        fetchApproximateViewerLocation(),
      ])

      if (!isMountedRef.current) {
        await agoraManager.leave()
        return
      }

      const joinTimestamp = new Date()
      setJoinTime(joinTimestamp)
      setIsConnected(true)
      currentPermissionRef.current = permission
      setLoading(false)
      onJoinStream?.(permission)

      setAudioEnabled(true) // Audio is enabled by default for audio streams
      // Start silent audio to reduce tab throttling when backgrounded (minimized)
      startSilentAudio()

      // Track analytics (approximate location for admin live viewer map)
      await trackSubscriberActivity({
        streamSessionId: permission.streamSession.id!,
        subscriberId: user.uid,
        subscriberName: userProfile.displayName || userProfile.email,
        publisherId: permission.publisherId,
        publisherName: permission.publisherName,
        action: "join",
        location: approxLocation ?? undefined,
      })
    } catch (err: any) {
      if (isMountedRef.current) {
        setError(err.message || "Failed to join stream")
        setLoading(false)
      }
    } finally {
      isJoiningRef.current = false
    }
  }

  /** Leave current stream. Pass explicit permission for analytics when switching (so we record leave for the stream we're leaving, not the new one). */
  const handleLeaveStream = useCallback(
    async (permissionForAnalytics?: SubscriberPermission) => {
      const forAnalytics = permissionForAnalytics ?? permission
      if (!user || !userProfile || !forAnalytics.streamSession) return

      // Calculate viewing duration
      const duration = joinTime ? Math.floor((Date.now() - joinTime.getTime()) / 1000) : 0

      // Track analytics before leaving (use the stream we're actually leaving)
      await trackSubscriberActivity({
        streamSessionId: forAnalytics.streamSession.id!,
        subscriberId: user.uid,
        subscriberName: userProfile.displayName || userProfile.email,
        publisherId: forAnalytics.publisherId,
        publisherName: forAnalytics.publisherName,
        action: "leave",
        duration,
      })

      await agoraManager.leave()
      stopSilentAudio()
      setIsConnected(false)
      setLoading(false)
      setJoinTime(null)
      currentPermissionRef.current = null
      currentStreamIdRef.current = null
      onLeaveStream?.()
    },
    [user, userProfile, permission, joinTime, onLeaveStream],
  )

  useImperativeHandle(
    ref,
    () => ({
      leaveStream: () => handleLeaveStream(),
    }),
    [handleLeaveStream],
  )

  const handleToggleAudio = async () => {
    if (!permission.allowAudio) return

    try {
      // For audio-only streams, we can mute/unmute the audio playback
      // This is handled by the browser's audio context, not Agora directly
      setAudioEnabled(!audioEnabled)
      // Note: Actual audio muting would need to be implemented via Agora's remote audio track controls
    } catch (err: any) {
      setError("Failed to toggle audio")
    }
  }

  // Auto-join when component mounts or stream changes (do not depend on isConnected to avoid double leave/join on switch)
  useEffect(() => {
    if (!autoJoin || !permission.streamSession || !user || !userProfile) return
    if (isAwaitingBroadcastSession(permission.streamSession)) return

    const streamId = permission.streamSession.roomId
    const generation = ++switchGenerationRef.current
    let cancelled = false
    let retryTimeout: ReturnType<typeof setTimeout> | null = null

    const clearRetry = () => {
      if (retryTimeout != null) {
        clearTimeout(retryTimeout)
        retryTimeout = null
      }
    }

    // Wait for container to be ready (clear timeouts on cleanup so "back" then reopen never fires stale joins)
    const attemptJoin = () => {
      if (cancelled) return
      if (!jitsiContainerRef.current) {
        retryTimeout = setTimeout(attemptJoin, 100)
        return
      }

      // If switching to a different stream: leave current (with correct analytics) then join new
      if (currentStreamIdRef.current && currentStreamIdRef.current !== streamId) {
        const permissionToLeave = currentPermissionRef.current ?? permission
        handleLeaveStream(permissionToLeave).then(() => {
          if (cancelled || generation !== switchGenerationRef.current) return
          currentStreamIdRef.current = streamId
          handleJoinStream()
        })
      } else if (!currentStreamIdRef.current) {
        // First time joining (or re-join after unmount)
        currentStreamIdRef.current = streamId
        handleJoinStream()
      }
    }

    attemptJoin()

    return () => {
      cancelled = true
      clearRetry()
    }
  }, [permission.streamSession?.roomId, permission.streamSession?.awaitingBroadcast, autoJoin, user, userProfile])

  // Cleanup only on unmount (not when isConnected changes) to avoid double leave when switching streams
  useEffect(() => {
    return () => {
      if (currentStreamIdRef.current) {
        stopSilentAudio()
        agoraManager.leave()
        currentStreamIdRef.current = null
        currentPermissionRef.current = null
      }
    }
  }, [])

  const isMobileInline = layout === "mobileInline"

  if (!permission.streamSession) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <div className="text-center text-muted-foreground">
            <Radio className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No active audio stream</p>
            <p className="text-sm">This publisher is not currently streaming audio</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const playerStates = (
    <>
      {isAwaitingBroadcastSession(permission.streamSession) && !isConnected && (
        <div className="text-center text-muted-foreground w-full px-2">
          <Headphones
            className={`mx-auto mb-3 opacity-60 ${isMobileInline ? "h-10 w-10" : "h-12 w-12 sm:h-16 sm:w-16"}`}
          />
          <p className={`font-medium ${isMobileInline ? "text-sm" : "text-sm"}`}>Waiting for the host</p>
          <p className="mt-2 text-xs">Connects automatically when they go live.</p>
        </div>
      )}
      {!isConnected && loading && !isAwaitingBroadcastSession(permission.streamSession) && (
        <div className="w-full text-center text-muted-foreground">
          <div
            className={`mx-auto mb-3 animate-spin rounded-full border-b-2 border-primary ${isMobileInline ? "h-9 w-9" : "h-10 w-10 sm:h-12 sm:w-12"}`}
          />
          <p className="text-xs sm:text-sm">Connecting…</p>
        </div>
      )}
      {isConnected && (
        <div className="w-full space-y-3 text-center">
          {isMobileInline ? (
            <>
              <AudioPlayingIndicator playing={audioEnabled} className="mx-auto" />
              <p className="text-sm font-semibold text-foreground">
                {audioEnabled ? "Live audio" : "Muted"}
              </p>
              <p className="text-xs text-muted-foreground break-words">{permission.publisherName}</p>
            </>
          ) : (
            <>
              <Radio
                className={`mx-auto mb-3 sm:mb-4 h-16 w-16 sm:h-20 sm:w-20 ${audioEnabled ? "animate-pulse text-primary" : "text-muted-foreground opacity-50"}`}
              />
              <p className="px-2 text-base font-semibold sm:text-lg">
                {audioEnabled ? "Listening to Audio Stream" : "Audio Muted"}
              </p>
              <p className="mt-2 break-words px-2 text-xs text-muted-foreground sm:text-sm">
                {permission.publisherName}&apos;s microphone audio
              </p>
            </>
          )}
          <Button
            variant={audioEnabled ? "default" : "outline"}
            size="sm"
            onClick={handleToggleAudio}
            className={`text-sm sm:text-base ${isMobileInline ? "mt-1 w-full" : "mt-3 w-full sm:mt-4 sm:w-auto"}`}
            disabled={!permission.allowAudio}
          >
            {audioEnabled ? (
              <>
                <Volume2 className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">Mute</span>
              </>
            ) : (
              <>
                <VolumeX className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">Unmute</span>
              </>
            )}
          </Button>
        </div>
      )}
    </>
  )

  if (isMobileInline) {
    return (
      <Card className="border-primary/35 overflow-hidden">
        <CardHeader className="gap-2 space-y-0 p-4 pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {isAwaitingBroadcastSession(permission.streamSession) ? (
                  <Badge variant="secondary">Waiting</Badge>
                ) : (
                  <Badge variant="destructive" className="animate-pulse text-xs">
                    LIVE
                  </Badge>
                )}
                <span className="break-words font-semibold leading-snug">
                  {permission.streamSession.title}
                </span>
              </CardTitle>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3 shrink-0" />
                <span className="truncate">{permission.publisherName}</span>
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0 gap-1"
              onClick={() => void handleLeaveStream()}
            >
              <Square className="h-3.5 w-3.5" />
              Stop
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {loading && (
              <Badge variant="outline" className="flex items-center gap-1 text-[10px]">
                <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Connecting
              </Badge>
            )}
            {isConnected && (
              <Badge variant="outline" className="flex items-center gap-1 text-[10px]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                Playing
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="relative space-y-3 px-4 pb-4 pt-0">
          <div ref={jitsiContainerRef} className="sr-only" aria-hidden />
          {error && (
            <Alert variant="destructive">
              <AlertDescription className="text-sm">{error}</AlertDescription>
            </Alert>
          )}
          {isAwaitingBroadcastSession(permission.streamSession) && (
            <Alert className="py-2">
              <AlertDescription className="text-xs">
                Room is open; audio starts when the host broadcasts.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex min-h-[148px] flex-col items-center justify-center rounded-xl bg-muted/60 p-4">
            {playerStates}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex flex-wrap items-center gap-2">
              {isAwaitingBroadcastSession(permission.streamSession) ? (
                <Badge variant="secondary">Waiting for host</Badge>
              ) : (
                <Badge variant="destructive" className="animate-pulse">
                  LIVE
                </Badge>
              )}
              <Badge variant="secondary" className="text-xs font-normal sm:text-sm">
                {streamSportLabel(permission.streamSession.sport)}
              </Badge>
              <span className="break-words">{permission.streamSession.title}</span>
            </CardTitle>
            <CardDescription className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <span className="flex items-center space-x-1 text-xs sm:text-sm">
                <Users className="h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
                <span className="truncate">Publisher: {permission.publisherName}</span>
              </span>
              <span className="flex items-center space-x-1 text-xs sm:text-sm">
                <Clock className="h-3 w-3 shrink-0 sm:h-4 sm:w-4" />
                <span>Started: {new Date(permission.streamSession.createdAt).toLocaleTimeString()}</span>
              </span>
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center space-x-2">
            {loading && (
              <Badge variant="outline" className="flex items-center space-x-1 text-xs">
                <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-primary" />
                <span className="hidden sm:inline">Connecting...</span>
                <span className="sm:hidden">Conn...</span>
              </Badge>
            )}
            {isConnected && (
              <Badge variant="outline" className="flex items-center space-x-1 text-xs">
                <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                <span>Connected</span>
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isAwaitingBroadcastSession(permission.streamSession) && (
          <Alert>
            <AlertDescription>
              This room is open but the publisher has not started broadcasting yet. Keep this page open; it will connect
              automatically when they go live.
            </AlertDescription>
          </Alert>
        )}

        {permission.streamSession.description && (
          <div className="rounded-lg bg-muted p-3 sm:p-4">
            <p className="break-words text-xs text-muted-foreground sm:text-sm">
              {permission.streamSession.description}
            </p>
          </div>
        )}

        <div className="relative">
          <div
            ref={jitsiContainerRef}
            className="flex h-[250px] w-full items-center justify-center rounded-lg bg-muted p-4 sm:h-[300px]"
          >
            {playerStates}
          </div>
        </div>
        {permission.streamSession?.id && user && userProfile && userProfile.allowChat === true && (
          <div className="mt-4">
            <StreamChatPanel
              streamSessionId={permission.streamSession.id}
              streamTitle={permission.streamSession.title}
              currentUserId={user.uid}
              currentUserName={userProfile.displayName || userProfile.email || ""}
              currentUserEmail={userProfile.email}
              isPublisher={false}
              canChat
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
})

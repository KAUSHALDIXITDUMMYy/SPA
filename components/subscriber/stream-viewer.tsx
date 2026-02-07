"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { agoraManager } from "@/lib/agora"
import { startSilentAudio, stopSilentAudio } from "@/lib/silent-audio"
import type { SubscriberPermission } from "@/lib/subscriber"
import { trackSubscriberActivity } from "@/lib/analytics"
import { useAuth } from "@/hooks/use-auth"
import { Play, Square, Volume2, VolumeX, Users, Clock, Radio, Headphones } from "lucide-react"

interface StreamViewerProps {
  permission: SubscriberPermission
  onJoinStream?: (permission: SubscriberPermission) => void
  onLeaveStream?: () => void
  autoJoin?: boolean
}

export function StreamViewer({ permission, onJoinStream, onLeaveStream, autoJoin = true }: StreamViewerProps) {
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

  const handleJoinStream = async () => {
    if (isJoiningRef.current) return // Prevent duplicate join calls
    if (!permission.streamSession || !user || !userProfile) return

    isJoiningRef.current = true
    setLoading(true)
    setError("")

    try {
      await agoraManager.join({
        channelName: permission.streamSession.roomId,
        role: "audience",
        container: jitsiContainerRef.current || document.body, // Container not needed for audio-only
        width: "100%",
        height: 500,
      })

      const joinTimestamp = new Date()
      setJoinTime(joinTimestamp)
      setIsConnected(true)
      currentPermissionRef.current = permission
      setLoading(false)
      onJoinStream?.(permission)

      setAudioEnabled(true) // Audio is enabled by default for audio streams
      // Start silent audio to reduce tab throttling when backgrounded (minimized)
      startSilentAudio()

      // Track analytics
      await trackSubscriberActivity({
        streamSessionId: permission.streamSession.id!,
        subscriberId: user.uid,
        subscriberName: userProfile.displayName || userProfile.email,
        publisherId: permission.publisherId,
        publisherName: permission.publisherName,
        action: 'join'
      })
    } catch (err: any) {
      setError(err.message || "Failed to join stream")
      setLoading(false)
    } finally {
      isJoiningRef.current = false
    }
  }

  /** Leave current stream. Pass explicit permission for analytics when switching (so we record leave for the stream we're leaving, not the new one). */
  const handleLeaveStream = async (permissionForAnalytics?: SubscriberPermission) => {
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
      action: 'leave',
      duration
    })

    agoraManager.leave()
    stopSilentAudio()
    setIsConnected(false)
    setLoading(false)
    setJoinTime(null)
    currentPermissionRef.current = null
    currentStreamIdRef.current = null
    onLeaveStream?.()
  }

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

    const streamId = permission.streamSession.roomId
    const generation = ++switchGenerationRef.current

    // Wait for container to be ready
    const attemptJoin = () => {
      if (!jitsiContainerRef.current) {
        setTimeout(attemptJoin, 100)
        return
      }

      // If switching to a different stream: leave current (with correct analytics) then join new
      if (currentStreamIdRef.current && currentStreamIdRef.current !== streamId) {
        const permissionToLeave = currentPermissionRef.current ?? permission
        handleLeaveStream(permissionToLeave).then(() => {
          // Only proceed if this is still the latest switch (user didn't switch again)
          if (generation !== switchGenerationRef.current) return
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
  }, [permission.streamSession?.roomId, autoJoin, user, userProfile])

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

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Badge variant="destructive" className="animate-pulse">
                LIVE
              </Badge>
              <span className="break-words">{permission.streamSession.title}</span>
            </CardTitle>
            <CardDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 mt-2">
              <span className="flex items-center space-x-1 text-xs sm:text-sm">
                <Users className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                <span className="truncate">Publisher: {permission.publisherName}</span>
              </span>
              <span className="flex items-center space-x-1 text-xs sm:text-sm">
                <Clock className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                <span>Started: {new Date(permission.streamSession.createdAt).toLocaleTimeString()}</span>
              </span>
            </CardDescription>
          </div>
          <div className="flex items-center space-x-2 flex-shrink-0">
            {loading && (
              <Badge variant="outline" className="flex items-center space-x-1 text-xs">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
                <span className="hidden sm:inline">Connecting...</span>
                <span className="sm:hidden">Conn...</span>
              </Badge>
            )}
            {isConnected && (
              <Badge variant="outline" className="flex items-center space-x-1 text-xs">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
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

        {/* Stream description */}
        {permission.streamSession.description && (
          <div className="p-3 sm:p-4 bg-muted rounded-lg">
            <p className="text-xs sm:text-sm text-muted-foreground break-words">{permission.streamSession.description}</p>
          </div>
        )}

        {/* Audio Stream Player */}
        <div className="relative">
          <div ref={jitsiContainerRef} className="w-full h-[250px] sm:h-[300px] bg-muted rounded-lg flex items-center justify-center p-4">
            {!isConnected && loading && (
              <div className="text-center text-muted-foreground w-full">
                <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-primary mx-auto mb-3 sm:mb-4"></div>
                <p className="text-xs sm:text-sm">Connecting to audio stream...</p>
              </div>
            )}
            {isConnected && (
              <div className="text-center w-full">
                <Radio className={`h-16 w-16 sm:h-20 sm:w-20 mx-auto mb-3 sm:mb-4 ${audioEnabled ? 'text-primary animate-pulse' : 'text-muted-foreground opacity-50'}`} />
                <p className="text-base sm:text-lg font-semibold px-2">
                  {audioEnabled ? "Listening to Audio Stream" : "Audio Muted"}
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-2 px-2 break-words">
                  {permission.publisherName}'s microphone audio
                </p>
                <Button
                  variant={audioEnabled ? "default" : "outline"}
                  size="sm"
                  onClick={handleToggleAudio}
                  className="mt-3 sm:mt-4 w-full sm:w-auto text-sm sm:text-base"
                  disabled={!permission.allowAudio}
                >
                  {audioEnabled ? (
                    <>
                      <Volume2 className="h-4 w-4 mr-2 flex-shrink-0" />
                      <span className="truncate">Mute Audio</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="h-4 w-4 mr-2 flex-shrink-0" />
                      <span className="truncate">Unmute Audio</span>
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

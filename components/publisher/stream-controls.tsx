"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Square, Mic, MicOff, Radio, History, ExternalLink } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { StreamChatPanel } from "@/components/ui/stream-chat-panel"
import { agoraManager } from "@/lib/agora"
import { createStreamSession, endStreamSession, generateRoomId, getPublisherStreams, type StreamSession } from "@/lib/streaming"
import { startSilentAudio, stopSilentAudio } from "@/lib/silent-audio"

interface StreamControlsProps {
  onStreamStart?: (session: StreamSession) => void
  onStreamEnd?: () => void
}

export function StreamControls({ onStreamStart, onStreamEnd }: StreamControlsProps) {
  const { user, userProfile } = useAuth()
  const [isStreaming, setIsStreaming] = useState(false)
  const [isAudioMuted, setIsAudioMuted] = useState(false)
  const [currentSession, setCurrentSession] = useState<StreamSession | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  // Stream setup form
  const [streamTitle, setStreamTitle] = useState("")
  const [streamDescription, setStreamDescription] = useState("")
  const [lastStream, setLastStream] = useState<StreamSession | null>(null)

  // Load last stream for "Use Last Details" button
  useEffect(() => {
    if (!user?.uid || isStreaming) return
    getPublisherStreams(user.uid).then((streams) => {
      // Get most recent ended stream (not active)
      const ended = streams.filter((s) => !s.isActive)
      setLastStream(ended[0] ?? null)
    })
  }, [user?.uid, isStreaming])

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      stopSilentAudio()
      agoraManager.leave()
    }
  }, [])

  const handleStartStream = async () => {
    if (!user || !userProfile) return

    setLoading(true)
    setError("")
    setSuccess("")

    try {
      const roomId = generateRoomId(user.uid)

      // Create stream session in database
      const sessionResult = await createStreamSession({
        publisherId: user.uid,
        publisherName: userProfile.displayName || userProfile.email,
        roomId,
        isActive: true,
        title: streamTitle || "Untitled Stream",
        description: streamDescription,
      })

      if (!sessionResult.success) {
        throw new Error(sessionResult.error)
      }

      // Initialize Agora as publisher and auto-start microphone audio
      await agoraManager.join({
        channelName: roomId,
        role: "publisher",
        container: document.body, // Container not needed for audio-only, but required by API
        width: "100%",
        height: 500,
      })

      setIsStreaming(true)
      setIsAudioMuted(false) // Mic is enabled by default
      setSuccess("Audio stream started successfully!")
      setCurrentSession(sessionResult.session!)
      onStreamStart?.(sessionResult.session!)
      // Start silent audio to reduce tab throttling when backgrounded (minimized)
      startSilentAudio()
    } catch (err: any) {
      setError(err.message || "Failed to start stream")
    }

    setLoading(false)
  }

  const handleEndStream = async () => {
    if (!currentSession) return

    setLoading(true)

    try {
      await endStreamSession(currentSession.id!)
      await agoraManager.leave()
      stopSilentAudio()
      setIsStreaming(false)
      setIsAudioMuted(false)
      setCurrentSession(null)
      setStreamTitle("")
      setStreamDescription("")
      setSuccess("Stream ended successfully!")
      onStreamEnd?.()
    } catch (err: any) {
      setError(err.message || "Failed to end stream")
    }

    setLoading(false)
  }

  const handleUseLastDetails = () => {
    if (!lastStream) return
    setStreamTitle(lastStream.title || "")
    setStreamDescription(lastStream.description || "")
  }

  const handleOpenInPopup = () => {
    const width = 420
    const height = 700
    const left = Math.max(0, (window.screen.width - width) / 2)
    const top = Math.max(0, (window.screen.height - height) / 2)
    const features = `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
    const popup = window.open("/publisher", "broadcast-popup", features)
    if (popup) {
      popup.focus()
    } else {
      setError("Popup blocked. Please allow popups for this site and try again.")
    }
  }

  const handleToggleAudio = async () => {
    try {
      if (isAudioMuted) {
        await agoraManager.enableMic()
        setIsAudioMuted(false)
      } else {
        await agoraManager.disableMic()
        setIsAudioMuted(true)
      }
    } catch (err: any) {
      setError("Failed to toggle microphone")
    }
  }

  return (
    <div className="space-y-6">
      {/* Stream Setup */}
      {!isStreaming && (
        <Card>
          <CardHeader>
            <CardTitle>Start New Audio Stream</CardTitle>
            <CardDescription>Configure your audio stream settings and start broadcasting your microphone</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="title" className="text-sm sm:text-base">Stream Title</Label>
              <Input
                id="title"
                value={streamTitle}
                onChange={(e) => setStreamTitle(e.target.value)}
                placeholder="Enter stream title"
                className="text-sm sm:text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm sm:text-base">Description (Optional)</Label>
              <Textarea
                id="description"
                value={streamDescription}
                onChange={(e) => setStreamDescription(e.target.value)}
                placeholder="Describe your stream"
                rows={3}
                className="text-sm sm:text-base resize-none"
              />
            </div>

            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2 min-w-0 w-full">
                {lastStream && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleUseLastDetails}
                    className="w-full sm:w-auto sm:flex-shrink-0 text-sm sm:text-base"
                  >
                    <History className="h-4 w-4 mr-2 flex-shrink-0" />
                    Use Last Details
                  </Button>
                )}
                <Button
                  onClick={handleStartStream}
                  disabled={loading}
                  className="w-full sm:flex-1 sm:min-w-0 text-sm sm:text-base py-2 sm:py-2.5"
                >
                  <Radio className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="truncate">{loading ? "Starting..." : "Start Audio Stream"}</span>
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenInPopup}
                className="w-full text-xs sm:text-sm text-muted-foreground justify-start sm:justify-center"
              >
                <ExternalLink className="h-3 w-3 sm:h-4 sm:w-4 mr-2 flex-shrink-0" />
                <span className="hidden sm:inline">Open in popup — keep broadcast active when minimized</span>
                <span className="sm:hidden">Open in new tab (use split screen on mobile)</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Stream Controls */}
      {isStreaming && currentSession && (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <Badge variant="destructive" className="animate-pulse">
                    LIVE
                  </Badge>
                  <span className="break-words">{currentSession.title}</span>
                </CardTitle>
                {currentSession.description && (
                  <CardDescription className="mt-2">
                    {currentSession.description}
                  </CardDescription>
                )}
              </div>
              <Button variant="destructive" onClick={handleEndStream} disabled={loading} className="w-full sm:w-auto text-sm sm:text-base">
                <Square className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="truncate">{loading ? "Ending..." : "End Stream"}</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs sm:text-sm text-amber-800 dark:text-amber-200 mb-3 break-words overflow-hidden">
              <span className="hidden sm:inline">If audio stops when you minimize, return to this tab to auto-reconnect. Next time: use &quot;Open in popup&quot; before starting.</span>
              <span className="sm:hidden">If audio stops, return to this tab to auto-reconnect. On mobile: use split screen.</span>
            </div>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3">
              <Button 
                variant={isAudioMuted ? "destructive" : "default"} 
                onClick={handleToggleAudio} 
                size="sm"
                className="w-full sm:w-auto text-sm sm:text-base"
              >
                {isAudioMuted ? (
                  <>
                    <MicOff className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="truncate">Unmute Microphone</span>
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="truncate">Mute Microphone</span>
                  </>
                )}
              </Button>
            </div>
            {currentSession?.id && user && userProfile && (
              <div className="mt-4">
                <StreamChatPanel
                  streamSessionId={currentSession.id}
                  streamTitle={currentSession.title}
                  currentUserId={user.uid}
                  currentUserName={userProfile.displayName || userProfile.email || ""}
                  isPublisher={true}
                  canChat={true}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Audio Stream Status */}
      <Card>
        <CardHeader>
          <CardTitle>Audio Stream Status</CardTitle>
          <CardDescription>
            {isStreaming
              ? "Your live audio stream is active. Your microphone audio is being broadcast to subscribers."
              : "Start an audio stream to begin broadcasting your microphone."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="w-full h-[180px] sm:h-[200px] bg-muted rounded-lg flex items-center justify-center p-4"
          >
            {isStreaming ? (
              <div className="text-center w-full">
                <Radio className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-3 sm:mb-4 text-primary animate-pulse" />
                <p className="text-base sm:text-lg font-semibold">Audio Stream Active</p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-2 px-2">
                  {isAudioMuted ? "Microphone is muted" : "Microphone is broadcasting"}
                </p>
              </div>
            ) : (
              <div className="text-center text-muted-foreground w-full px-2">
                <Radio className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50" />
                <p className="text-xs sm:text-sm">Audio stream will start when you begin broadcasting</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

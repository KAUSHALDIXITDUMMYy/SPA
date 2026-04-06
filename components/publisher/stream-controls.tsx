"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Square, Mic, MicOff, Radio, History, RefreshCw, Speaker, CalendarClock } from "lucide-react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useAuth } from "@/hooks/use-auth"
import { StreamChatPanel } from "@/components/ui/stream-chat-panel"
import { agoraManager } from "@/lib/agora"
import {
  activateScheduledBroadcastSession,
  createStreamSession,
  endStreamSession,
  generateRoomId,
  getPublisherStreams,
  resetScheduledSessionAfterBroadcast,
  subscribeToPublisherActiveStream,
  type StreamSession,
} from "@/lib/streaming"
import { DEFAULT_STREAM_SPORT, US_STREAM_SPORTS, streamSportLabel } from "@/lib/sports"
import { startSilentAudio, stopSilentAudio } from "@/lib/silent-audio"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ScheduledCall } from "@/lib/scheduled-calls"

interface StreamControlsProps {
  onStreamStart?: (session: StreamSession) => void
  onStreamEnd?: () => void
  /** Selected from &quot;Today&apos;s scheduled rooms&quot; — uses fixed roomId from admin */
  broadcastScheduledCall?: ScheduledCall | null
  onClearBroadcastScheduledCall?: () => void
}

function PublisherAudioSourcePicker(props: {
  value: "microphone" | "system"
  onValueChange: (v: "microphone" | "system") => void
  disabled?: boolean
}) {
  const { value, onValueChange, disabled } = props
  return (
    <div className="space-y-2">
      <Label className="text-sm sm:text-base">Audio source</Label>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(v) => {
          if (v === "microphone" || v === "system") onValueChange(v)
        }}
        disabled={disabled}
        variant="outline"
        className="w-full justify-stretch sm:w-auto sm:justify-start"
      >
        <ToggleGroupItem value="microphone" aria-label="Microphone" className="flex-1 sm:flex-initial gap-2 text-xs sm:text-sm">
          <Mic className="h-4 w-4 shrink-0" />
          Microphone
        </ToggleGroupItem>
        <ToggleGroupItem value="system" aria-label="System audio" className="flex-1 sm:flex-initial gap-2 text-xs sm:text-sm">
          <Speaker className="h-4 w-4 shrink-0" />
          System audio
        </ToggleGroupItem>
      </ToggleGroup>
      <p className="text-xs text-muted-foreground">
        {value === "system"
          ? "After you start, you’ll pick a tab, window, or screen and can enable tab audio. Only audio is sent to listeners—not your screen video."
          : "Use your microphone when you go live."}{" "}
        For a browser tab, use &quot;Share tab audio&quot; in the picker (Chrome). System-wide capture depends on your OS and browser.
      </p>
    </div>
  )
}

export function StreamControls({
  onStreamStart,
  onStreamEnd,
  broadcastScheduledCall = null,
  onClearBroadcastScheduledCall,
}: StreamControlsProps) {
  const { user, userProfile } = useAuth()
  const [isStreaming, setIsStreaming] = useState(false)
  const [isAudioMuted, setIsAudioMuted] = useState(false)
  const [publisherAudioSource, setPublisherAudioSource] = useState<"microphone" | "system">("microphone")
  const [sourceSwitchLoading, setSourceSwitchLoading] = useState(false)
  const [currentSession, setCurrentSession] = useState<StreamSession | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  // Stream setup form
  const [streamTitle, setStreamTitle] = useState("")
  const [streamDescription, setStreamDescription] = useState("")
  const [streamSport, setStreamSport] = useState<string>(DEFAULT_STREAM_SPORT)
  const [lastStream, setLastStream] = useState<StreamSession | null>(null)
  /** Active stream in DB that we can rejoin (e.g. after page refresh) */
  const [activeStreamToRejoin, setActiveStreamToRejoin] = useState<StreamSession | null>(null)

  // Subscribe to publisher's active stream for rejoin-after-refresh
  useEffect(() => {
    if (!user?.uid) return
    const unsub = subscribeToPublisherActiveStream(user.uid, (session) => {
      setActiveStreamToRejoin(session)
    })
    return unsub
  }, [user?.uid])

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
        sport: streamSport,
      })

      if (!sessionResult.success) {
        throw new Error(sessionResult.error)
      }

      // Join as publisher (mic first), then switch to system capture if chosen below
      await agoraManager.join({
        channelName: roomId,
        role: "publisher",
        container: document.body, // Container not needed for audio-only, but required by API
        width: "100%",
        height: 500,
      })

      let systemAudioWarning: string | null = null
      if (publisherAudioSource === "system") {
        try {
          await agoraManager.switchPublisherAudioSource("system")
        } catch (switchErr: unknown) {
          const msg = switchErr instanceof Error ? switchErr.message : "Could not start system audio"
          systemAudioWarning = `${msg} You are live on the microphone instead.`
          setPublisherAudioSource(agoraManager.getPublisherAudioSource())
        }
      }

      setIsStreaming(true)
      setIsAudioMuted(false)
      setCurrentSession(sessionResult.session!)
      onStreamStart?.(sessionResult.session!)
      // Start silent audio to reduce tab throttling when backgrounded (minimized)
      startSilentAudio()
      if (systemAudioWarning) {
        setError(systemAudioWarning)
        setSuccess("Stream started—you're broadcasting from the microphone.")
      } else {
        setSuccess("Audio stream started successfully!")
      }
    } catch (err: any) {
      setError(err.message || "Failed to start stream")
    }

    setLoading(false)
  }

  const handleStartScheduledStream = async () => {
    if (!user || !userProfile || !broadcastScheduledCall?.id) return

    setLoading(true)
    setError("")
    setSuccess("")

    try {
      const roomId = broadcastScheduledCall.roomId
      const sessionResult = await activateScheduledBroadcastSession({
        publisherId: user.uid,
        publisherName: userProfile.displayName || userProfile.email,
        roomId,
        isActive: true,
        title: broadcastScheduledCall.title,
        description: broadcastScheduledCall.description || "",
        sport: broadcastScheduledCall.sport?.trim() || DEFAULT_STREAM_SPORT,
        scheduledCallId: broadcastScheduledCall.id,
      })

      if (!sessionResult.success) {
        throw new Error(sessionResult.error)
      }

      await agoraManager.join({
        channelName: roomId,
        role: "publisher",
        container: document.body,
        width: "100%",
        height: 500,
      })

      let systemAudioWarning: string | null = null
      if (publisherAudioSource === "system") {
        try {
          await agoraManager.switchPublisherAudioSource("system")
        } catch (switchErr: unknown) {
          const msg = switchErr instanceof Error ? switchErr.message : "Could not start system audio"
          systemAudioWarning = `${msg} You are live on the microphone instead.`
          setPublisherAudioSource(agoraManager.getPublisherAudioSource())
        }
      }

      setIsStreaming(true)
      setIsAudioMuted(false)
      setCurrentSession(sessionResult.session!)
      onStreamStart?.(sessionResult.session!)
      startSilentAudio()
      if (systemAudioWarning) {
        setError(systemAudioWarning)
        setSuccess("Scheduled room is live—you're on the microphone.")
      } else {
        setSuccess("Scheduled room is live!")
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start scheduled broadcast")
    }

    setLoading(false)
  }

  const handleRejoinStream = async () => {
    if (!activeStreamToRejoin || !user || !userProfile) return

    setLoading(true)
    setError("")
    setSuccess("")

    try {
      // Rejoin Agora with existing roomId (session already exists in DB)
      await agoraManager.join({
        channelName: activeStreamToRejoin.roomId,
        role: "publisher",
        container: document.body,
        width: "100%",
        height: 500,
      })

      let rejoinSystemWarning: string | null = null
      if (publisherAudioSource === "system") {
        try {
          await agoraManager.switchPublisherAudioSource("system")
        } catch (switchErr: unknown) {
          const msg = switchErr instanceof Error ? switchErr.message : "Could not start system audio"
          rejoinSystemWarning = `${msg} You are live on the microphone instead.`
          setPublisherAudioSource(agoraManager.getPublisherAudioSource())
        }
      }

      setIsStreaming(true)
      setIsAudioMuted(false)
      setPublisherAudioSource(agoraManager.getPublisherAudioSource())
      setCurrentSession(activeStreamToRejoin)
      setStreamTitle(activeStreamToRejoin.title || "")
      setStreamDescription(activeStreamToRejoin.description || "")
      setStreamSport(activeStreamToRejoin.sport || DEFAULT_STREAM_SPORT)
      onStreamStart?.(activeStreamToRejoin)
      startSilentAudio()
      if (rejoinSystemWarning) {
        setError(rejoinSystemWarning)
        setSuccess("Rejoined—you're on the microphone.")
      } else {
        setSuccess("Rejoined stream successfully!")
      }
    } catch (err: any) {
      setError(err.message || "Failed to rejoin stream")
    }

    setLoading(false)
  }

  const handleEndStream = async () => {
    if (!currentSession) return

    setLoading(true)

    try {
      if (currentSession.scheduledCallId) {
        const reset = await resetScheduledSessionAfterBroadcast(currentSession.id!)
        if (!reset.success) {
          throw new Error(reset.error || "Failed to reset scheduled room")
        }
      } else {
        await endStreamSession(currentSession.id!)
      }
      await agoraManager.leave()
      stopSilentAudio()
      setIsStreaming(false)
      setIsAudioMuted(false)
      setPublisherAudioSource("microphone")
      setCurrentSession(null)
      setStreamTitle("")
      setStreamDescription("")
      setStreamSport(DEFAULT_STREAM_SPORT)
      setSuccess("Stream ended successfully!")
      onClearBroadcastScheduledCall?.()
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
    setStreamSport(lastStream.sport || DEFAULT_STREAM_SPORT)
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
      setError("Failed to toggle audio output")
    }
  }

  const handlePublisherAudioSourceChange = async (value: string) => {
    if (!value || (value !== "microphone" && value !== "system")) return
    if (!isStreaming) return
    setSourceSwitchLoading(true)
    setError("")
    try {
      await agoraManager.switchPublisherAudioSource(value)
      setPublisherAudioSource(value)
      setIsAudioMuted(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to switch audio source"
      setError(msg)
    } finally {
      setSourceSwitchLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Rejoin active stream (after refresh) */}
      {!isStreaming && activeStreamToRejoin && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-amber-600" />
              Rejoin Your Active Stream
            </CardTitle>
            <CardDescription>
              Your stream &quot;{activeStreamToRejoin.title}&quot; is still active. Rejoin to continue broadcasting.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert className="mb-4">
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}
            <PublisherAudioSourcePicker
              value={publisherAudioSource}
              onValueChange={setPublisherAudioSource}
              disabled={loading}
            />
            <Button
              onClick={handleRejoinStream}
              disabled={loading}
              className="w-full sm:w-auto mt-4"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {loading ? "Rejoining..." : "Rejoin Stream"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stream Setup: scheduled room OR ad-hoc */}
      {!isStreaming && (
        <>
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

          {broadcastScheduledCall && (
            <Card className="border-teal-300 dark:border-teal-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <CalendarClock className="h-5 w-5 text-teal-600" />
                  Scheduled room broadcast
                </CardTitle>
                <CardDescription>
                  You&apos;re using the admin-assigned room for{" "}
                  <span className="font-medium text-foreground">{broadcastScheduledCall.title}</span>. Audio source
                  applies here the same as an ad-hoc stream.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs font-mono break-all">
                  Room: {broadcastScheduledCall.roomId}
                </div>
                <PublisherAudioSourcePicker
                  value={publisherAudioSource}
                  onValueChange={setPublisherAudioSource}
                  disabled={loading}
                />
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    onClick={handleStartScheduledStream}
                    disabled={loading}
                    className="flex-1 text-sm sm:text-base"
                  >
                    <Radio className="h-4 w-4 mr-2 shrink-0" />
                    {loading ? "Starting…" : "Go live in scheduled room"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={loading}
                    onClick={() => onClearBroadcastScheduledCall?.()}
                    className="text-sm sm:text-base"
                  >
                    Use ad-hoc stream instead
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {!broadcastScheduledCall && (
        <Card>
          <CardHeader>
            <CardTitle>Ad-hoc audio stream</CardTitle>
            <CardDescription>
              Your own title, category, and room— not tied to today&apos;s scheduled calls. Use the scheduled section
              above when you were assigned a room.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">

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

            <div className="space-y-2">
              <Label htmlFor="sport" className="text-sm sm:text-base">
                Sport / category
              </Label>
              <Select value={streamSport} onValueChange={setStreamSport}>
                <SelectTrigger id="sport" className="w-full text-sm sm:text-base">
                  <SelectValue placeholder="Select a sport" />
                </SelectTrigger>
                <SelectContent>
                  {US_STREAM_SPORTS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Subscribers can filter live streams by this category.
              </p>
            </div>

            <PublisherAudioSourcePicker
              value={publisherAudioSource}
              onValueChange={setPublisherAudioSource}
              disabled={loading}
            />

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
            </div>
          </CardContent>
        </Card>
          )}
        </>
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
                  {currentSession.scheduledCallId && (
                    <Badge variant="outline" className="text-xs border-teal-600 text-teal-700 dark:text-teal-300">
                      Scheduled room
                    </Badge>
                  )}
                  {currentSession.sport && currentSession.sport !== DEFAULT_STREAM_SPORT && (
                    <Badge variant="secondary" className="text-xs sm:text-sm font-medium">
                      {streamSportLabel(currentSession.sport)}
                    </Badge>
                  )}
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

            <div className="mb-3">
              <PublisherAudioSourcePicker
                value={publisherAudioSource}
                onValueChange={(v) => void handlePublisherAudioSourceChange(v)}
                disabled={sourceSwitchLoading || loading}
              />
              {publisherAudioSource === "system" && isStreaming && (
                <p className="text-xs text-muted-foreground mt-2">
                  Video from the share is not broadcast—only audio goes to listeners.
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3">
              <Button 
                variant={isAudioMuted ? "destructive" : "default"} 
                onClick={handleToggleAudio} 
                size="sm"
                disabled={sourceSwitchLoading}
                className="w-full sm:w-auto text-sm sm:text-base"
              >
                {isAudioMuted ? (
                  <>
                    <MicOff className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="truncate">Unmute broadcast</span>
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="truncate">Mute broadcast</span>
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
                  currentUserEmail={userProfile.email}
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
              ? publisherAudioSource === "system"
                ? "Live: system or tab audio is being broadcast to subscribers."
                : "Live: your microphone is being broadcast to subscribers."
              : "Start a stream, then choose microphone or system audio for what subscribers hear."}
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
                  {isAudioMuted
                    ? "Broadcast is muted"
                    : publisherAudioSource === "system"
                      ? "System / tab audio is live"
                      : "Microphone is live"}
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

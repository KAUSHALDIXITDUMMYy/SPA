"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Play, Square, Mic, MicOff, Users, Clock, Radio } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { agoraManager } from "@/lib/agora"
import { createStreamSession, endStreamSession, generateRoomId, type StreamSession } from "@/lib/streaming"

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
  const [gameName, setGameName] = useState("")
  const [league, setLeague] = useState("")
  const [match, setMatch] = useState("")

  useEffect(() => {
    return () => {
      // Cleanup on unmount
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
        gameName: gameName || undefined,
        league: league || undefined,
        match: match || undefined,
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
      setIsStreaming(false)
      setIsAudioMuted(false)
      setCurrentSession(null)
      setStreamTitle("")
      setStreamDescription("")
      setGameName("")
      setLeague("")
      setMatch("")
      setSuccess("Stream ended successfully!")
      onStreamEnd?.()
    } catch (err: any) {
      setError(err.message || "Failed to end stream")
    }

    setLoading(false)
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label htmlFor="gameName" className="text-sm">Game Name</Label>
                <Input
                  id="gameName"
                  value={gameName}
                  onChange={(e) => setGameName(e.target.value)}
                  placeholder="e.g., League of Legends"
                  className="text-sm sm:text-base"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="league" className="text-sm">League</Label>
                <Input
                  id="league"
                  value={league}
                  onChange={(e) => setLeague(e.target.value)}
                  placeholder="e.g., LCS, LEC, Worlds"
                  className="text-sm sm:text-base"
                />
              </div>

              <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                <Label htmlFor="match" className="text-sm">Match</Label>
                <Input
                  id="match"
                  value={match}
                  onChange={(e) => setMatch(e.target.value)}
                  placeholder="e.g., Team A vs Team B"
                  className="text-sm sm:text-base"
                />
              </div>
            </div>

            <Button onClick={handleStartStream} disabled={loading} className="w-full text-sm sm:text-base py-2 sm:py-2.5">
              <Radio className="h-4 w-4 mr-2 flex-shrink-0" />
              <span className="truncate">{loading ? "Starting..." : "Start Audio Stream"}</span>
            </Button>
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
                <CardDescription className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-2">
                  <span className="flex items-center space-x-1">
                    <Clock className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                    <span className="text-xs sm:text-sm">Started: {new Date(currentSession.createdAt).toLocaleTimeString()}</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <Users className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                    <span className="text-xs sm:text-sm truncate">Room: {currentSession.roomId}</span>
                  </span>
                </CardDescription>
                {(currentSession.gameName || currentSession.league || currentSession.match) && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {currentSession.gameName && <Badge variant="outline" className="text-xs">Game: {currentSession.gameName}</Badge>}
                    {currentSession.league && <Badge variant="outline" className="text-xs">League: {currentSession.league}</Badge>}
                    {currentSession.match && <Badge variant="outline" className="text-xs">Match: {currentSession.match}</Badge>}
                  </div>
                )}
              </div>
              <Button variant="destructive" onClick={handleEndStream} disabled={loading} className="w-full sm:w-auto text-sm sm:text-base">
                <Square className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="truncate">{loading ? "Ending..." : "End Stream"}</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
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

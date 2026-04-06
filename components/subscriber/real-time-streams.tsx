"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/hooks/use-auth"
import { getAvailableStreamsSplit } from "@/lib/subscriber"
import { isAwaitingBroadcastSession } from "@/lib/streaming"
import type { SubscriberPermission } from "@/lib/subscriber"
import { US_STREAM_SPORTS, SPORT_FILTER_ALL, SPORT_FILTER_UNSPECIFIED, streamSportLabel } from "@/lib/sports"
import { StreamViewer } from "./stream-viewer"
import { Radio, Activity, Filter as FilterIcon } from "lucide-react"

export function RealTimeStreams() {
  const { user } = useAuth()
  const [availableStreams, setAvailableStreams] = useState<SubscriberPermission[]>([])
  const [selectedStream, setSelectedStream] = useState<SubscriberPermission | null>(null)
  const [sportFilter, setSportFilter] = useState<string>(SPORT_FILTER_ALL)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const filteredStreams = availableStreams.filter((perm) => {
    const sport = perm.streamSession?.sport
    if (sportFilter === SPORT_FILTER_ALL) return true
    const s = sport?.trim() ?? ""
    if (sportFilter === SPORT_FILTER_UNSPECIFIED) return s === ""
    return s === sportFilter
  })

  useEffect(() => {
    if (!user) return

    const loadStreams = async () => {
      try {
        console.log("[v0] Loading streams for user:", user.uid)
        const { adHoc: streams } = await getAvailableStreamsSplit(user.uid)
        console.log("[v0] Ad-hoc streams for subscriber:", streams.length)
        
        // Sort streams alphabetically by publisher name
        const sortedStreams = [...streams].sort((a, b) => {
          const nameA = (a.publisherName || "").toLowerCase()
          const nameB = (b.publisherName || "").toLowerCase()
          return nameA.localeCompare(nameB)
        })
        
        setAvailableStreams(sortedStreams)
        // Keep selected stream in sync with latest data or clear if gone
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
      }
    }

    loadStreams()

    // Set up polling for real-time updates
    const interval = setInterval(loadStreams, 5000) // Poll every 5 seconds

    return () => clearInterval(interval)
  }, [user])

  const handleSelectStream = (stream: SubscriberPermission) => {
    console.log("[v0] Selecting stream:", stream.id)
    // Always switch to the selected stream (no toggle behavior)
    setSelectedStream(stream)
  }

  const handleBackToList = () => {
    setSelectedStream(null)
  }

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

  // Split view: left list, right viewer
  const rightPane = (
    <div className="p-0">
      {selectedStream ? (
        <StreamViewer
          key={selectedStream.streamSession?.id || selectedStream.id}
          permission={selectedStream}
          onLeaveStream={() => setSelectedStream(null)}
          autoJoin={true}
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
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="h-5 w-5 text-green-500" />
              <CardTitle>Live Audio Streams</CardTitle>
              <Badge variant="outline" className="animate-pulse">
                Auto-updating
              </Badge>
            </div>
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
              </div>
            </CardContent>
          </Card>
        ) : selectedStream ? (
          // Mobile: Show only viewer when stream is selected
          <div className="lg:col-span-3">
            <div className="mb-4">
              <Button variant="outline" onClick={handleBackToList} className="w-full sm:w-auto text-sm sm:text-base">
                ← Back to Streams
              </Button>
            </div>
            {rightPane}
          </div>
        ) : (
          // Mobile: Show only list when no stream selected
          <>
            <div className="lg:col-span-1 space-y-3 sm:space-y-4">
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

              {filteredStreams.map((perm) => (
                <Card
                  key={perm.id}
                  className="transition-shadow cursor-pointer hover:shadow-lg"
                  onClick={() => handleSelectStream(perm)}
                >
                  <CardHeader className="p-3 sm:p-4 lg:p-6">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2 min-w-0 flex-1">
                        <CardTitle className="flex flex-wrap items-center gap-2">
                          {perm.streamSession && isAwaitingBroadcastSession(perm.streamSession) ? (
                            <Badge variant="secondary" className="text-xs flex-shrink-0">
                              Waiting for host
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="animate-pulse text-xs flex-shrink-0">
                              LIVE
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-xs font-normal">
                            {streamSportLabel(perm.streamSession?.sport)}
                          </Badge>
                          <span className="break-words text-sm sm:text-base">{perm.streamSession?.title || "Untitled Stream"}</span>
                        </CardTitle>
                        <CardDescription className="text-xs sm:text-sm truncate">Publisher: {perm.publisherName}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>

            <div className="hidden lg:block lg:col-span-2">{rightPane}</div>
          </>
        )}
      </div>
    </div>
  )
}

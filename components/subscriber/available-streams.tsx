"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"
import { getAvailableStreams, type SubscriberPermission } from "@/lib/subscriber"
import { StreamViewer } from "./stream-viewer"
import { Radio, Users, Volume2, Clock, RefreshCw } from "lucide-react"

export function AvailableStreams() {
  const { user } = useAuth()
  const [permissions, setPermissions] = useState<SubscriberPermission[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStream, setSelectedStream] = useState<SubscriberPermission | null>(null)
  const [refreshing, setRefreshing] = useState(false)

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
      const availableStreams = await getAvailableStreams(user.uid)
      
      // Sort streams alphabetically by publisher name
      const sortedStreams = availableStreams.sort((a, b) => {
        const nameA = (a.publisher?.displayName || a.publisher?.email || '').toLowerCase()
        const nameB = (b.publisher?.displayName || b.publisher?.email || '').toLowerCase()
        return nameA.localeCompare(nameB)
      })
      
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
    setSelectedStream(null)
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
          <Button variant="outline" onClick={handleBackToList} className="w-full sm:w-auto text-sm sm:text-base">
            ← Back to Streams
          </Button>
          <Button variant="outline" onClick={loadStreams} disabled={refreshing} className="w-full sm:w-auto text-sm sm:text-base">
            <RefreshCw className={`h-4 w-4 mr-2 flex-shrink-0 ${refreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
        </div>
        <StreamViewer 
          permission={selectedStream} 
          onLeaveStream={handleBackToList}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {permissions.map((permission) => (
            <Card key={permission.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="p-4 sm:p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 min-w-0 flex-1">
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      <Badge variant="destructive" className="animate-pulse text-xs flex-shrink-0">
                        LIVE
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
      )}
    </div>
  )
}

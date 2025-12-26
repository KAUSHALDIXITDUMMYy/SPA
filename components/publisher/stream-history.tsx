"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/hooks/use-auth"
import { getPublisherStreams, type StreamSession } from "@/lib/streaming"
import { Clock, Users, Video } from "lucide-react"

export function StreamHistory() {
  const { user } = useAuth()
  const [streams, setStreams] = useState<StreamSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      loadStreams()
    }
  }, [user])

  const loadStreams = async () => {
    if (!user) return

    setLoading(true)
    const streamsData = await getPublisherStreams(user.uid)
    setStreams(streamsData)
    setLoading(false)
  }

  const formatDuration = (start: Date, end?: Date) => {
    const startTime = new Date(start).getTime()
    const endTime = end ? new Date(end).getTime() : Date.now()
    const duration = Math.floor((endTime - startTime) / 1000 / 60) // minutes

    if (duration < 60) {
      return `${duration}m`
    }

    const hours = Math.floor(duration / 60)
    const minutes = duration % 60
    return `${hours}h ${minutes}m`
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Video className="h-5 w-5" />
          <span>Stream History</span>
        </CardTitle>
        <CardDescription>View your past and current streaming sessions</CardDescription>
      </CardHeader>
      <CardContent>
        {streams.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Video className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No streams yet</p>
            <p className="text-sm">Start your first stream to see it here</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Room ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {streams.map((stream) => (
                <TableRow key={stream.id}>
                  <TableCell className="font-medium">
                    <div>
                      <p>{stream.title}</p>
                      {stream.description && <p className="text-sm text-muted-foreground">{stream.description}</p>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={stream.isActive ? "destructive" : "secondary"}>
                      {stream.isActive ? "LIVE" : "Ended"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{new Date(stream.createdAt).toLocaleString()}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{formatDuration(stream.createdAt, stream.endedAt)}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-1">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">{stream.roomId}</code>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useAuth } from "@/hooks/use-auth"
import { subscribeSubscriberAllowedZoomCalls, type ZoomCall } from "@/lib/zoom"
import { Headphones, ExternalLink } from "lucide-react"

export function SubscriberZoomCalls() {
  const { user } = useAuth()
  const [calls, setCalls] = useState<(ZoomCall & { assignmentId: string })[]>([])
  const [selectedId, setSelectedId] = useState<string>("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!user) return
    const unsub = subscribeSubscriberAllowedZoomCalls(user.uid, (rows) => setCalls(rows))
    return () => unsub()
  }, [user])

  const handleJoin = (callId: string) => {
    setSelectedId(callId)
    window.location.href = `/zoom/${callId}`
  }

  const active = useMemo(() => calls.find((c) => c.id === selectedId), [calls, selectedId])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Headphones className="h-5 w-5" />
            Zoom Calls
          </CardTitle>
          <CardDescription>Calls assigned to you. Click to join; switch by joining another.</CardDescription>
        </CardHeader>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {calls.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">No calls assigned to you yet.</CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {calls.map((c) => (
            <Card key={c.id} className={`cursor-pointer ${selectedId === c.id ? "ring-2 ring-primary" : ""}`} onClick={() => handleJoin(c.id!)}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c.title}</div>
                    {c.description && <div className="text-xs text-muted-foreground truncate">{c.description}</div>}
                  </div>
                  <Badge variant="outline">Active</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full" onClick={(e) => { e.stopPropagation(); handleJoin(c.id!) }}>
                  <ExternalLink className="h-4 w-4 mr-2" /> Join
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}


"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { db } from "@/lib/firebase"
import { collection, onSnapshot, query, where } from "firebase/firestore"
import {
  getLocalDateKey,
  subscribeScheduledCallsForDate,
  isCallInTimeWindow,
  isScheduledCallTransmitting,
  type ScheduledCall,
} from "@/lib/scheduled-calls"
import { Radio } from "lucide-react"

export function SubscriberScheduledCalls() {
  const [calls, setCalls] = useState<ScheduledCall[]>([])
  const [activeSessions, setActiveSessions] = useState<
    { roomId: string; publisherId: string; isActive: boolean }[]
  >([])
  const dateKey = getLocalDateKey()

  useEffect(() => {
    const unsub = subscribeScheduledCallsForDate(dateKey, setCalls)
    return unsub
  }, [dateKey])

  useEffect(() => {
    const q = query(collection(db, "streamSessions"), where("isActive", "==", true))
    return onSnapshot(q, (snap) => {
      setActiveSessions(
        snap.docs.map((d) => {
          const x = d.data()
          return {
            roomId: String(x.roomId ?? ""),
            publisherId: String(x.publisherId ?? ""),
            isActive: !!x.isActive,
          }
        }),
      )
    })
  }, [])

  const liveCount = useMemo(
    () => calls.filter((c) => isScheduledCallTransmitting(c, activeSessions)).length,
    [calls, activeSessions],
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Today&apos;s scheduled calls</CardTitle>
            </div>
            <Badge variant={liveCount > 0 ? "default" : "secondary"} className="w-fit">
              {liveCount} live now
            </Badge>
          </div>
          <CardDescription>
            Calls your admin set for {dateKey}. &quot;Live&quot; means the assigned publisher is transmitting in that
            room. Listen from the <strong>Audio Streams</strong> tab if you have access to that publisher.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {calls.length === 0 ? (
            <p className="text-sm text-muted-foreground">No scheduled calls for today.</p>
          ) : (
            <ul className="space-y-2">
              {calls.map((c) => {
                const live = isScheduledCallTransmitting(c, activeSessions)
                const inWindow = isCallInTimeWindow(c)
                return (
                  <li
                    key={c.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{c.title}</span>
                        {live ? (
                          <Badge variant="destructive" className="animate-pulse text-xs">
                            LIVE
                          </Badge>
                        ) : inWindow ? (
                          <Badge variant="outline" className="text-xs">
                            Waiting
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Upcoming / ended
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {c.startsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} –{" "}
                        {c.endsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {c.publisherName}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <Alert>
            <AlertDescription className="text-xs sm:text-sm">
              Open <strong>Audio Streams</strong> to hear any live feed you&apos;re assigned to—scheduled or ad-hoc.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}

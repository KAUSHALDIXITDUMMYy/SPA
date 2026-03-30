"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/hooks/use-auth"
import {
  getLocalDateKey,
  subscribeScheduledCallsForDate,
  isCallInTimeWindow,
  type ScheduledCall,
} from "@/lib/scheduled-calls"
import { CalendarClock, Radio } from "lucide-react"

interface ScheduledCallsPublisherSectionProps {
  onChooseCall: (call: ScheduledCall | null) => void
  chosenCallId: string | null
  disabled?: boolean
}

export function ScheduledCallsPublisherSection({
  onChooseCall,
  chosenCallId,
  disabled,
}: ScheduledCallsPublisherSectionProps) {
  const { user } = useAuth()
  const [calls, setCalls] = useState<ScheduledCall[]>([])
  const dateKey = getLocalDateKey()

  useEffect(() => {
    const unsub = subscribeScheduledCallsForDate(dateKey, setCalls)
    return unsub
  }, [dateKey])

  const mine = calls.filter((c) => c.publisherId === user?.uid)

  if (!user?.uid) return null

  return (
    <Card className="border-teal-200 dark:border-teal-900 bg-teal-50/30 dark:bg-teal-950/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-teal-600" />
          <CardTitle className="text-lg">Today&apos;s scheduled rooms</CardTitle>
        </div>
        <CardDescription>
          Calls assigned to you for today ({dateKey}). Choose one, then use <strong>Go live in scheduled room</strong> in
          the publisher controls below. Mic or system audio works the same as an ad-hoc stream. You can still start an
          ad-hoc stream anytime if nothing is selected here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scheduled calls assigned to you for today.</p>
        ) : (
          <ul className="space-y-2">
            {mine.map((c) => {
              const inWindow = isCallInTimeWindow(c)
              const selected = chosenCallId === c.id
              return (
                <li
                  key={c.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border bg-card p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm sm:text-base">{c.title}</span>
                      {inWindow ? (
                        <Badge variant="secondary" className="text-xs">
                          In time window
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Outside window
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {c.startsAt.toLocaleString()} → {c.endsAt.toLocaleString()}
                    </p>
                    <p className="text-[11px] font-mono text-muted-foreground truncate">Room: {c.roomId}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {selected ? (
                      <Button type="button" variant="secondary" size="sm" onClick={() => onChooseCall(null)} disabled={disabled}>
                        Clear selection
                      </Button>
                    ) : (
                      <Button type="button" size="sm" onClick={() => onChooseCall(c)} disabled={disabled}>
                        <Radio className="h-3.5 w-3.5 mr-1.5" />
                        Broadcast here
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

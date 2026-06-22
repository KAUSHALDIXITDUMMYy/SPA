"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/hooks/use-auth"
import { db } from "@/lib/firebase"
import { collection, onSnapshot, query, where } from "firebase/firestore"
import {
  getLocalDateKey,
  subscribeScheduledCallsForDate,
  isCallInTimeWindow,
  getScheduledCallById,
  type ScheduledCall,
} from "@/lib/scheduled-calls"
import { CalendarClock, Radio } from "lucide-react"

interface ScheduledCallsPublisherSectionProps {
  onChooseCall: (call: ScheduledCall | null) => void
  chosenCallId: string | null
  disabled?: boolean
}

function samePublisherId(stored: string | undefined, authUid: string | undefined): boolean {
  if (!stored || !authUid) return false
  return String(stored).trim() === String(authUid).trim()
}

export function ScheduledCallsPublisherSection({
  onChooseCall,
  chosenCallId,
  disabled,
}: ScheduledCallsPublisherSectionProps) {
  const { user, userProfile } = useAuth()
  const [callsForToday, setCallsForToday] = useState<ScheduledCall[]>([])
  /** Rooms you host in Firestore (covers reassigned sessions + calendar out of sync). */
  const [callsFromSessions, setCallsFromSessions] = useState<ScheduledCall[]>([])
  const dateKey = getLocalDateKey()
  const uid = user?.uid

  useEffect(() => {
    const unsub = subscribeScheduledCallsForDate(dateKey, setCallsForToday)
    return unsub
  }, [dateKey])

  useEffect(() => {
    if (!uid) return
    let fetchGen = 0
    const q = query(collection(db, "streamSessions"), where("publisherId", "==", uid))
    return onSnapshot(q, (snap) => {
      const gen = ++fetchGen
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown> & { id: string }))
        .filter((x) => x.isActive === true && x.scheduledCallId)

      ;(async () => {
        const byId = new Map<string, ScheduledCall>()
        for (const row of rows) {
          const cid = String(row.scheduledCallId ?? "")
          if (!cid || byId.has(cid)) continue
          const call = await getScheduledCallById(cid)
          if (call) byId.set(cid, call)
        }
        if (gen === fetchGen) {
          setCallsFromSessions(Array.from(byId.values()))
        }
      })().catch(() => {
        if (gen === fetchGen) setCallsFromSessions([])
      })
    })
  }, [uid])

  const mine = useMemo(() => {
    if (!uid) return []
    const profileUid = userProfile?.uid
    const matchUid = (publisherId: string) =>
      samePublisherId(publisherId, uid) || samePublisherId(publisherId, profileUid)

    const merged = new Map<string, ScheduledCall>()

    callsForToday.filter((c) => matchUid(c.publisherId)).forEach((c) => merged.set(c.id, c))
    callsFromSessions.forEach((c) => merged.set(c.id, c))

    return Array.from(merged.values()).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
  }, [callsForToday, callsFromSessions, uid, userProfile?.uid])

  if (!uid) return null

  return (
    <Card className="border-teal-200 dark:border-teal-900 bg-teal-50/30 dark:bg-teal-950/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-teal-600" />
          <CardTitle className="text-lg">Today&apos;s scheduled rooms</CardTitle>
        </div>
        <CardDescription>
          Calls assigned to you for today ({dateKey}), plus any scheduled room you currently host in Firestore. Choose one,
          then use <strong>Go live in scheduled room</strong> below. You can still start an ad-hoc stream if nothing is
          selected.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No scheduled rooms for you right now. If your admin just reassigned you, refresh the page. If you were created
            before first login, ask the admin to confirm your publisher is selected on the scheduled call.
          </p>
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
                      {c.dateKey && c.dateKey !== dateKey ? (
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {c.dateKey}
                        </Badge>
                      ) : null}
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

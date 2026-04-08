"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { db } from "@/lib/firebase"
import { collection, onSnapshot, query, where } from "firebase/firestore"
import { getAvailableStreamsSplit, type SubscriberPermission } from "@/lib/subscriber"
import {
  getLocalDateKey,
  getScheduledCallById,
  isCallInTimeWindow,
  isScheduledCallTransmitting,
  type ScheduledCall,
} from "@/lib/scheduled-calls"
import { isAwaitingBroadcastSession } from "@/lib/streaming"
import { streamSportLabel } from "@/lib/sports"
import { StreamViewer } from "./stream-viewer"
import { SubscriberFloatingChat } from "@/components/subscriber/subscriber-floating-chat"
import { useAuth } from "@/hooks/use-auth"
import { useIsMobile } from "@/hooks/use-mobile"
import { Phone, Radio, Activity } from "lucide-react"

type ActiveSessionRow = {
  id: string
  roomId: string
  publisherId: string
  isActive: boolean
  awaitingBroadcast?: boolean
  scheduledCallId?: string
}

function isPermissionLive(perm: SubscriberPermission, sessions: ActiveSessionRow[]): boolean {
  const s = perm.streamSession
  if (!s) return false
  return sessions.some(
    (a) =>
      a.isActive &&
      a.awaitingBroadcast !== true &&
      a.roomId === s.roomId &&
      a.publisherId === s.publisherId,
  )
}

export type SubscriberScheduledCallsProps = {
  userId: string
}

export function SubscriberScheduledCalls({ userId }: SubscriberScheduledCallsProps) {
  const { user, userProfile } = useAuth()
  const isMobile = useIsMobile()
  const [activeSessions, setActiveSessions] = useState<ActiveSessionRow[]>([])
  const [scheduledPermissions, setScheduledPermissions] = useState<SubscriberPermission[]>([])
  const [listening, setListening] = useState<SubscriberPermission | null>(null)
  const [streamsLoading, setStreamsLoading] = useState(true)
  /** Calendar row for each stream session id (from scheduledCallId when present). */
  const [callMetaByStreamSessionId, setCallMetaByStreamSessionId] = useState<
    Record<string, ScheduledCall | null>
  >({})
  const dateKey = getLocalDateKey()

  const loadScheduledStreams = useCallback(async () => {
    if (!userId) return
    try {
      const { scheduled } = await getAvailableStreamsSplit(userId)
      const sorted = [...scheduled].sort((a, b) => {
        const nameA = (a.publisherName || "").toLowerCase()
        const nameB = (b.publisherName || "").toLowerCase()
        if (nameA !== nameB) return nameA.localeCompare(nameB)
        return (a.streamSession?.title || "").localeCompare(b.streamSession?.title || "")
      })
      setScheduledPermissions(sorted)
      setListening((cur) => {
        if (!cur) return cur
        return sorted.find((p) => p.id === cur.id) ?? null
      })
    } finally {
      setStreamsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    loadScheduledStreams()
    const interval = setInterval(loadScheduledStreams, 5000)
    return () => clearInterval(interval)
  }, [loadScheduledStreams])

  useEffect(() => {
    const q = query(collection(db, "streamSessions"), where("isActive", "==", true))
    return onSnapshot(q, (snap) => {
      setActiveSessions(
        snap.docs.map((d) => {
          const x = d.data()
          return {
            id: d.id,
            roomId: String(x.roomId ?? ""),
            publisherId: String(x.publisherId ?? ""),
            isActive: !!x.isActive,
            awaitingBroadcast: x.awaitingBroadcast === true,
            scheduledCallId: x.scheduledCallId ? String(x.scheduledCallId) : undefined,
          }
        }),
      )
    })
  }, [])

  const dedupedRooms = useMemo(() => {
    const m = new Map<string, SubscriberPermission>()
    scheduledPermissions.forEach((p) => {
      const sid = p.streamSession?.id
      if (sid && !m.has(sid)) m.set(sid, p)
    })
    return Array.from(m.values())
  }, [scheduledPermissions])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const next: Record<string, ScheduledCall | null> = {}
      for (const p of dedupedRooms) {
        const sess = p.streamSession
        if (!sess?.id) continue
        const cid = sess.scheduledCallId?.trim()
        if (cid) {
          const call = await getScheduledCallById(cid)
          if (cancelled) return
          next[sess.id] = call
        } else {
          next[sess.id] = null
        }
      }
      if (!cancelled) setCallMetaByStreamSessionId(next)
    })()
    return () => {
      cancelled = true
    }
  }, [dedupedRooms])

  const liveCount = useMemo(
    () => dedupedRooms.filter((p) => isPermissionLive(p, activeSessions)).length,
    [dedupedRooms, activeSessions],
  )

  const emptyViewerPane = (
    <Card>
      <CardContent className="flex items-center justify-center p-12 text-center text-sm text-muted-foreground">
        Select a room below to listen. Scheduled games stay in this tab; publisher direct streams are under{" "}
        <strong className="mx-1 text-foreground">Audio Streams</strong>.
      </CardContent>
    </Card>
  )

  const roomsListUl = (
    <ul className="space-y-3">
      {dedupedRooms.map((perm) => {
        const sess = perm.streamSession!
        const cal =
          sess.id && Object.prototype.hasOwnProperty.call(callMetaByStreamSessionId, sess.id)
            ? callMetaByStreamSessionId[sess.id]
            : undefined
        const live =
          cal != null ? isScheduledCallTransmitting(cal, activeSessions) : isPermissionLive(perm, activeSessions)
        const inWindow = cal ? isCallInTimeWindow(cal) : false
        const title = cal?.title?.trim() || sess.title || "Scheduled room"
        const sport = cal?.sport?.trim() || sess.sport?.trim()
        const publisherLine = cal?.publisherName || perm.publisherName
        const dateLine = cal?.dateKey
        const created =
          sess.createdAt && typeof (sess.createdAt as { toDate?: () => Date }).toDate === "function"
            ? (sess.createdAt as { toDate: () => Date }).toDate()
            : sess.createdAt
              ? new Date(sess.createdAt as Date)
              : null
        const timeLine = cal
          ? `${cal.startsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} – ${cal.endsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
          : created && !Number.isNaN(created.getTime())
            ? `Room opened ${created.toLocaleString()}`
            : null
        const isSelected = Boolean(listening?.streamSession?.id && listening.streamSession.id === sess.id)

        return (
          <li
            key={sess.id}
            className={`flex flex-col gap-3 rounded-lg border bg-card p-3 sm:p-4 ${isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
          >
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{title}</span>
                {live ? (
                  <Badge variant="destructive" className="animate-pulse text-xs">
                    LIVE
                  </Badge>
                ) : inWindow ? (
                  <Badge variant="outline" className="text-xs">
                    In window
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    Upcoming / ended
                  </Badge>
                )}
                {isAwaitingBroadcastSession(sess) ? (
                  <Badge variant="secondary" className="text-xs">
                    Waiting for host
                  </Badge>
                ) : null}
                {sport ? (
                  <Badge variant="secondary" className="text-xs font-normal">
                    {streamSportLabel(sport)}
                  </Badge>
                ) : null}
                {dateLine ? (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {dateLine}
                  </Badge>
                ) : null}
              </div>
              {timeLine ? (
                <p className="text-xs text-muted-foreground">
                  {timeLine} · {publisherLine}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">{publisherLine}</p>
              )}
              <p className="break-all font-mono text-[11px] text-muted-foreground">Room ID: {sess.roomId}</p>
            </div>
            <Button type="button" size="sm" className="w-full shrink-0 sm:w-auto" onClick={() => setListening(perm)}>
              <Radio className="mr-2 h-3.5 w-3.5" />
              Listen
            </Button>
          </li>
        )
      })}
    </ul>
  )

  const roomsColumn = (
    <div className="space-y-3 lg:col-span-1">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Activity className="h-4 w-4" />
        Rooms you can open
      </div>
      {roomsListUl}
    </div>
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Your scheduled rooms</CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="animate-pulse text-xs w-fit">
                Auto-updating
              </Badge>
              <Badge variant={liveCount > 0 ? "default" : "secondary"} className="w-fit">
                {liveCount} live now
              </Badge>
            </div>
          </div>
          <CardDescription>
            Every <strong className="text-foreground">admin-scheduled</strong> room you&apos;re assigned to (by publisher
            or by stream), including games on other calendar days. Today is <span className="font-mono">{dateKey}</span>.
            Publisher-started feeds that are not scheduled rooms are under <strong className="text-foreground">Audio Streams</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {streamsLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : dedupedRooms.length === 0 ? (
            <Alert>
              <AlertDescription className="text-sm">
                No scheduled rooms are available to you yet. After an admin assigns you to a publisher or to a specific
                scheduled stream, active rooms appear here. Direct publisher streams (not tied to a scheduled room) show
                under <strong>Audio Streams</strong>.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
              {listening && isMobile ? (
                <div className="space-y-4 lg:col-span-3">
                  <p className="text-xs text-muted-foreground">
                    Tap <strong className="text-foreground">Listen</strong> on another room to switch. Audio connects
                    right away for the room you chose.
                  </p>
                  {roomsColumn}
                  <StreamViewer
                    key={listening.streamSession?.id || listening.id}
                    permission={listening}
                    onLeaveStream={() => setListening(null)}
                    autoJoin={true}
                    layout="mobileInline"
                  />
                  {user && userProfile && listening.streamSession?.id ? (
                    <SubscriberFloatingChat
                      streamSessionId={listening.streamSession.id}
                      streamTitle={listening.streamSession.title}
                      userId={user.uid}
                      userName={userProfile.displayName || userProfile.email || ""}
                      userEmail={userProfile.email}
                      allowChat={userProfile.allowChat === true}
                    />
                  ) : null}
                </div>
              ) : listening ? (
                <div className="space-y-4 lg:col-span-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setListening(null)}
                    className="w-full text-sm sm:w-auto sm:text-base"
                  >
                    ← Back to rooms
                  </Button>
                  <StreamViewer
                    key={listening.streamSession?.id || listening.id}
                    permission={listening}
                    onLeaveStream={() => setListening(null)}
                    autoJoin={true}
                    layout="standard"
                  />
                </div>
              ) : (
                <>
                  {roomsColumn}
                  <div className="hidden lg:col-span-2 lg:block">{emptyViewerPane}</div>
                </>
              )}
            </div>
          )}
          <Alert>
            <AlertDescription className="text-xs sm:text-sm">
              <strong>Audio Streams</strong> lists only publisher-started feeds (not scheduled game rooms).
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}

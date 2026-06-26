"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  compareSubscriberPermissionsByStreamStart,
  streamSessionCreatedAtMs,
  type SubscriberPermission,
} from "@/lib/subscriber"
import { useSubscriberDashboard } from "@/hooks/use-subscriber-dashboard"
import {
  getLocalDateKey,
  getScheduledCallById,
  isCallInTimeWindow,
  isScheduledCallTransmitting,
  type ScheduledCall,
} from "@/lib/scheduled-calls"
import { isAwaitingBroadcastSession } from "@/lib/streaming"
import type { StreamSession } from "@/lib/streaming"
import { streamSportLabel } from "@/lib/sports"
import { StreamViewer, type StreamViewerHandle } from "./stream-viewer"
import { SubscriberFloatingChat } from "@/components/subscriber/subscriber-floating-chat"
import { useAuth } from "@/hooks/use-auth"
import { useIsMobile } from "@/hooks/use-mobile"
import { Phone, Radio, Activity, RefreshCw, Loader2, Square } from "lucide-react"

function isStreamSessionLive(sess: StreamSession | undefined): boolean {
  return Boolean(sess?.isActive && sess.awaitingBroadcast !== true)
}

function isPermissionLive(perm: SubscriberPermission): boolean {
  return isStreamSessionLive(perm.streamSession)
}

function isScheduledCallLive(call: ScheduledCall, sess: StreamSession | undefined): boolean {
  if (!sess || !isStreamSessionLive(sess)) return false
  return isScheduledCallTransmitting(call, [
    {
      roomId: String(sess.roomId ?? ""),
      publisherId: String(sess.publisherId ?? ""),
      isActive: true,
      awaitingBroadcast: sess.awaitingBroadcast === true,
    },
  ])
}

export type SubscriberScheduledCallsProps = {
  userId: string
}

export function SubscriberScheduledCalls({ userId }: SubscriberScheduledCallsProps) {
  const { user, userProfile } = useAuth()
  const { scheduled, loading: streamsLoading, refreshing, refresh } = useSubscriberDashboard()
  const isMobile = useIsMobile()
  const scheduledPermissions = useMemo(
    () => [...scheduled].sort(compareSubscriberPermissionsByStreamStart),
    [scheduled],
  )
  const [listening, setListening] = useState<SubscriberPermission | null>(null)
  /** Calendar row for each stream session id (from scheduledCallId when present). */
  const [callMetaByStreamSessionId, setCallMetaByStreamSessionId] = useState<
    Record<string, ScheduledCall | null>
  >({})
  const streamViewerRef = useRef<StreamViewerHandle>(null)
  const pendingListeningRef = useRef<SubscriberPermission | null>(null)
  const dateKey = getLocalDateKey()

  useEffect(() => {
    setListening((cur) => {
      if (!cur) return cur
      return scheduledPermissions.find((p) => p.id === cur.id) ?? null
    })
  }, [scheduledPermissions])

  const dedupedRooms = useMemo(() => {
    const m = new Map<string, SubscriberPermission>()
    scheduledPermissions.forEach((p) => {
      const sid = p.streamSession?.id
      if (sid && !m.has(sid)) m.set(sid, p)
    })
    return Array.from(m.values())
  }, [scheduledPermissions])

  /** Scheduled call start time when loaded; else session createdAt — ascending (earliest first). */
  const dedupedRoomsSorted = useMemo(() => {
    const list = [...dedupedRooms]
    list.sort((a, b) => {
      const sessA = a.streamSession
      const sessB = b.streamSession
      const idA = sessA?.id
      const idB = sessB?.id
      const calA =
        idA && Object.prototype.hasOwnProperty.call(callMetaByStreamSessionId, idA)
          ? callMetaByStreamSessionId[idA]
          : undefined
      const calB =
        idB && Object.prototype.hasOwnProperty.call(callMetaByStreamSessionId, idB)
          ? callMetaByStreamSessionId[idB]
          : undefined
      const ta = calA?.startsAt ? calA.startsAt.getTime() : streamSessionCreatedAtMs(sessA)
      const tb = calB?.startsAt ? calB.startsAt.getTime() : streamSessionCreatedAtMs(sessB)
      if (ta !== tb) return ta - tb
      return (sessA?.title || "").localeCompare(sessB?.title || "")
    })
    return list
  }, [dedupedRooms, callMetaByStreamSessionId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const entries = await Promise.all(
        dedupedRooms.map(async (p) => {
          const sess = p.streamSession
          if (!sess?.id) return null
          const cid = sess.scheduledCallId?.trim()
          if (!cid) return [sess.id, null] as const
          const call = await getScheduledCallById(cid)
          return [sess.id, call] as const
        }),
      )
      if (cancelled) return
      const next: Record<string, ScheduledCall | null> = {}
      for (const entry of entries) {
        if (!entry) continue
        next[entry[0]] = entry[1]
      }
      setCallMetaByStreamSessionId(next)
    })()
    return () => {
      cancelled = true
    }
  }, [dedupedRooms])

  /** Stop clears listening via onLeaveStream; then we open the room the user tapped. */
  useEffect(() => {
    if (listening !== null) return
    const next = pendingListeningRef.current
    if (!next) return
    pendingListeningRef.current = null
    setListening(next)
  }, [listening])

  const handleListenToRoom = useCallback(
    (perm: SubscriberPermission) => {
      if (listening?.id === perm.id) return
      if (listening && listening.id !== perm.id) {
        pendingListeningRef.current = perm
        void streamViewerRef.current?.leaveStream()
        return
      }
      setListening(perm)
    },
    [listening],
  )

  const handleBackToRooms = useCallback(() => {
    pendingListeningRef.current = null
    void streamViewerRef.current?.leaveStream()
  }, [])

  const liveCount = useMemo(
    () => dedupedRoomsSorted.filter((p) => isPermissionLive(p)).length,
    [dedupedRoomsSorted],
  )

  const emptyViewerPane = (
    <Card>
      <CardContent className="flex items-center justify-center p-12 text-center text-sm text-muted-foreground">
        Select a room on the left to listen. Switch anytime by choosing another room. Scheduled games stay in this tab;
        publisher direct streams are under <strong className="mx-1 text-foreground">Audio Streams</strong>.
      </CardContent>
    </Card>
  )

  const roomsListUl = (
    <ul className="space-y-3">
      {dedupedRoomsSorted.map((perm) => {
        const sess = perm.streamSession!
        const cal =
          sess.id && Object.prototype.hasOwnProperty.call(callMetaByStreamSessionId, sess.id)
            ? callMetaByStreamSessionId[sess.id]
            : undefined
        const live = cal != null ? isScheduledCallLive(cal, sess) : isPermissionLive(perm)
        const inWindow = cal ? isCallInTimeWindow(cal) : false
        const title = cal?.title?.trim() || sess.title || "Scheduled room"
        const sport = cal?.sport?.trim() || sess.sport?.trim()
        const publisherLine = cal?.publisherName || perm.publisherName
        const dateLine = cal?.dateKey
        const created =
          sess.createdAt &&
          typeof (sess.createdAt as unknown as { toDate?: () => Date }).toDate === "function"
            ? (sess.createdAt as unknown as { toDate: () => Date }).toDate()
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
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className="min-w-0 flex-1 sm:w-auto sm:flex-initial"
                onClick={() => handleListenToRoom(perm)}
              >
                <Radio className="mr-2 h-3.5 w-3.5 shrink-0" />
                Listen
              </Button>
              {isSelected ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0 gap-1"
                  onClick={handleBackToRooms}
                >
                  <Square className="h-3.5 w-3.5" />
                  Stop
                </Button>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )

  const roomsColumn = (
    <div className="space-y-3">
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <Phone className="h-5 w-5 text-primary shrink-0" />
              <CardTitle className="text-lg">Your scheduled rooms</CardTitle>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 w-full gap-2 sm:w-auto sm:min-w-[8.5rem]"
                disabled={streamsLoading || refreshing}
                onClick={() => void refresh(true)}
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Refresh
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="animate-pulse text-xs w-fit">
                  Auto-updating
                </Badge>
                <Badge variant={liveCount > 0 ? "default" : "secondary"} className="w-fit">
                  {liveCount} live now
                </Badge>
              </div>
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
          ) : dedupedRoomsSorted.length === 0 ? (
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
                    ref={streamViewerRef}
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
              ) : isMobile && !listening ? (
                <div className="lg:col-span-3">{roomsColumn}</div>
              ) : (
                <>
                  <div className="min-h-0 lg:col-span-1 lg:max-h-[min(75vh,640px)] lg:overflow-y-auto lg:pr-1">
                    {roomsColumn}
                  </div>
                  <div className="space-y-4 lg:col-span-2">
                    {listening ? (
                      <>
                        <StreamViewer
                          ref={streamViewerRef}
                          key={listening.streamSession?.id || listening.id}
                          permission={listening}
                          onLeaveStream={() => setListening(null)}
                          autoJoin={true}
                          layout="standard"
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
                      </>
                    ) : (
                      emptyViewerPane
                    )}
                  </div>
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

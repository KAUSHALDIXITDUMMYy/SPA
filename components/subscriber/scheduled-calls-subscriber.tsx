"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
    <div className="border border-border rounded-lg p-12 text-center">
      <Radio className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
      <p className="text-sm text-muted-foreground font-mono">SELECT A ROOM TO LISTEN</p>
      <p className="text-xs text-muted-foreground/60 mt-1">Choose from the list to begin playback.</p>
    </div>
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
            className={`rounded-lg border p-4 transition-all cursor-pointer ${
              isSelected
                ? "border-primary bg-primary/5"
                : "border-border bg-card hover:border-primary/30"
            }`}
            onClick={() => handleListenToRoom(perm)}
          >
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {live ? (
                  <span className="text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse">
                    LIVE
                  </span>
                ) : inWindow ? (
                  <span className="text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                    LIVE SOON
                  </span>
                ) : (
                  <span className="text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
                    SCHEDULED
                  </span>
                )}
                {isAwaitingBroadcastSession(sess) && (
                  <span className="text-[10px] font-mono tracking-wider px-2 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
                    PENDING
                  </span>
                )}
                {sport && (
                  <span className="text-[10px] font-mono tracking-wider px-2 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
                    {streamSportLabel(sport)}
                  </span>
                )}
              </div>
              <h4 className="font-medium text-sm text-foreground">{title}</h4>
              <div className="space-y-0.5">
                {timeLine && (
                  <p className="text-xs text-muted-foreground font-mono">{timeLine}</p>
                )}
                <p className="text-xs text-muted-foreground font-mono">
                  HOST: {publisherLine?.toUpperCase()}
                </p>
                {dateLine && (
                  <p className="text-[10px] text-muted-foreground/60 font-mono">DATE: {dateLine}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button
                type="button"
                size="sm"
                className="flex-1 font-mono tracking-wider text-xs"
                onClick={(e) => {
                  e.stopPropagation()
                  handleListenToRoom(perm)
                }}
              >
                <Radio className="mr-2 h-3.5 w-3.5" />
                LISTEN
              </Button>
              {isSelected && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0 font-mono tracking-wider text-xs"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleBackToRooms()
                  }}
                >
                  <Square className="h-3 w-3 mr-1" />
                  STOP
                </Button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )

  const roomsColumn = (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground tracking-wider">
        <Activity className="h-3.5 w-3.5" />
        AVAILABLE ROOMS
      </div>
      {roomsListUl}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Phone className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-mono text-lg font-bold tracking-wide uppercase">Scheduled Rooms</h2>
            <p className="text-[10px] font-mono text-muted-foreground tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              CURRENT QUEUE: {dedupedRoomsSorted.length} SESSION{dedupedRoomsSorted.length !== 1 ? "S" : ""}
              {liveCount > 0 && <> · <span className="text-red-400">{liveCount} LIVE</span></>}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="font-mono text-xs tracking-wider"
          disabled={streamsLoading || refreshing}
          onClick={() => void refresh(true)}
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
          REFRESH
        </Button>
      </div>

      {/* Content */}
      {streamsLoading ? (
        <div className="border border-border rounded-lg p-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mb-3" />
          <p className="text-muted-foreground text-sm font-mono">LOADING ROOMS...</p>
        </div>
      ) : dedupedRoomsSorted.length === 0 ? (
        <div className="border border-border rounded-lg p-8 text-center">
          <Phone className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-mono">NO SCHEDULED ROOMS AVAILABLE</p>
          <p className="text-xs text-muted-foreground/60 mt-1 max-w-sm mx-auto">
            After an admin assigns you to a publisher or stream, active rooms appear here.
            Direct publisher streams are under Streams.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {listening && isMobile ? (
            <div className="space-y-4 lg:col-span-3">
              <p className="text-xs text-muted-foreground font-mono">
                Tap another room to switch. Audio connects immediately.
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

      <div className="border border-border rounded-lg px-4 py-3 bg-secondary/30">
        <p className="text-[10px] font-mono text-muted-foreground tracking-wider">
          NOTE: Publisher-started feeds (not tied to a scheduled room) are under the STREAMS tab. Today is {dateKey}.
        </p>
      </div>
    </div>
  )
}

"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Users,
  Eye,
  Play,
  Clock,
  TrendingUp,
  RefreshCw,
  Radio,
  Smartphone,
  Monitor,
  Tablet,
  MapPin,
  Globe,
  ShieldAlert,
  Download,
  Flag,
  Headphones,
  MessageSquare,
  Volume2,
  VolumeX,
} from "lucide-react"
import {
  getAdminAnalytics,
  getSubscriberUsage,
  type StreamViewer,
  type SubscriberUsageRow,
} from "@/lib/analytics"
import { startPoll } from "@/lib/client/poll"
import { formatViewerLocationLabel, normalizeViewerLocation } from "@/lib/viewer-location"
import { resolveUserTenant, type UserTenant } from "@/lib/tenant"
import type { UserProfile } from "@/lib/auth"
import { updateUserStatus } from "@/lib/admin"
import { useAuth } from "@/hooks/use-auth"
import { useToast } from "@/hooks/use-toast"
import { StreamChatPanel } from "@/components/ui/stream-chat-panel"
import { StreamViewer as SubscriberStreamPlayer, type StreamViewerHandle } from "@/components/subscriber/stream-viewer"
import type { SubscriberPermission } from "@/lib/subscriber"
import type { StreamSession } from "@/lib/streaming"

const ADMIN_ANALYTICS_POLL_MS = 3_000

function subscriberVisibleToAdmin(
  subscriberTenant: UserTenant | undefined,
  admin: UserProfile,
): boolean {
  const adminScope = resolveUserTenant(admin)
  // Align with server getAdminAnalytics: missing tenant counts as default.
  const t = subscriberTenant === "kevionics" ? "kevionics" : "default"
  return t === adminScope
}

type ActiveStreamRow = {
  id: string
  publisherId: string
  publisherName: string
  roomId: string
  isActive: boolean
  createdAt: Date
  title?: string
  description?: string
  sport?: string
  scheduledCallId?: string
  awaitingBroadcast?: boolean
}

function activeStreamToAdminListenPermission(stream: ActiveStreamRow, adminUid: string): SubscriberPermission {
  const session: StreamSession = {
    id: stream.id,
    publisherId: stream.publisherId,
    publisherName: stream.publisherName || "",
    roomId: stream.roomId,
    isActive: stream.isActive,
    createdAt: stream.createdAt,
    title: stream.title,
    description: stream.description,
    scheduledCallId: stream.scheduledCallId,
    awaitingBroadcast: stream.awaitingBroadcast,
    sport: stream.sport,
  }
  return {
    id: `admin-listen-${stream.id}`,
    subscriberId: adminUid,
    publisherId: stream.publisherId,
    publisherName: stream.publisherName || "",
    allowVideo: true,
    allowAudio: true,
    createdAt: stream.createdAt,
    isActive: true,
    streamSession: session,
  }
}

type EnrichedViewer = StreamViewer & {
  ip?: string
  deviceClass?: "mobile" | "tablet" | "desktop" | "unknown"
  deviceLabel?: string
  deviceKey?: string
  multiDevice?: boolean
  origin?: string | null
  concurrentSession?: boolean
  foreignOrigin?: boolean
  staleHeartbeat?: boolean
  watchSeconds?: number
  userAgent?: string | null
}

const DEVICE_ICON = {
  mobile: Smartphone,
  tablet: Tablet,
  desktop: Monitor,
  unknown: Globe,
} as const

function formatDuration(seconds: number) {
  if (!seconds || seconds < 0) return "0s"
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

function hostFromOrigin(origin: string | null | undefined): string | null {
  if (!origin) return null
  try {
    return new URL(origin).host
  } catch {
    return origin
  }
}

export function AdminAnalytics() {
  const [activeViewers, setActiveViewers] = useState<EnrichedViewer[]>([])
  const [activeStreams, setActiveStreams] = useState<ActiveStreamRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [refreshing, setRefreshing] = useState(false)
  const [usage, setUsage] = useState<SubscriberUsageRow[]>([])
  const [usageWindow, setUsageWindow] = useState<30 | 7 | 90>(30)
  const [usageLoading, setUsageLoading] = useState(false)
  const [adminListeningStreamId, setAdminListeningStreamId] = useState<string | null>(null)
  const [monitorStreamId, setMonitorStreamId] = useState<string | null>(null)
  const [previewAudioEnabled, setPreviewAudioEnabled] = useState(true)
  const [activeTab, setActiveTab] = useState("live")
  const { user, userProfile } = useAuth()
  const { toast } = useToast()
  const unmountRef = useRef(false)
  const previewPlayerRef = useRef<StreamViewerHandle>(null)

  const fetchDashboard = useCallback(
    async (options?: { manual?: boolean }) => {
      const isManual = options?.manual === true
      if (isManual) setRefreshing(true)
      try {
        if (!userProfile || userProfile.role !== "admin") {
          if (!unmountRef.current) setLoading(false)
          return
        }

        const dashboard = await getAdminAnalytics(100)
        if (unmountRef.current) return

        const viewers = dashboard.activeViewers
          .map((v: any) => ({
            ...v,
            location: normalizeViewerLocation(v.location ?? v.geo),
          }))
          .filter((v: any) =>
            subscriberVisibleToAdmin(v.subscriberTenant, userProfile),
          ) as EnrichedViewer[]

        const streams = (dashboard.activeStreams as any[]).map((s) => ({
          ...s,
          createdAt: s.createdAt ? new Date(s.createdAt) : new Date(),
        })) as ActiveStreamRow[]

        setActiveViewers(viewers)
        setActiveStreams(streams)
        setLastUpdated(new Date())
        setError("")
        setLoading(false)
      } catch (err: unknown) {
        if (!unmountRef.current) {
          const message = err instanceof Error ? err.message : "Failed to load analytics"
          setError(message)
          setLoading(false)
        }
      } finally {
        if (isManual && !unmountRef.current) setRefreshing(false)
      }
    },
    [userProfile],
  )

  useEffect(() => {
    unmountRef.current = false
    setLoading(true)
    setError("")
    const stop = startPoll(() => void fetchDashboard(), ADMIN_ANALYTICS_POLL_MS)
    return () => {
      unmountRef.current = true
      stop()
    }
  }, [fetchDashboard])

  const fetchUsage = useCallback(
    async (windowDays: number) => {
      if (!userProfile || userProfile.role !== "admin") return
      setUsageLoading(true)
      try {
        const rows = await getSubscriberUsage(windowDays)
        if (!unmountRef.current) {
          // Client safety net: SportsMagician admins never list @kevionics users.
          const scope = resolveUserTenant(userProfile)
          setUsage(
            rows.filter((r) => {
              const t = resolveUserTenant({
                email: r.email || undefined,
                tenant: (r.tenant as UserTenant | undefined) || undefined,
              })
              return scope === "kevionics" ? t === "kevionics" : t !== "kevionics"
            }),
          )
        }
      } finally {
        if (!unmountRef.current) setUsageLoading(false)
      }
    },
    [userProfile],
  )

  useEffect(() => {
    void fetchUsage(usageWindow)
  }, [fetchUsage, usageWindow])

  const validActiveViewers = useMemo(() => {
    const activeStreamIds = new Set(activeStreams.map((s) => s.id))
    const seen = new Set<string>()
    return activeViewers.filter((viewer) => {
      if (!activeStreamIds.has(viewer.streamSessionId) || viewer.isActive !== true) return false
      // One row per device (not per account) so mobile + Windows both show.
      const key =
        viewer.id ||
        `${viewer.streamSessionId}:${viewer.subscriberId}:${(viewer as any).deviceKey || viewer.ip || "x"}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [activeViewers, activeStreams])

  const flaggedViewers = useMemo(
    () => validActiveViewers.filter((v) => v.concurrentSession || v.foreignOrigin),
    [validActiveViewers],
  )

  const mobileCount = validActiveViewers.filter((v) => v.deviceClass === "mobile").length

  useEffect(() => {
    if (activeStreams.length === 0) {
      setMonitorStreamId(null)
      return
    }
    if (monitorStreamId && activeStreams.some((s) => s.id === monitorStreamId)) return
    const firstId = activeStreams[0].id
    setMonitorStreamId(firstId)
    setAdminListeningStreamId(firstId)
  }, [activeStreams, monitorStreamId])

  useEffect(() => {
    if (!adminListeningStreamId) return
    if (!activeStreams.some((s) => s.id === adminListeningStreamId)) {
      setAdminListeningStreamId(null)
    }
  }, [activeStreams, adminListeningStreamId])

  const monitorStream = useMemo(
    () => activeStreams.find((s) => s.id === monitorStreamId) ?? null,
    [activeStreams, monitorStreamId],
  )

  const listeningStream = useMemo(
    () => activeStreams.find((s) => s.id === adminListeningStreamId) ?? null,
    [activeStreams, adminListeningStreamId],
  )

  const viewersOnMonitor = useMemo(
    () =>
      monitorStream
        ? validActiveViewers.filter((v) => v.streamSessionId === monitorStream.id)
        : [],
    [validActiveViewers, monitorStream],
  )

  const detailPaneRef = useRef<HTMLDivElement>(null)

  /** Selecting a stream always starts listening immediately. */
  const selectStream = useCallback((streamId: string) => {
    setMonitorStreamId(streamId)
    setAdminListeningStreamId(streamId)
    setPreviewAudioEnabled(true)
    setActiveTab("live")
    requestAnimationFrame(() => {
      detailPaneRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    })
  }, [])

  const stopPreviewListen = useCallback(() => {
    void previewPlayerRef.current?.leaveStream()
    setAdminListeningStreamId(null)
    setPreviewAudioEnabled(true)
  }, [])

  const startPreviewListen = useCallback(() => {
    if (!monitorStreamId) return
    setAdminListeningStreamId(monitorStreamId)
    setPreviewAudioEnabled(true)
  }, [monitorStreamId])

  const togglePreviewMute = useCallback(() => {
    const next = previewPlayerRef.current?.toggleAudio()
    if (typeof next === "boolean") setPreviewAudioEnabled(next)
  }, [])

  const handleDeactivate = useCallback(
    async (subscriberId: string, name: string) => {
      if (!userProfile) return
      try {
        await updateUserStatus(subscriberId, false)
        toast({
          title: "Subscriber deactivated",
          description: `${name} can no longer start or renew streams. Active audio is not cut.`,
        })
        void fetchDashboard({ manual: true })
      } catch (err: any) {
        toast({
          title: "Failed to deactivate",
          description: err?.message || "Please try again",
          variant: "destructive",
        })
      }
    },
    [userProfile, toast, fetchDashboard],
  )

  const exportUsageCsv = useCallback(() => {
    const header = [
      "subscriberId",
      "name",
      "email",
      "tenant",
      "streamJoins",
      "uniqueStreams",
      "publishers",
      "firstSeen",
      "lastSeen",
      "recentIps",
      "recentDevices",
    ]
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = [header.join(",")]
    for (const r of usage) {
      lines.push(
        [
          r.subscriberId,
          r.name,
          r.email,
          r.tenant,
          r.streamJoins,
          r.uniqueStreams,
          r.publishers.join(" | "),
          r.firstSeen,
          r.lastSeen,
          r.recentIps.join(" | "),
          r.recentDevices.join(" | "),
        ]
          .map(escape)
          .join(","),
      )
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `subscriber-usage-${usageWindow}d-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [usage, usageWindow])

  if (loading && activeViewers.length === 0 && activeStreams.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  const isListening = !!(monitorStream && adminListeningStreamId === monitorStream.id)

  return (
    <div className={`space-y-5 ${listeningStream && activeTab !== "live" ? "pb-20" : ""}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Analytics</h2>
            <Badge variant={activeStreams.length > 0 ? "default" : "secondary"} className="gap-1.5">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  activeStreams.length > 0 ? "bg-primary-foreground animate-pulse" : "bg-muted-foreground"
                }`}
              />
              {activeStreams.length > 0 ? `${activeStreams.length} live` : "Idle"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Listen, chat, and track viewers with IP &amp; device — refreshes every{" "}
            {ADMIN_ANALYTICS_POLL_MS / 1000}s.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground hidden sm:block">
            Updated {lastUpdated.toLocaleTimeString()}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={refreshing}
            onClick={() => void fetchDashboard({ manual: true })}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Watching" value={validActiveViewers.length} />
        <Stat label="Streams" value={activeStreams.length} />
        <Stat label="Mobile" value={mobileCount} />
        <Stat label="Signals" value={flaggedViewers.length} alert={flaggedViewers.length > 0} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full sm:w-auto h-auto flex flex-wrap justify-start">
          <TabsTrigger value="live" className="gap-1.5">
            <Headphones className="h-3.5 w-3.5" />
            Live
            {activeStreams.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {activeStreams.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="viewers" className="gap-1.5">
            <Eye className="h-3.5 w-3.5" />
            Viewers
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
              {validActiveViewers.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="signals" className="gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" />
            Signals
            {flaggedViewers.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                {flaggedViewers.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="usage" className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            Usage
          </TabsTrigger>
        </TabsList>

        {/* ── Live: fixed-height split so Listen stays at the top ─────── */}
        <TabsContent value="live" className="mt-0">
          <Card className="overflow-hidden">
            {activeStreams.length === 0 ? (
              <CardContent className="py-16">
                <EmptyState
                  icon={<Radio className="h-12 w-12 text-muted-foreground/40" />}
                  title="No live streams"
                  subtitle="When a publisher goes live, select the call here to listen and open chat."
                />
              </CardContent>
            ) : (
              <div className="flex flex-col lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:h-[560px]">
                {/* Stream list — own scroll, capped height; never stretches the Listen pane */}
                <aside className="order-2 lg:order-1 border-t lg:border-t-0 lg:border-r border-border bg-muted/20 flex flex-col h-[160px] lg:h-full min-h-0 overflow-hidden">
                  <div className="px-3 py-2 border-b border-border shrink-0">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      On air · {activeStreams.length}
                    </p>
                  </div>
                  <div className="overflow-y-auto overscroll-contain flex-1 min-h-0 p-2 space-y-1">
                    {activeStreams.map((stream) => {
                      const count = validActiveViewers.filter(
                        (v) => v.streamSessionId === stream.id,
                      ).length
                      const selected = monitorStreamId === stream.id
                      const listening = adminListeningStreamId === stream.id
                      const duration = Math.floor(
                        (Date.now() - stream.createdAt.getTime()) / 1000,
                      )
                      return (
                        <button
                          key={stream.id}
                          type="button"
                          onClick={() => selectStream(stream.id)}
                          className={`w-full text-left rounded-md px-2.5 py-2 transition-colors border ${
                            selected
                              ? "bg-secondary border-primary/40"
                              : "border-transparent hover:bg-secondary/60"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse shrink-0" />
                            <span className="text-[10px] font-semibold text-destructive uppercase">
                              Live
                            </span>
                            {listening && (
                              <Headphones className="h-3 w-3 text-primary ml-auto shrink-0" />
                            )}
                          </div>
                          <p className="text-sm font-medium truncate leading-snug">
                            {stream.title || "Untitled"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {stream.publisherName}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-1 flex gap-2">
                            <span>{count} watching</span>
                            <span>·</span>
                            <span>{formatDuration(duration)}</span>
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </aside>

                {/* Detail — Listen header always first / sticky; body scrolls separately */}
                <div
                  ref={detailPaneRef}
                  className="order-1 lg:order-2 flex flex-col min-w-0 min-h-0 lg:h-full overflow-hidden"
                >
                  {monitorStream && user ? (
                    <>
                      <div className="sticky top-0 z-10 bg-card px-4 py-3 border-b border-border shrink-0">
                        <h3 className="font-semibold truncate">
                          {monitorStream.title || "Untitled stream"}
                        </h3>
                        <p className="text-sm text-muted-foreground truncate">
                          {monitorStream.publisherName}
                          {monitorStream.sport ? ` · ${monitorStream.sport}` : ""}
                          {" · "}
                          {viewersOnMonitor.length} watching
                          {" · "}
                          {formatDuration(
                            Math.floor((Date.now() - monitorStream.createdAt.getTime()) / 1000),
                          )}
                        </p>
                      </div>

                      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                        <div className="grid grid-cols-1 xl:grid-cols-2 xl:divide-x divide-border">
                          <section className="p-4 space-y-3 border-b xl:border-b-0 border-border">
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              <Headphones className="h-3.5 w-3.5" />
                              Audio
                              {isListening && (
                                <Badge
                                  variant="outline"
                                  className="normal-case tracking-normal font-normal"
                                >
                                  Live preview
                                </Badge>
                              )}
                            </div>
                            {isListening ? (
                              <div className="space-y-3">
                                <SubscriberStreamPlayer
                                  ref={previewPlayerRef}
                                  key={monitorStream.id}
                                  permission={activeStreamToAdminListenPermission(
                                    monitorStream,
                                    user.uid,
                                  )}
                                  layout="mobileInline"
                                  autoJoin
                                  skipActivityAnalytics
                                  hideBuiltInControls
                                />
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="flex-1 gap-2"
                                    onClick={togglePreviewMute}
                                  >
                                    {previewAudioEnabled ? (
                                      <>
                                        <Volume2 className="h-3.5 w-3.5" />
                                        Mute
                                      </>
                                    ) : (
                                      <>
                                        <VolumeX className="h-3.5 w-3.5" />
                                        Unmute
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="flex-1 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                                    onClick={stopPreviewListen}
                                  >
                                    <Headphones className="h-3.5 w-3.5" />
                                    Stop
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
                                  <p className="text-sm text-muted-foreground">
                                    Audio stopped. Press Listen to hear this stream again, or pick
                                    another from the list.
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                                  onClick={startPreviewListen}
                                  disabled={!monitorStream}
                                >
                                  <Headphones className="h-3.5 w-3.5" />
                                  Listen
                                </Button>
                              </div>
                            )}
                          </section>

                          <section className="p-4 space-y-3">
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              <MessageSquare className="h-3.5 w-3.5" />
                              Chat
                            </div>
                            <StreamChatPanel
                              streamSessionId={monitorStream.id}
                              streamTitle={monitorStream.title}
                              currentUserId={user.uid}
                              currentUserName={
                                userProfile?.displayName ||
                                userProfile?.email ||
                                user.email ||
                                "Admin"
                              }
                              currentUserEmail={userProfile?.email ?? user.email ?? undefined}
                              isPublisher={false}
                              canChat={false}
                              isAdmin
                              messageListClassName="h-[240px]"
                              chatHistoryLimit={500}
                            />
                          </section>
                        </div>

                        {viewersOnMonitor.length > 0 && (
                          <div className="border-t border-border px-4 py-3">
                            <p className="text-xs font-medium text-muted-foreground mb-2">
                              On this stream
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {viewersOnMonitor.map((v) => (
                                <div
                                  key={`${v.id}-${v.streamSessionId}`}
                                  className="inline-flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs"
                                >
                                  <Users className="h-3 w-3 text-muted-foreground" />
                                  <span className="font-medium truncate max-w-[120px]">
                                    {v.subscriberName}
                                  </span>
                                  <span className="font-mono text-muted-foreground truncate max-w-[100px]">
                                    {v.ip || "—"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center p-8">
                      <EmptyState
                        icon={<Play className="h-12 w-12 text-muted-foreground/40" />}
                        title={!user ? "Sign in required" : "Select a stream"}
                        subtitle={
                          !user
                            ? "Sign in as admin to listen and chat."
                            : "Choose a live call from the list."
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── Viewers ─────────────────────────────────────────────────── */}
        <TabsContent value="viewers" className="mt-0">
          <Card>
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className="text-base">Active viewers</CardTitle>
              <CardDescription>
                IP, device, and location captured when each subscriber joins.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {validActiveViewers.length > 0 ? (
                <ScrollArea className="h-[480px] pr-3">
                  <div className="space-y-2">
                    {validActiveViewers.map((viewer) => (
                      <ViewerRow
                        key={
                          viewer.id ||
                          `${viewer.streamSessionId}:${viewer.subscriberId}:${viewer.deviceKey || viewer.ip || "x"}`
                        }
                        viewer={viewer}
                        onListen={
                          activeStreams.some((s) => s.id === viewer.streamSessionId)
                            ? () => selectStream(viewer.streamSessionId)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <EmptyState
                  icon={<Eye className="h-12 w-12 text-muted-foreground/40" />}
                  title="No active viewers"
                  subtitle="Viewers appear here as soon as they join a stream."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Signals ─────────────────────────────────────────────────── */}
        <TabsContent value="signals" className="mt-0">
          <Card>
            <CardHeader className="border-b border-border pb-4">
              <CardTitle className="text-base">Restream signals</CardTitle>
              <CardDescription>
                Concurrent streams or foreign origins. Review manually — nothing is auto-blocked.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {flaggedViewers.length > 0 ? (
                <ScrollArea className="h-[480px] pr-3">
                  <div className="space-y-2">
                    {flaggedViewers.map((viewer) => (
                      <FlaggedRow
                        key={`flag-${viewer.id}-${viewer.streamSessionId}`}
                        viewer={viewer}
                        onDeactivate={() =>
                          handleDeactivate(viewer.subscriberId, viewer.subscriberName)
                        }
                        onListen={
                          activeStreams.some((s) => s.id === viewer.streamSessionId)
                            ? () => selectStream(viewer.streamSessionId)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <EmptyState
                  icon={<ShieldAlert className="h-12 w-12 text-muted-foreground/40" />}
                  title="No signals"
                  subtitle="No concurrent or foreign-origin viewers right now."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Usage ───────────────────────────────────────────────────── */}
        <TabsContent value="usage" className="mt-0">
          <Card>
            <CardHeader className="border-b border-border pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Subscriber usage</CardTitle>
                  <CardDescription>Stream joins for billing over the selected window.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-md border border-border overflow-hidden">
                    {([7, 30, 90] as const).map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setUsageWindow(w)}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                          usageWindow === w
                            ? "bg-primary text-primary-foreground"
                            : "bg-background hover:bg-muted"
                        }`}
                      >
                        {w}d
                      </button>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportUsageCsv}
                    disabled={usage.length === 0}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {usageLoading && usage.length === 0 ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </div>
              ) : usage.length === 0 ? (
                <EmptyState
                  icon={<TrendingUp className="h-12 w-12 text-muted-foreground/40" />}
                  title="No usage yet"
                  subtitle="Joins are recorded when subscribers access streams."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Subscriber</th>
                        <th className="py-2 pr-3 font-medium text-right">Streams</th>
                        <th className="py-2 pr-3 font-medium text-right">Unique</th>
                        <th className="py-2 pr-3 font-medium hidden md:table-cell">Publishers</th>
                        <th className="py-2 pr-3 font-medium hidden lg:table-cell">IPs</th>
                        <th className="py-2 font-medium hidden md:table-cell">Last seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usage.map((row) => (
                        <tr key={row.subscriberId} className="border-b border-border/60 last:border-0">
                          <td className="py-3 pr-3">
                            <div className="font-medium truncate max-w-[160px]">{row.name}</div>
                            {row.email && (
                              <div className="text-xs text-muted-foreground truncate max-w-[160px]">
                                {row.email}
                              </div>
                            )}
                          </td>
                          <td className="py-3 pr-3 text-right font-semibold">{row.streamJoins}</td>
                          <td className="py-3 pr-3 text-right">{row.uniqueStreams}</td>
                          <td className="py-3 pr-3 hidden md:table-cell text-xs text-muted-foreground">
                            {row.publishers.length ? row.publishers.join(", ") : "—"}
                          </td>
                          <td className="py-3 pr-3 hidden lg:table-cell text-xs text-muted-foreground">
                            {row.recentIps.length || "—"}
                          </td>
                          <td className="py-3 hidden md:table-cell text-xs text-muted-foreground whitespace-nowrap">
                            {row.lastSeen ? new Date(row.lastSeen).toLocaleString() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {listeningStream && activeTab !== "live" && (
        <div className="fixed bottom-4 inset-x-4 z-40 mx-auto max-w-md">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-lg">
            <Headphones className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Listening</p>
              <p className="text-sm font-medium truncate">
                {listeningStream.title || "Untitled"} · {listeningStream.publisherName}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setActiveTab("live")}>
              Open
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  alert,
}: {
  label: string
  value: string | number
  alert?: boolean
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold mt-0.5 tabular-nums ${alert ? "text-destructive" : ""}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

function ViewerRow({
  viewer,
  onListen,
}: {
  viewer: EnrichedViewer
  onListen?: () => void
}) {
  const DeviceIcon = DEVICE_ICON[viewer.deviceClass || "unknown"] || Globe
  const watchSeconds =
    viewer.watchSeconds ??
    Math.max(0, Math.floor((Date.now() - new Date(viewer.joinedAt).getTime()) / 1000))
  const host = hostFromOrigin(viewer.origin)
  const flagged = viewer.concurrentSession || viewer.foreignOrigin

  return (
    <div
      className={`rounded-md border px-3 py-2.5 ${
        flagged ? "border-destructive/50 bg-destructive/5" : "border-border"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm truncate">{viewer.subscriberName}</p>
            <DeviceIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Badge variant="outline" className="text-[10px] h-5 font-normal">
              {viewer.deviceLabel || viewer.deviceClass || "device"}
            </Badge>
            {viewer.multiDevice && (
              <Badge variant="secondary" className="text-[10px] h-5">
                multi-device
              </Badge>
            )}
            {flagged && (
              <Badge variant="destructive" className="text-[10px] h-5">
                {viewer.concurrentSession ? "concurrent" : "foreign"}
              </Badge>
            )}
            <span
              className={`ml-auto h-2 w-2 rounded-full shrink-0 ${
                viewer.staleHeartbeat ? "bg-amber-500" : "bg-primary"
              }`}
              title={viewer.staleHeartbeat ? "Stale heartbeat" : "Active"}
            />
          </div>
          <p className="text-xs text-muted-foreground truncate">{viewer.publisherName}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-mono">{viewer.ip || "—"}</span>
            <span>{formatViewerLocationLabel(viewer.location)}</span>
            <span>{formatDuration(watchSeconds)}</span>
            {host && <span className="truncate max-w-[140px]">{host}</span>}
          </div>
        </div>
        {onListen && (
          <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={onListen}>
            <Headphones className="h-3 w-3" />
            Listen
          </Button>
        )}
      </div>
    </div>
  )
}

function FlaggedRow({
  viewer,
  onDeactivate,
  onListen,
}: {
  viewer: EnrichedViewer
  onDeactivate: () => void
  onListen?: () => void
}) {
  const host = hostFromOrigin(viewer.origin)
  const reasons: string[] = []
  if (viewer.concurrentSession) reasons.push("Watching more than one stream")
  if (viewer.foreignOrigin) reasons.push(`Foreign origin${host ? ` (${host})` : ""}`)

  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-3">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium text-sm">{viewer.subscriberName}</p>
          <p className="text-xs text-muted-foreground">
            watching <span className="text-foreground">{viewer.publisherName}</span>
          </p>
          <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span className="font-mono">{viewer.ip || "—"}</span>
            <span>{formatViewerLocationLabel(viewer.location)}</span>
          </div>
          <ul className="pt-1 space-y-0.5">
            {reasons.map((r) => (
              <li key={r} className="text-xs text-destructive flex items-center gap-1.5">
                <Flag className="h-3 w-3 shrink-0" />
                {r}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex gap-2 shrink-0">
          {onListen && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={onListen}>
              <Headphones className="h-3.5 w-3.5" />
              Listen
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              if (
                typeof window !== "undefined" &&
                window.confirm(
                  `Deactivate ${viewer.subscriberName}? They will not start or renew streams. Current audio is not interrupted.`,
                )
              ) {
                onDeactivate()
              }
            }}
          >
            Deactivate
          </Button>
        </div>
      </div>
    </div>
  )
}

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
}) {
  return (
    <div className="text-center py-12 px-4">
      <div className="flex justify-center mb-3">{icon}</div>
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  )
}

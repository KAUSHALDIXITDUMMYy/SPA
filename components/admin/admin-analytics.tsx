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
  Activity,
  Wifi,
  Headphones,
  MessageSquare,
  Crosshair,
} from "lucide-react"
import {
  getAdminAnalytics,
  getSubscriberUsage,
  type StreamAnalytics,
  type StreamViewer,
  type SubscriberUsageRow,
} from "@/lib/analytics"
import { startPoll } from "@/lib/client/poll"
import { formatViewerLocationLabel, normalizeViewerLocation } from "@/lib/viewer-location"
import { resolveUserTenant, type UserTenant } from "@/lib/tenant"
import type { UserProfile } from "@/lib/auth"
import { getUsersByRole, updateUserStatus } from "@/lib/admin"
import { useAuth } from "@/hooks/use-auth"
import { useToast } from "@/hooks/use-toast"
import { StreamChatPanel } from "@/components/ui/stream-chat-panel"
import { StreamViewer as SubscriberStreamPlayer } from "@/components/subscriber/stream-viewer"
import type { SubscriberPermission } from "@/lib/subscriber"
import type { StreamSession } from "@/lib/streaming"

/**
 * Dashboard freshness. 3s gives near-instant visibility of new joins while staying
 * cheap (the read path is already scoped to active sessions only — see analytics-data).
 */
const ADMIN_ANALYTICS_POLL_MS = 3_000

function subscriberIdFromUserRow(row: { id: string; uid?: string }): string {
  return row.uid || row.id
}

function subscriberVisibleToAdmin(
  subscriberId: string,
  subscriberTenant: UserTenant | undefined,
  admin: UserProfile,
  allowedSubscriberIds: Set<string>,
): boolean {
  const adminScope = resolveUserTenant(admin)
  if (subscriberTenant === "kevionics" || subscriberTenant === "default") {
    return subscriberTenant === adminScope
  }
  return allowedSubscriberIds.has(subscriberId)
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

/** Synthetic permission so admin can join Agora as audience (same path as subscribers). */
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

/** Extended viewer row with server-captured context + computed flags. */
type EnrichedViewer = StreamViewer & {
  ip?: string
  deviceClass?: "mobile" | "tablet" | "desktop" | "unknown"
  origin?: string | null
  concurrentSession?: boolean
  foreignOrigin?: boolean
  staleHeartbeat?: boolean
  watchSeconds?: number
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
  const [analytics, setAnalytics] = useState<StreamAnalytics[]>([])
  const [activeViewers, setActiveViewers] = useState<EnrichedViewer[]>([])
  const [activeStreams, setActiveStreams] = useState<ActiveStreamRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [refreshing, setRefreshing] = useState(false)
  const [usage, setUsage] = useState<SubscriberUsageRow[]>([])
  const [usageWindow, setUsageWindow] = useState<30 | 7 | 90>(30)
  const [usageLoading, setUsageLoading] = useState(false)
  /** Which live stream’s chat panel is expanded (only one at a time to limit listeners). */
  const [openStreamChatId, setOpenStreamChatId] = useState<string | null>(null)
  /** Which stream the admin is preview-listening to via Agora (one at a time). */
  const [adminListeningStreamId, setAdminListeningStreamId] = useState<string | null>(null)
  /** Focused stream in the Monitor booth (chat + listen workspace). */
  const [monitorStreamId, setMonitorStreamId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("monitor")
  const { user, userProfile } = useAuth()
  const { toast } = useToast()
  const unmountRef = useRef(false)

  const fetchDashboard = useCallback(
    async (options?: { manual?: boolean }) => {
      const isManual = options?.manual === true
      if (isManual) setRefreshing(true)
      try {
        if (!userProfile || userProfile.role !== "admin") {
          if (!unmountRef.current) setLoading(false)
          return
        }

        const allowedSubscriberIds = new Set(
          (await getUsersByRole("subscriber", userProfile)).map((s) =>
            subscriberIdFromUserRow(s as { id: string; uid?: string }),
          ),
        )

        const dashboard = await getAdminAnalytics(100)
        if (unmountRef.current) return

        const viewers = dashboard.activeViewers
          .map((v: any) => ({
            ...v,
            location: normalizeViewerLocation(v.location ?? v.geo),
          }))
          .filter((v: any) =>
            subscriberVisibleToAdmin(v.subscriberId, v.subscriberTenant, userProfile, allowedSubscriberIds),
          ) as EnrichedViewer[]

        const streams = (dashboard.activeStreams as any[]).map((s) => ({
          ...s,
          createdAt: s.createdAt ? new Date(s.createdAt) : new Date(),
        })) as ActiveStreamRow[]

        const analyticsData = dashboard.analytics.filter((a: StreamAnalytics) =>
          allowedSubscriberIds.has(a.subscriberId),
        ) as StreamAnalytics[]

        setActiveViewers(viewers)
        setActiveStreams(streams)
        setAnalytics(analyticsData)
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
        if (!unmountRef.current) setUsage(rows)
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
      const key = `${viewer.streamSessionId}:${viewer.subscriberId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [activeViewers, activeStreams])

  /** Rows that carry a restream / account-sharing signal (review-only; never auto-acted). */
  const flaggedViewers = useMemo(
    () => validActiveViewers.filter((v) => v.concurrentSession || v.foreignOrigin),
    [validActiveViewers],
  )

  const mobileCount = validActiveViewers.filter((v) => v.deviceClass === "mobile").length

  /** Keep monitor focus on a live stream; auto-pick newest when empty. */
  useEffect(() => {
    if (activeStreams.length === 0) {
      setMonitorStreamId(null)
      return
    }
    if (monitorStreamId && activeStreams.some((s) => s.id === monitorStreamId)) return
    setMonitorStreamId(activeStreams[0].id)
  }, [activeStreams, monitorStreamId])

  /** Stop preview listen if that stream is no longer active. */
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

  const openMonitor = useCallback((streamId: string, opts?: { listen?: boolean; chat?: boolean }) => {
    setMonitorStreamId(streamId)
    setActiveTab("monitor")
    if (opts?.listen) setAdminListeningStreamId(streamId)
    if (opts?.chat) setOpenStreamChatId(streamId)
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

  return (
    <div className="space-y-4 sm:space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h2 className="text-xl sm:text-2xl font-bold">Ops Console</h2>
            <div className="flex flex-shrink-0 items-center gap-2 rounded-full border border-green-200/80 bg-muted/50 px-2 py-1 sm:px-3 sm:py-1.5 dark:border-green-800">
              <Radio
                className={`h-3 w-3 sm:h-3.5 sm:w-3.5 text-green-600 dark:text-green-400 ${
                  validActiveViewers.length > 0 || activeStreams.length > 0 ? "animate-pulse" : ""
                }`}
              />
              <span className="text-xs font-semibold text-green-700 dark:text-green-300 whitespace-nowrap">
                {activeStreams.length > 0 ? "ON AIR" : "IDLE"}
              </span>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Monitor audio &amp; chat, track every join with IP/device, review restream signals, and export usage.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 w-full gap-2 sm:h-9 sm:w-auto"
            disabled={refreshing}
            onClick={() => void fetchDashboard({ manual: true })}
          >
            <RefreshCw className={`h-4 w-4 shrink-0 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <div className="flex items-center justify-between gap-3 border-t border-border pt-2 sm:border-t-0 sm:pt-0">
            <div className="text-left sm:text-right">
              <p className="text-xs text-muted-foreground">Last update</p>
              <p className="text-xs sm:text-sm font-medium">{lastUpdated.toLocaleTimeString()}</p>
            </div>
            <Wifi className="h-4 w-4 shrink-0 sm:h-5 sm:w-5 text-green-600 dark:text-green-400 animate-pulse" />
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <SummaryCard
          label="Watching now"
          value={validActiveViewers.length}
          icon={<Eye className="h-5 w-5 text-white" />}
          accent="bg-emerald-600 dark:bg-emerald-500"
          pulse={validActiveViewers.length > 0}
        />
        <SummaryCard
          label="Live streams"
          value={activeStreams.length}
          icon={<Play className="h-5 w-5 text-white" />}
          accent="bg-violet-600 dark:bg-violet-500"
          pulse={activeStreams.length > 0}
        />
        <SummaryCard
          label="Mobile / Desktop"
          value={`${mobileCount} / ${Math.max(0, validActiveViewers.length - mobileCount)}`}
          icon={<Smartphone className="h-5 w-5 text-white" />}
          accent="bg-sky-600 dark:bg-sky-500"
        />
        <SummaryCard
          label="Restream signals"
          value={flaggedViewers.length}
          icon={<ShieldAlert className="h-5 w-5 text-white" />}
          accent={flaggedViewers.length > 0 ? "bg-rose-600 dark:bg-rose-500" : "bg-zinc-500"}
          pulse={flaggedViewers.length > 0}
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <TabsList className="w-full min-w-max sm:w-auto h-auto">
            <TabsTrigger value="monitor" className="py-2 sm:py-1.5 text-xs sm:text-sm whitespace-nowrap">
              <Crosshair className="h-3.5 w-3.5 sm:mr-2 inline" />
              <span className="hidden sm:inline">Monitor Booth</span>
              <span className="sm:hidden">Monitor</span>
              {activeStreams.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-[10px]">
                  {activeStreams.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="viewers" className="py-2 sm:py-1.5 text-xs sm:text-sm whitespace-nowrap">
              <Eye className="h-3.5 w-3.5 sm:mr-2 inline" />
              <span className="hidden sm:inline">Live Viewers</span>
              <span className="sm:hidden">Viewers</span>
              <Badge variant="secondary" className="ml-2 text-[10px]">
                {validActiveViewers.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="signals" className="py-2 sm:py-1.5 text-xs sm:text-sm whitespace-nowrap">
              <ShieldAlert className="h-3.5 w-3.5 sm:mr-2 inline" />
              <span className="hidden sm:inline">Restream Signals</span>
              <span className="sm:hidden">Signals</span>
              {flaggedViewers.length > 0 && (
                <Badge variant="destructive" className="ml-2 text-[10px]">
                  {flaggedViewers.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="usage" className="py-2 sm:py-1.5 text-xs sm:text-sm whitespace-nowrap">
              <TrendingUp className="h-3.5 w-3.5 sm:mr-2 inline" />
              <span className="hidden sm:inline">Usage &amp; Billing</span>
              <span className="sm:hidden">Usage</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── Monitor Booth ────────────────────────────────────────────── */}
        <TabsContent value="monitor" className="space-y-4">
          {activeStreams.length === 0 ? (
            <Card>
              <CardContent className="py-16">
                <EmptyState
                  icon={<Headphones className="h-16 w-16 text-muted-foreground/35" />}
                  title="No live streams to monitor"
                  subtitle="When a publisher goes live, pick the stream here to listen and open chat."
                />
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)] gap-4">
              {/* Stream picker rail */}
              <Card className="xl:sticky xl:top-4 h-fit border-violet-200/70 dark:border-violet-900">
                <CardHeader className="border-b bg-gradient-to-br from-violet-50/80 to-transparent dark:from-violet-950/30 p-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Radio className="h-4 w-4 text-violet-600" />
                    On air
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Select a call — listen &amp; chat open in the booth.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-2">
                  <ScrollArea className="max-h-[320px] xl:max-h-[520px]">
                    <div className="space-y-1.5 p-1">
                      {activeStreams.map((stream) => {
                        const viewersCount = validActiveViewers.filter(
                          (v) => v.streamSessionId === stream.id,
                        ).length
                        const selected = monitorStreamId === stream.id
                        const listening = adminListeningStreamId === stream.id
                        const duration = Math.floor(
                          (Date.now() - (stream.createdAt ? stream.createdAt.getTime() : Date.now())) /
                            1000,
                        )
                        return (
                          <button
                            key={stream.id}
                            type="button"
                            onClick={() => openMonitor(stream.id)}
                            className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                              selected
                                ? "border-violet-400 bg-violet-50 dark:bg-violet-950/40 dark:border-violet-700"
                                : "border-transparent hover:bg-muted/60"
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="destructive" className="animate-pulse text-[10px] px-1.5 py-0">
                                LIVE
                              </Badge>
                              {listening && (
                                <Badge className="text-[10px] px-1.5 py-0 gap-1 bg-emerald-600">
                                  <Headphones className="h-2.5 w-2.5" />
                                  ear
                                </Badge>
                              )}
                            </div>
                            <p className="font-semibold text-sm truncate">
                              {stream.title || "Untitled stream"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {stream.publisherName}
                            </p>
                            <div className="flex gap-3 mt-1.5 text-[11px] text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Eye className="h-3 w-3" />
                                {viewersCount}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDuration(duration)}
                              </span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Booth workspace */}
              <div className="space-y-4 min-w-0">
                {monitorStream && user ? (
                  <>
                    <Card className="overflow-hidden border-violet-200/80 dark:border-violet-900">
                      <div className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 px-4 py-3 text-white">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[11px] uppercase tracking-wider text-white/80">
                              Monitoring booth
                            </p>
                            <h3 className="font-semibold text-lg truncate">
                              {monitorStream.title || "Untitled stream"}
                            </h3>
                            <p className="text-sm text-white/85 truncate">
                              {monitorStream.publisherName}
                              {monitorStream.sport ? ` · ${monitorStream.sport}` : ""}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant={adminListeningStreamId === monitorStream.id ? "secondary" : "outline"}
                              className={
                                adminListeningStreamId === monitorStream.id
                                  ? "bg-white text-violet-900 hover:bg-white/90"
                                  : "bg-white/10 border-white/40 text-white hover:bg-white/20"
                              }
                              onClick={() =>
                                setAdminListeningStreamId((prev) =>
                                  prev === monitorStream.id ? null : monitorStream.id,
                                )
                              }
                            >
                              <Headphones className="h-3.5 w-3.5 mr-1.5" />
                              {adminListeningStreamId === monitorStream.id
                                ? "Stop listening"
                                : "Listen to audio"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="bg-white/10 border-white/40 text-white hover:bg-white/20"
                              onClick={() =>
                                setOpenStreamChatId((prev) =>
                                  prev === monitorStream.id ? null : monitorStream.id,
                                )
                              }
                            >
                              <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                              {openStreamChatId === monitorStream.id ? "Hide chat" : "Show chat"}
                            </Button>
                          </div>
                        </div>
                      </div>
                      <CardContent className="p-4 sm:p-5 space-y-4">
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {
                              validActiveViewers.filter((v) => v.streamSessionId === monitorStream.id)
                                .length
                            }{" "}
                            watching
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            live{" "}
                            {formatDuration(
                              Math.floor(
                                (Date.now() -
                                  (monitorStream.createdAt
                                    ? monitorStream.createdAt.getTime()
                                    : Date.now())) /
                                  1000,
                              ),
                            )}
                          </span>
                          <span>
                            started {monitorStream.createdAt.toLocaleTimeString()}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {/* Audio preview */}
                          <div className="rounded-xl border border-border bg-muted/30 p-3 sm:p-4 min-h-[140px]">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                                <Headphones className="h-3.5 w-3.5" />
                                Audio preview
                              </p>
                              {adminListeningStreamId === monitorStream.id ? (
                                <Badge className="bg-emerald-600 text-[10px]">Connected</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px]">
                                  Idle
                                </Badge>
                              )}
                            </div>
                            {adminListeningStreamId === monitorStream.id ? (
                              <div>
                                <p className="text-[11px] text-muted-foreground mb-2">
                                  Same Agora channel as subscribers — not counted in viewer analytics.
                                </p>
                                <SubscriberStreamPlayer
                                  key={monitorStream.id}
                                  permission={activeStreamToAdminListenPermission(
                                    monitorStream,
                                    user.uid,
                                  )}
                                  layout="mobileInline"
                                  autoJoin
                                  skipActivityAnalytics
                                />
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center py-8 text-center">
                                <Headphones className="h-8 w-8 text-muted-foreground/40 mb-2" />
                                <p className="text-sm text-muted-foreground">
                                  Press <span className="font-medium text-foreground">Listen to audio</span>{" "}
                                  to hear this call.
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Chat */}
                          <div className="rounded-xl border border-border bg-muted/30 p-3 sm:p-4 min-h-[140px]">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                                <MessageSquare className="h-3.5 w-3.5" />
                                Live chat
                              </p>
                              {openStreamChatId === monitorStream.id ? (
                                <Badge className="bg-sky-600 text-[10px]">Open</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px]">
                                  Closed
                                </Badge>
                              )}
                            </div>
                            {openStreamChatId === monitorStream.id ? (
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
                                messageListClassName="h-[280px]"
                                chatHistoryLimit={500}
                              />
                            ) : (
                              <div className="flex flex-col items-center justify-center py-8 text-center">
                                <MessageSquare className="h-8 w-8 text-muted-foreground/40 mb-2" />
                                <p className="text-sm text-muted-foreground">
                                  Press <span className="font-medium text-foreground">Show chat</span> to
                                  read and moderate messages.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Viewers on this stream */}
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                            Viewers on this stream
                          </p>
                          {(() => {
                            const onStream = validActiveViewers.filter(
                              (v) => v.streamSessionId === monitorStream.id,
                            )
                            if (onStream.length === 0) {
                              return (
                                <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg border-dashed">
                                  No subscribers watching this call yet.
                                </p>
                              )
                            }
                            return (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {onStream.map((viewer) => (
                                  <ViewerCard
                                    key={`${viewer.id}-${viewer.streamSessionId}`}
                                    viewer={viewer}
                                    compact
                                  />
                                ))}
                              </div>
                            )
                          })()}
                        </div>
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <Card>
                    <CardContent className="py-12">
                      <EmptyState
                        icon={<Crosshair className="h-16 w-16 text-muted-foreground/35" />}
                        title="Select a live stream"
                        subtitle={!user ? "Sign in as admin to listen and chat." : "Pick a call from the rail."}
                      />
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Live Viewers ─────────────────────────────────────────────── */}
        <TabsContent value="viewers" className="space-y-4">
          <Card>
            <CardHeader className="border-b bg-muted/40 p-4 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600" />
                    Who is watching now
                  </CardTitle>
                  <CardDescription className="mt-1 text-xs sm:text-sm">
                    IP, device &amp; approximate location captured when each viewer joined.
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 text-xs whitespace-nowrap"
                >
                  {validActiveViewers.length} live
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
              {validActiveViewers.length > 0 ? (
                <ScrollArea className="h-[460px] pr-2 sm:pr-4">
                  <div className="space-y-3">
                    {validActiveViewers.map((viewer) => (
                      <ViewerCard
                        key={`${viewer.id}-${viewer.streamSessionId}`}
                        viewer={viewer}
                        onMonitor={
                          activeStreams.some((s) => s.id === viewer.streamSessionId)
                            ? () => openMonitor(viewer.streamSessionId, { listen: true })
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <EmptyState
                  icon={<Eye className="h-16 w-16 text-muted-foreground/35" />}
                  title="No active viewers"
                  subtitle="Viewers appear here the instant they join a stream."
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b bg-muted/40 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Radio className="h-4 w-4 sm:h-5 sm:w-5 text-violet-600" />
                    Live streams
                  </CardTitle>
                  <CardDescription className="mt-1 text-xs sm:text-sm">
                    Quick actions — open the Monitor Booth to listen and chat.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs w-fit">
                  {activeStreams.length} live
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
              {activeStreams.length > 0 ? (
                <div className="space-y-3">
                  {activeStreams.map((stream) => {
                    const viewersCount = validActiveViewers.filter(
                      (v) => v.streamSessionId === stream.id,
                    ).length
                    const duration = Math.floor(
                      (Date.now() - (stream.createdAt ? stream.createdAt.getTime() : Date.now())) /
                        1000,
                    )
                    const listeningHere = adminListeningStreamId === stream.id
                    const chatOpen = openStreamChatId === stream.id
                    return (
                      <div
                        key={stream.id}
                        className="rounded-lg border border-violet-200/80 dark:border-violet-900 bg-card p-3 sm:p-4 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <Badge variant="destructive" className="animate-pulse text-xs">
                              <Radio className="h-3 w-3 mr-1" /> LIVE
                            </Badge>
                            <p className="font-semibold text-sm sm:text-base mt-2 break-words">
                              {stream.title || "Untitled stream"}
                            </p>
                            <p className="text-xs sm:text-sm text-muted-foreground truncate">
                              by {stream.publisherName}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-violet-100 dark:border-violet-900 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" /> {viewersCount} watching
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {formatDuration(duration)}
                          </span>
                        </div>
                        <div className="flex flex-col xs:flex-row flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="gap-2"
                            onClick={() => openMonitor(stream.id, { listen: true, chat: true })}
                          >
                            <Crosshair className="h-3.5 w-3.5" />
                            Open booth
                          </Button>
                          <Button
                            type="button"
                            variant={listeningHere ? "default" : "outline"}
                            size="sm"
                            className="gap-2"
                            disabled={!user}
                            onClick={() => {
                              setAdminListeningStreamId((prev) =>
                                prev === stream.id ? null : stream.id,
                              )
                              setMonitorStreamId(stream.id)
                              setActiveTab("monitor")
                            }}
                          >
                            <Headphones className="h-3.5 w-3.5" />
                            {listeningHere ? "Stop listening" : "Listen"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            disabled={!user}
                            onClick={() => {
                              setOpenStreamChatId((prev) => (prev === stream.id ? null : stream.id))
                              setMonitorStreamId(stream.id)
                              setActiveTab("monitor")
                            }}
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            {chatOpen ? "Hide chat" : "Chat"}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={<Play className="h-16 w-16 text-muted-foreground/35" />}
                  title="No live streams"
                  subtitle="Streams appear here when publishers go live."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Restream Signals ─────────────────────────────────────────── */}
        <TabsContent value="signals" className="space-y-4">
          <Card>
            <CardHeader className="border-b bg-muted/40 p-4 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <ShieldAlert className="h-4 w-4 sm:h-5 sm:w-5 text-rose-600" />
                Restream &amp; account-sharing signals
              </CardTitle>
              <CardDescription className="mt-1 text-xs sm:text-sm">
                Concurrent streams, foreign origins, and multi-device usage per viewer. Review and
                de-activate manually — no automatic action is ever taken.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
              {flaggedViewers.length > 0 ? (
                <ScrollArea className="h-[460px] pr-2 sm:pr-4">
                  <div className="space-y-3">
                    {flaggedViewers.map((viewer) => (
                      <FlaggedViewerRow
                        key={`flag-${viewer.id}-${viewer.streamSessionId}`}
                        viewer={viewer}
                        onDeactivate={() =>
                          handleDeactivate(viewer.subscriberId, viewer.subscriberName)
                        }
                        onMonitor={
                          activeStreams.some((s) => s.id === viewer.streamSessionId)
                            ? () => openMonitor(viewer.streamSessionId, { listen: true })
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <EmptyState
                  icon={<ShieldAlert className="h-16 w-16 text-emerald-500/40" />}
                  title="No suspicious signals"
                  subtitle="No concurrent streams or foreign-origin viewers detected right now."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Usage & Billing ──────────────────────────────────────────── */}
        <TabsContent value="usage" className="space-y-4">
          <Card>
            <CardHeader className="border-b bg-muted/40 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-sky-600" />
                    Subscriber usage
                  </CardTitle>
                  <CardDescription className="mt-1 text-xs sm:text-sm">
                    Per-subscriber stream access over the selected window. Usage-report basis for
                    billing.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-md border border-border overflow-hidden">
                    {([7, 30, 90] as const).map((w) => (
                      <button
                        key={w}
                        onClick={() => setUsageWindow(w)}
                        className={`px-3 py-1.5 text-xs font-medium ${
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
                    <span className="hidden sm:inline">Export CSV</span>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
              {usageLoading && usage.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </div>
              ) : usage.length === 0 ? (
                <EmptyState
                  icon={<TrendingUp className="h-16 w-16 text-muted-foreground/35" />}
                  title="No usage recorded"
                  subtitle="Stream access will be tracked here as subscribers join streams."
                />
              ) : (
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <div className="inline-block min-w-full align-middle px-4 sm:px-0">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="py-2 pr-3 font-medium">Subscriber</th>
                          <th className="py-2 pr-3 font-medium text-right">Streams</th>
                          <th className="py-2 pr-3 font-medium text-right">Unique</th>
                          <th className="py-2 pr-3 font-medium hidden md:table-cell">Publishers</th>
                          <th className="py-2 pr-3 font-medium hidden lg:table-cell">IPs</th>
                          <th className="py-2 pr-3 font-medium hidden lg:table-cell">Devices</th>
                          <th className="py-2 font-medium hidden md:table-cell">Last seen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usage.map((row) => (
                          <tr key={row.subscriberId} className="border-b last:border-0">
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
                            <td className="py-3 pr-3 hidden lg:table-cell text-xs text-muted-foreground">
                              {row.recentDevices.length ? row.recentDevices.join(", ") : "—"}
                            </td>
                            <td className="py-3 hidden md:table-cell text-xs text-muted-foreground whitespace-nowrap">
                              {row.lastSeen ? new Date(row.lastSeen).toLocaleString() : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Sticky listening dock */}
      {listeningStream && user && activeTab !== "monitor" && (
        <div className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-xl">
          <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-background/95 backdrop-blur shadow-lg px-4 py-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white shrink-0">
              <Headphones className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Listening now</p>
              <p className="text-sm font-medium truncate">
                {listeningStream.title || "Untitled"} · {listeningStream.publisherName}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => openMonitor(listeningStream.id)}
              className="shrink-0"
            >
              Booth
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setAdminListeningStreamId(null)}
              className="shrink-0"
            >
              Stop
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon,
  accent,
  pulse,
}: {
  label: string
  value: string | number
  icon: React.ReactNode
  accent: string
  pulse?: boolean
}) {
  return (
    <Card className="border bg-card">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">{label}</p>
            <p className="text-xl sm:text-3xl font-bold mt-1 truncate">{value}</p>
          </div>
          <div className={`p-2 sm:p-3 rounded-full ${accent} ${pulse ? "animate-pulse" : ""} shrink-0`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ViewerCard({
  viewer,
  compact,
  onMonitor,
}: {
  viewer: EnrichedViewer
  compact?: boolean
  onMonitor?: () => void
}) {
  const DeviceIcon = DEVICE_ICON[viewer.deviceClass || "unknown"] || Globe
  const watchSeconds =
    viewer.watchSeconds ??
    Math.max(0, Math.floor((Date.now() - new Date(viewer.joinedAt).getTime()) / 1000))
  const host = hostFromOrigin(viewer.origin)
  const flagged = viewer.concurrentSession || viewer.foreignOrigin

  return (
    <div
      className={`group relative rounded-lg border bg-card p-3 sm:p-4 transition-colors ${
        flagged
          ? "border-rose-300 dark:border-rose-900"
          : "border-emerald-200/80 dark:border-emerald-900 hover:bg-muted/50"
      } ${compact ? "p-2.5 sm:p-3" : ""}`}
    >
      <div className="absolute top-2 right-2 flex items-center gap-1">
        {flagged && (
          <Badge variant="destructive" className="text-[10px] gap-0.5">
            <Flag className="h-2.5 w-2.5" />
            {viewer.concurrentSession ? "concurrent" : "foreign"}
          </Badge>
        )}
        <div
          className={`w-2.5 h-2.5 rounded-full ${
            viewer.staleHeartbeat ? "bg-amber-500" : "bg-emerald-500"
          } animate-pulse shadow-lg shadow-emerald-500/50`}
          title={viewer.staleHeartbeat ? "Heartbeat stale" : "Heartbeat fresh"}
        />
      </div>

      <div className={`space-y-2 ${compact ? "pr-10" : "pr-16"}`}>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
          <p className="font-semibold text-sm sm:text-base truncate">{viewer.subscriberName}</p>
          <DeviceIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-auto" />
        </div>

        {!compact && (
          <div className="flex items-center gap-2">
            <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <p className="text-xs sm:text-sm text-violet-700 dark:text-violet-300 truncate">
              {viewer.publisherName}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Globe className="h-3 w-3 shrink-0" />
            <span className="font-mono truncate" title={viewer.ip}>
              {viewer.ip || "—"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{formatViewerLocationLabel(viewer.location)}</span>
          </div>
          {!compact && host && (
            <div className="flex items-center gap-1.5">
              <Radio className="h-3 w-3 shrink-0" />
              <span className="truncate" title={viewer.origin || ""}>
                {host}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 shrink-0" />
            <span>{formatDuration(watchSeconds)} elapsed</span>
          </div>
        </div>

        {onMonitor && (
          <Button type="button" variant="outline" size="sm" className="mt-1 gap-1.5 h-8" onClick={onMonitor}>
            <Headphones className="h-3 w-3" />
            Monitor this stream
          </Button>
        )}
      </div>
    </div>
  )
}

function FlaggedViewerRow({
  viewer,
  onDeactivate,
  onMonitor,
}: {
  viewer: EnrichedViewer
  onDeactivate: () => void
  onMonitor?: () => void
}) {
  const host = hostFromOrigin(viewer.origin)
  const reasons: string[] = []
  if (viewer.concurrentSession) reasons.push("Watching more than one stream concurrently")
  if (viewer.foreignOrigin)
    reasons.push(`Origin is a foreign/clone host${host ? ` (${host})` : ""}`)

  return (
    <div className="rounded-lg border border-rose-300 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 p-3 sm:p-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
            <p className="font-semibold text-sm sm:text-base truncate">{viewer.subscriberName}</p>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            watching <span className="text-foreground font-medium">{viewer.publisherName}</span>
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground pt-1">
            <span className="font-mono">{viewer.ip || "—"}</span>
            <span>{formatViewerLocationLabel(viewer.location)}</span>
            <span className="capitalize">{viewer.deviceClass || "unknown"} device</span>
            {host && <span className="text-rose-600 dark:text-rose-400">{host}</span>}
          </div>
          <ul className="pt-2 space-y-0.5">
            {reasons.map((r) => (
              <li
                key={r}
                className="text-xs text-rose-700 dark:text-rose-300 flex items-start gap-1.5"
              >
                <Flag className="h-3 w-3 mt-0.5 shrink-0" />
                {r}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          {onMonitor && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={onMonitor}>
              <Headphones className="h-3.5 w-3.5" />
              Listen
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              if (typeof window !== "undefined") {
                if (
                  window.confirm(
                    `Deactivate ${viewer.subscriberName}? They will not be able to start or renew streams. Current audio is not interrupted.`,
                  )
                ) {
                  onDeactivate()
                }
              }
            }}
          >
            De-activate
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
    <div className="text-center text-muted-foreground py-16">
      <div className="flex justify-center mb-4">{icon}</div>
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm">{subtitle}</p>
    </div>
  )
}

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
  const { userProfile } = useAuth()
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
  const foreignCount = validActiveViewers.filter((v) => v.foreignOrigin).length

  const handleDeactivate = useCallback(
    async (subscriberId: string, name: string) => {
      if (!userProfile) return
      try {
        await updateUserStatus(subscriberId, false)
        toast({
          title: "Subscriber deactivated",
          description: `${name} can no longer start or renew streams. Active audio is not cut.`,
        })
        // refresh immediately so the flag clears from Restream Signals
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
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h2 className="text-xl sm:text-2xl font-bold">Live Analytics</h2>
            <div className="flex flex-shrink-0 items-center gap-2 rounded-full border border-green-200/80 bg-muted/50 px-2 py-1 sm:px-3 sm:py-1.5 dark:border-green-800">
              <Radio
                className={`h-3 w-3 sm:h-3.5 sm:w-3.5 text-green-600 dark:text-green-400 ${
                  validActiveViewers.length > 0 ? "animate-pulse" : ""
                }`}
              />
              <span className="text-xs font-semibold text-green-700 dark:text-green-300 whitespace-nowrap">
                {validActiveViewers.length > 0 ? "LIVE" : "IDLE"}
              </span>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Each viewer tracked instantly with IP, device &amp; location. Refreshes every{" "}
            {ADMIN_ANALYTICS_POLL_MS / 1000}s.
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
          accent="bg-green-600 dark:bg-green-500"
          pulse={validActiveViewers.length > 0}
        />
        <SummaryCard
          label="Live streams"
          value={activeStreams.length}
          icon={<Play className="h-5 w-5 text-white" />}
          accent="bg-purple-600 dark:bg-purple-500"
          pulse={activeStreams.length > 0}
        />
        <SummaryCard
          label="Mobile / Desktop"
          value={`${mobileCount} / ${validActiveViewers.length - mobileCount}`}
          icon={<Smartphone className="h-5 w-5 text-white" />}
          accent="bg-blue-600 dark:bg-blue-500"
        />
        <SummaryCard
          label="Foreign-origin signals"
          value={flaggedViewers.length}
          icon={<ShieldAlert className="h-5 w-5 text-white" />}
          accent={flaggedViewers.length > 0 ? "bg-red-600 dark:bg-red-500" : "bg-zinc-500"}
          pulse={flaggedViewers.length > 0}
        />
      </div>

      <Tabs defaultValue="viewers" className="space-y-4">
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <TabsList className="w-full min-w-max sm:w-auto h-auto">
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

        {/* ── Live Viewers ─────────────────────────────────────────────── */}
        <TabsContent value="viewers" className="space-y-4">
          <Card>
            <CardHeader className="border-b bg-muted/40 p-4 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
                    Who is watching now
                  </CardTitle>
                  <CardDescription className="mt-1 text-xs sm:text-sm">
                    IP, device &amp; approximate location captured when each viewer joined.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700 text-xs whitespace-nowrap">
                  {validActiveViewers.length} live
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
              {validActiveViewers.length > 0 ? (
                <ScrollArea className="h-[460px] pr-2 sm:pr-4">
                  <div className="space-y-3">
                    {validActiveViewers.map((viewer) => (
                      <ViewerCard key={`${viewer.id}-${viewer.streamSessionId}`} viewer={viewer} />
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
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Radio className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
                Live streams
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
              {activeStreams.length > 0 ? (
                <div className="space-y-3">
                  {activeStreams.map((stream) => {
                    const viewersCount = validActiveViewers.filter(
                      (v) => v.streamSessionId === stream.id,
                    ).length
                    const duration = Math.floor(
                      (Date.now() - (stream.createdAt ? stream.createdAt.getTime() : Date.now())) / 1000,
                    )
                    return (
                      <div
                        key={stream.id}
                        className="rounded-lg border border-purple-200/80 dark:border-purple-900 bg-card p-3 sm:p-4"
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
                        <div className="flex flex-wrap items-center gap-3 pt-2 mt-2 border-t border-purple-100 dark:border-purple-900 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" /> {viewersCount} watching
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {formatDuration(duration)}
                          </span>
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
                <ShieldAlert className="h-4 w-4 sm:h-5 sm:w-5 text-red-600" />
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
                        onDeactivate={() => handleDeactivate(viewer.subscriberId, viewer.subscriberName)}
                      />
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <EmptyState
                  icon={<ShieldAlert className="h-16 w-16 text-green-500/40" />}
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
                    <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                    Subscriber usage
                  </CardTitle>
                  <CardDescription className="mt-1 text-xs sm:text-sm">
                    Per-subscriber stream access over the selected window. Usage-report basis for billing.
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

function ViewerCard({ viewer }: { viewer: EnrichedViewer }) {
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
          ? "border-red-300 dark:border-red-900"
          : "border-green-200/80 dark:border-green-900 hover:bg-muted/50"
      }`}
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
            viewer.staleHeartbeat ? "bg-amber-500" : "bg-green-500"
          } animate-pulse shadow-lg shadow-green-500/50`}
          title={viewer.staleHeartbeat ? "Heartbeat stale" : "Heartbeat fresh"}
        />
      </div>

      <div className="space-y-2 pr-16">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <p className="font-semibold text-sm sm:text-base truncate">{viewer.subscriberName}</p>
          <DeviceIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-auto" />
        </div>

        <div className="flex items-center gap-2">
          <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <p className="text-xs sm:text-sm text-purple-700 dark:text-purple-300 truncate">
            {viewer.publisherName}
          </p>
        </div>

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
          {host && (
            <div className="flex items-center gap-1.5">
              <Radio className="h-3 w-3 shrink-0" />
              <span className="truncate" title={viewer.origin || ""}>
                {host}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 shrink-0" />
            <span>started {new Date(viewer.joinedAt).toLocaleTimeString()}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3 shrink-0" />
            <span>{formatDuration(watchSeconds)} elapsed</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function FlaggedViewerRow({
  viewer,
  onDeactivate,
}: {
  viewer: EnrichedViewer
  onDeactivate: () => void
}) {
  const host = hostFromOrigin(viewer.origin)
  const reasons: string[] = []
  if (viewer.concurrentSession) reasons.push("Watching more than one stream concurrently")
  if (viewer.foreignOrigin) reasons.push(`Origin is a foreign/clone host${host ? ` (${host})` : ""}`)

  return (
    <div className="rounded-lg border border-red-300 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20 p-3 sm:p-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-600 shrink-0" />
            <p className="font-semibold text-sm sm:text-base truncate">{viewer.subscriberName}</p>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            watching <span className="text-foreground font-medium">{viewer.publisherName}</span>
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground pt-1">
            <span className="font-mono">{viewer.ip || "—"}</span>
            <span>{formatViewerLocationLabel(viewer.location)}</span>
            <span className="capitalize">{viewer.deviceClass || "unknown"} device</span>
            {host && <span className="text-red-600 dark:text-red-400">{host}</span>}
          </div>
          <ul className="pt-2 space-y-0.5">
            {reasons.map((r) => (
              <li key={r} className="text-xs text-red-700 dark:text-red-300 flex items-start gap-1.5">
                <Flag className="h-3 w-3 mt-0.5 shrink-0" />
                {r}
              </li>
            ))}
          </ul>
        </div>
        <Button
          size="sm"
          variant="destructive"
          className="shrink-0"
          onClick={() => {
            if (typeof window !== "undefined") {
              if (window.confirm(`Deactivate ${viewer.subscriberName}? They will not be able to start or renew streams. Current audio is not interrupted.`)) {
                onDeactivate()
              }
            }
          }}
        >
          De-activate
        </Button>
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

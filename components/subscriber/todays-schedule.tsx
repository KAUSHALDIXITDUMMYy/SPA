"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { getTodaysSchedule } from "@/lib/schedule"
import { startPoll } from "@/lib/client/poll"
import { Calendar, Loader2, RefreshCw } from "lucide-react"

export function TodaysSchedule() {
  const [content, setContent] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")

  const loadSchedule = useCallback(async (options?: { manual?: boolean }) => {
    const isManual = options?.manual === true
    if (isManual) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError("")
    try {
      const schedule = await getTodaysSchedule()
      setContent(schedule?.content ?? null)
      setUpdatedAt(schedule?.updatedAt ?? null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load schedule")
    } finally {
      setLoading(false)
      if (isManual) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    return startPoll(() => void loadSchedule(), 120000)
  }, [loadSchedule])

  const today = new Date()
  const dateStr = today.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).toUpperCase()

  if (loading) {
    return (
      <div className="border border-border rounded-lg p-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
        <p className="text-muted-foreground text-sm font-mono">LOADING SCHEDULE...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-lg font-bold tracking-wide uppercase">Today&apos;s Schedule</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="font-mono text-xs tracking-wider"
            onClick={() => void loadSchedule({ manual: true })}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-2" />
            RETRY
          </Button>
        </div>
        <div className="border border-destructive/30 rounded-lg p-4 bg-destructive/5">
          <p className="text-destructive text-sm font-mono">{error}</p>
        </div>
      </div>
    )
  }

  if (!content || content.trim() === "") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-mono text-lg font-bold tracking-wide uppercase">Today&apos;s Schedule</h2>
              <p className="text-[10px] font-mono text-muted-foreground tracking-wider">{dateStr}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="font-mono text-xs tracking-wider"
            disabled={refreshing}
            onClick={() => void loadSchedule({ manual: true })}
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
            REFRESH_FEED
          </Button>
        </div>
        <div className="border border-border rounded-lg p-8 text-center">
          <Calendar className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-mono">NO SCHEDULE POSTED</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Check back later or tap refresh.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Calendar className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-mono text-lg font-bold tracking-wide uppercase">Today&apos;s Schedule</h2>
            <p className="text-[10px] font-mono text-muted-foreground tracking-wider">
              {dateStr}
              {updatedAt && (
                <> // UPDATED {updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).toUpperCase()}</>
              )}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="font-mono text-xs tracking-wider"
          disabled={refreshing}
          onClick={() => void loadSchedule({ manual: true })}
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
          REFRESH_FEED
        </Button>
      </div>

      {/* Schedule content */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="bg-secondary/50 px-4 py-2 border-b border-border flex items-center justify-between">
          <span className="text-[10px] font-mono text-primary tracking-widest">STUDIO STATUS: ACTIVE</span>
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        </div>
        <div className="p-4">
          <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-foreground">
            {content}
          </pre>
        </div>
      </div>
    </div>
  )
}

"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getTodaysSchedule } from "@/lib/schedule"
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
    void loadSchedule()
    const interval = setInterval(() => void loadSchedule(), 120000)
    return () => clearInterval(interval)
  }, [loadSchedule])

  const headerActions = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-9 w-full gap-2 sm:w-auto sm:min-w-[8.5rem]"
      disabled={loading || refreshing}
      onClick={() => void loadSchedule({ manual: true })}
    >
      {refreshing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4" />
      )}
      Refresh
    </Button>
  )

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p>Loading schedule...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between space-y-0">
          <CardTitle className="text-base sm:text-lg">Today&apos;s Schedule</CardTitle>
          {headerActions}
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-destructive text-sm">{error}</p>
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => void loadSchedule({ manual: true })}>
            Try again
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!content || content.trim() === "") {
    return (
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Calendar className="h-5 w-5 shrink-0" />
            Today&apos;s Schedule
          </CardTitle>
          {headerActions}
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            No schedule has been posted for today yet. Check back later or tap Refresh.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Calendar className="h-5 w-5 shrink-0" />
            Today&apos;s Schedule
          </CardTitle>
          {updatedAt && (
            <CardDescription>
              Last updated: {updatedAt.toLocaleDateString()} at{" "}
              {updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </CardDescription>
          )}
        </div>
        {headerActions}
      </CardHeader>
      <CardContent>
        <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed bg-muted/50 rounded-lg p-4 overflow-x-auto">
          {content}
        </pre>
      </CardContent>
    </Card>
  )
}

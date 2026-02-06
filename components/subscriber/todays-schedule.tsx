"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getTodaysSchedule } from "@/lib/schedule"
import { Calendar, Loader2 } from "lucide-react"

export function TodaysSchedule() {
  const [content, setContent] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError("")
      try {
        const schedule = await getTodaysSchedule()
        setContent(schedule?.content ?? null)
        setUpdatedAt(schedule?.updatedAt ?? null)
      } catch (err: any) {
        setError(err?.message || "Failed to load schedule")
      } finally {
        setLoading(false)
      }
    }
    load()

    // Refresh every 2 minutes
    const interval = setInterval(load, 120000)
    return () => clearInterval(interval)
  }, [])

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
        <CardContent className="p-8">
          <p className="text-destructive text-sm">{error}</p>
        </CardContent>
      </Card>
    )
  }

  if (!content || content.trim() === "") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Today&apos;s Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No schedule has been posted for today yet. Check back later.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Today&apos;s Schedule
        </CardTitle>
        {updatedAt && (
          <CardDescription>
            Last updated: {updatedAt.toLocaleDateString()} at {updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed bg-muted/50 rounded-lg p-4 overflow-x-auto">
          {content}
        </pre>
      </CardContent>
    </Card>
  )
}

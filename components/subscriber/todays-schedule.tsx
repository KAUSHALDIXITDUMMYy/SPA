"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { getTodaysSchedule } from "@/lib/schedule"
import { Calendar, Loader2 } from "lucide-react"

export function TodaysScheduleViewer() {
  const [schedule, setSchedule] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError("")
      try {
        const data = await getTodaysSchedule()
        setSchedule(data?.content ?? null)
      } catch (err: any) {
        setError(err.message || "Failed to load schedule")
      } finally {
        setLoading(false)
      }
    }
    load()

    // Refresh every 60 seconds in case admin updates
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span>Loading today&apos;s schedule...</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            <CardTitle>Today&apos;s Schedule</CardTitle>
          </div>
          <CardDescription>
            Games schedule for today. Updated by your administrator.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!schedule || schedule.trim() === "" ? (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No schedule posted yet</p>
              <p className="text-sm mt-1">
                Today&apos;s schedule has not been posted. Check back later.
              </p>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm sm:text-base leading-relaxed bg-muted/50 rounded-lg p-4 sm:p-6 border">
              {schedule}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

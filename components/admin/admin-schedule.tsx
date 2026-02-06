"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { getTodaysSchedule, setTodaysSchedule } from "@/lib/schedule"
import { Calendar, Save, Loader2 } from "lucide-react"

const DEFAULT_SCHEDULE = `Sports Magic Games Schedule 
Feb 5th, 2026


🏀6:00PM Magic - Ed
🏒6:00PM Flyers - Kyle
🏀7:00PM Rockets - Ron
🏀7:30PM Mavs - Brett (TBD)
🏀9:00PM Lakers (TBD)
🏒9:00PM Golden Knights - Shaun`

export function AdminSchedule() {
  const [content, setContent] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError("")
      try {
        const schedule = await getTodaysSchedule()
        setContent(schedule?.content ?? DEFAULT_SCHEDULE)
      } catch (err: any) {
        setError(err?.message || "Failed to load schedule")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError("")
    setSuccess("")
    try {
      const result = await setTodaysSchedule(content)
      if (result.success) {
        setSuccess("Today's schedule saved successfully!")
      } else {
        setError(result.error || "Failed to save")
      }
    } catch (err: any) {
      setError(err?.message || "Failed to save schedule")
    } finally {
      setSaving(false)
    }
  }

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Today&apos;s Schedule
        </CardTitle>
        <CardDescription>
          Upload or edit today&apos;s Sports Magic Games schedule. Subscribers will see this on their dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <label htmlFor="schedule-content" className="text-sm font-medium">
            Schedule (text format)
          </label>
          <Textarea
            id="schedule-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste or type the schedule..."
            rows={14}
            className="font-mono text-sm resize-y min-h-[280px]"
          />
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Today&apos;s Schedule
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}

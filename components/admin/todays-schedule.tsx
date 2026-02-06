"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import {
  getTodaysSchedule,
  updateTodaysSchedule,
  type DailySchedule,
} from "@/lib/schedule"
import { useAuth } from "@/hooks/use-auth"
import { Calendar, Loader2, Save } from "lucide-react"
import { toast } from "@/hooks/use-toast"

const DEFAULT_SCHEDULE_TEMPLATE = `Sports Magic Games Schedule 
Feb 5th, 2026


🏀6:00PM Magic - Ed
🏒6:00PM Flyers - Kyle
🏀7:00PM Rockets - Ron
🏀7:30PM Mavs - Brett (TBD)
🏀9:00PM Lakers (TBD)
🏒9:00PM Golden Knights - Shaun`

export function TodaysScheduleAdmin() {
  const { user } = useAuth()
  const [schedule, setSchedule] = useState<DailySchedule | null>(null)
  const [content, setContent] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError("")
      try {
        const data = await getTodaysSchedule()
        setSchedule(data)
        setContent(data?.content ?? "")
      } catch (err: any) {
        setError(err.message || "Failed to load schedule")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError("")
    try {
      const result = await updateTodaysSchedule(content, user?.uid)
      if (result.success) {
        toast({
          title: "Schedule Saved",
          description: "Today's schedule has been updated. Subscribers can now see it.",
        })
        setSchedule({ content, date: new Date().toISOString().split("T")[0], updatedAt: new Date() })
      } else {
        setError(result.error || "Failed to save")
        toast({
          title: "Error",
          description: result.error || "Failed to save schedule",
          variant: "destructive",
        })
      }
    } catch (err: any) {
      setError(err.message || "Failed to save")
      toast({
        title: "Error",
        description: err.message || "Failed to save schedule",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const formatDate = (d: Date) => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const day = d.getDate()
    const suffix = day === 1 || day === 21 || day === 31 ? "st" : day === 2 || day === 22 ? "nd" : day === 3 || day === 23 ? "rd" : "th"
    return `${months[d.getMonth()]} ${day}${suffix}, ${d.getFullYear()}`
  }

  const todayFormatted = formatDate(new Date())

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span>Loading schedule...</span>
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
            Post today&apos;s games schedule. All subscribers will see this on their dashboard. Use the text format below (emojis supported).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="schedule-content">Schedule (plain text)</Label>
            <Textarea
              id="schedule-content"
              placeholder={DEFAULT_SCHEDULE_TEMPLATE}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={14}
              className="font-mono text-sm whitespace-pre-wrap"
            />
            <p className="text-xs text-muted-foreground">
              Date shown to subscribers: {todayFormatted}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSave} disabled={saving}>
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
            <Button
              variant="outline"
              onClick={() => setContent(DEFAULT_SCHEDULE_TEMPLATE)}
            >
              Load Example
            </Button>
          </div>

          {schedule?.updatedAt && (
            <p className="text-xs text-muted-foreground">
              Last updated: {new Date(schedule.updatedAt).toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

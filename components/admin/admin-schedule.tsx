"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { getTodaysSchedule, setTodaysSchedule, getDecoySchedule, setDecoySchedule } from "@/lib/schedule"
import { Calendar, Save, Loader2, EyeOff } from "lucide-react"

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
  const [decoyContent, setDecoyContent] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingDecoy, setSavingDecoy] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError("")
      try {
        const [schedule, decoy] = await Promise.all([getTodaysSchedule(), getDecoySchedule()])
        setContent(schedule?.content ?? DEFAULT_SCHEDULE)
        setDecoyContent(decoy?.content ?? "")
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
        setSuccess("Real schedule saved (your apps only).")
      } else {
        setError(result.error || "Failed to save")
      }
    } catch (err: any) {
      setError(err?.message || "Failed to save schedule")
    } finally {
      setSaving(false)
    }
  }

  const handleSaveDecoy = async () => {
    setSavingDecoy(true)
    setError("")
    setSuccess("")
    try {
      const result = await setDecoySchedule(decoyContent)
      if (result.success) {
        setSuccess("Decoy schedule published to legacy dailySchedule (clone sites sync this).")
      } else {
        setError(result.error || "Failed to save decoy schedule")
      }
    } catch (err: any) {
      setError(err?.message || "Failed to save decoy schedule")
    } finally {
      setSavingDecoy(false)
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Real schedule (your apps)
          </CardTitle>
          <CardDescription>
            Saved to <code className="text-xs">sm_sched_v7</code>. Subscribers on Sportsmagician Audio, Android, and iOS
            see this.
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

          <Textarea
            id="schedule-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste or type the real schedule..."
            rows={14}
            className="font-mono text-sm resize-y min-h-[280px]"
          />

          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save real schedule
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <EyeOff className="h-5 w-5" />
            Decoy schedule (clone sites)
          </CardTitle>
          <CardDescription>
            Saved to legacy <code className="text-xs">dailySchedule</code>. Old copycat apps still listening on the
            original collection name will sync <strong>this</strong> text only — not your real schedule.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            id="decoy-schedule-content"
            value={decoyContent}
            onChange={(e) => setDecoyContent(e.target.value)}
            placeholder="Optional fake schedule for clone sites..."
            rows={10}
            className="font-mono text-sm resize-y min-h-[200px]"
          />

          <Button onClick={handleSaveDecoy} disabled={savingDecoy} variant="secondary" className="w-full sm:w-auto">
            {savingDecoy ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Publishing...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Publish decoy schedule
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getUsersByRole } from "@/lib/admin"
import {
  createScheduledCall,
  deleteScheduledCall,
  getLocalDateKey,
  subscribeScheduledCallsForDate,
  type ScheduledCall,
} from "@/lib/scheduled-calls"
import { buildScheduleImportPreview, type ScheduleImportRow } from "@/lib/schedule-import"
import { US_STREAM_SPORTS, DEFAULT_STREAM_SPORT } from "@/lib/sports"
import { Phone, Plus, Trash2, Loader2, FileText } from "lucide-react"
import { toast } from "@/hooks/use-toast"

type PublisherRow = { id: string; displayName?: string; email?: string; uid?: string }

export function ScheduledCallsAdmin() {
  const [dateKey, setDateKey] = useState(() => getLocalDateKey())
  const [calls, setCalls] = useState<ScheduledCall[]>([])
  const [publishers, setPublishers] = useState<PublisherRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [startTime, setStartTime] = useState("18:00")
  const [endTime, setEndTime] = useState("19:00")
  const [publisherId, setPublisherId] = useState("")
  const [sport, setSport] = useState<string>(DEFAULT_STREAM_SPORT)
  const [importPaste, setImportPaste] = useState("")
  const [importPreview, setImportPreview] = useState<{
    dateKey: string
    rows: ScheduleImportRow[]
  } | null>(null)
  const [importFallbackPublisherId, setImportFallbackPublisherId] = useState("")
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    getUsersByRole("publisher").then((rows) => {
      setPublishers(
        (rows as PublisherRow[]).map((r) => {
          const uid = (r as { uid?: string }).uid || r.id
          return { ...r, id: uid }
        }),
      )
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    const unsub = subscribeScheduledCallsForDate(dateKey, (list) => {
      setCalls(list)
      setLoading(false)
    })
    return unsub
  }, [dateKey])

  const publisherName = (id: string) => {
    const p = publishers.find((x) => x.id === id)
    return p?.displayName || p?.email || id
  }

  const handleAdd = async () => {
    if (!title.trim() || !publisherId) {
      toast({ title: "Missing fields", description: "Title and publisher are required.", variant: "destructive" })
      return
    }
    setSaving(true)
    const [y, m, d] = dateKey.split("-").map(Number)
    const [sh, sm] = startTime.split(":").map(Number)
    const [eh, em] = endTime.split(":").map(Number)
    const startsAt = new Date(y, m - 1, d, sh, sm, 0, 0)
    const endsAt = new Date(y, m - 1, d, eh, em, 0, 0)
    const result = await createScheduledCall({
      dateKey,
      title: title.trim(),
      description: description.trim(),
      startsAt,
      endsAt,
      publisherId,
      publisherName: publisherName(publisherId),
      sport,
    })
    setSaving(false)
    if (result.success) {
      toast({ title: "Call created", description: "Room and publisher assignment are saved." })
      setTitle("")
      setDescription("")
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    }
  }

  const handleDelete = async (id: string) => {
    const result = await deleteScheduledCall(id)
    if (result.success) {
      toast({ title: "Removed" })
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    }
  }

  const publisherRowsForImport = publishers.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    email: p.email,
  }))

  const handlePreviewImport = () => {
    const result = buildScheduleImportPreview(importPaste, publisherRowsForImport, {
      defaultSport: sport,
      fallbackPublisherId: importFallbackPublisherId || undefined,
    })
    if (result.errors.length && !result.dateKey) {
      toast({ title: "Could not parse schedule", description: result.errors.join(" "), variant: "destructive" })
      setImportPreview(null)
      return
    }
    if (!result.dateKey || !result.rows.length) {
      toast({
        title: "Nothing to import",
        description: result.errors[0] || "Add lines with a time (e.g. 6:30PM) and a title.",
        variant: "destructive",
      })
      setImportPreview(null)
      return
    }
    setDateKey(result.dateKey)
    setImportPreview({ dateKey: result.dateKey, rows: result.rows })
    const unmatched = result.rows.filter((r) => !r.matchedPublisherId).length
    toast({
      title: "Preview ready",
      description:
        unmatched > 0
          ? `${result.rows.length} game(s); ${unmatched} without a matched publisher — assign a fallback or fix names.`
          : `${result.rows.length} game(s) ready to create.`,
    })
  }

  const handleConfirmImport = async () => {
    if (!importPreview?.rows.length) return
    const toCreate = importPreview.rows.filter((r) => r.matchedPublisherId)
    const skipped = importPreview.rows.length - toCreate.length
    if (!toCreate.length) {
      toast({
        title: "No rows to create",
        description: "Every line needs a publisher (name after \" - \" must match a publisher, or choose a fallback).",
        variant: "destructive",
      })
      return
    }
    setImporting(true)
    let ok = 0
    let fail = 0
    for (const row of toCreate) {
      const pid = row.matchedPublisherId!
      const result = await createScheduledCall({
        dateKey: importPreview.dateKey,
        title: row.title,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        publisherId: pid,
        publisherName: publisherName(pid),
        sport: row.sport,
      })
      if (result.success) ok++
      else fail++
    }
    setImporting(false)
    setImportPreview(null)
    setImportPaste("")
    toast({
      title: "Import finished",
      description: `Created ${ok} call(s).${fail ? ` ${fail} failed.` : ""}${skipped ? ` Skipped ${skipped} (no publisher).` : ""}`,
      variant: fail ? "destructive" : "default",
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          <CardTitle>Scheduled calls & rooms</CardTitle>
        </div>
        <CardDescription>
          Create timed calls for a day, each with a fixed Agora room and one assigned publisher. Subscribers see
          what&apos;s live; publishers broadcast from their dashboard using the assigned room. This is separate from
          the plain-text schedule above.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="sc-date">Day</Label>
            <Input id="sc-date" type="date" value={dateKey} onChange={(e) => setDateKey(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sc-start">Start (local)</Label>
            <Input id="sc-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sc-end">End (local)</Label>
            <Input id="sc-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Sport / category</Label>
            <Select value={sport} onValueChange={setSport}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {US_STREAM_SPORTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sc-title">Call title</Label>
          <Input
            id="sc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Lakers vs Celtics — Ed"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="sc-desc">Notes (optional)</Label>
          <Textarea
            id="sc-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Internal notes for the publisher"
          />
        </div>

        <div className="space-y-2">
          <Label>Assigned publisher</Label>
          <Select value={publisherId} onValueChange={setPublisherId}>
            <SelectTrigger>
              <SelectValue placeholder="Select publisher" />
            </SelectTrigger>
            <SelectContent>
              {publishers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.displayName || p.email || p.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleAdd} disabled={saving || !publisherId}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-2" />
              Add call
            </>
          )}
        </Button>

        <div className="border-t pt-6 space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Import from schedule paste</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Paste the same block you use for Today&apos;s Schedule: a line with the date (e.g. Feb 6th, 2026), then lines
            like <span className="font-mono text-xs">🏀6:30PM Celtics - Brian</span>. The part after the last{" "}
            <span className="font-mono text-xs"> - </span> is matched to a publisher&apos;s display name. End time for each
            slot runs until the next game or 2 hours after start. Sport/category uses the selector above (emoji lines can
            override with NBA/NHL, etc.).
          </p>
          <Textarea
            value={importPaste}
            onChange={(e) => setImportPaste(e.target.value)}
            placeholder={`Sports Magic Games Schedule \nFeb 6th, 2026\n\n🏀6:30PM Celtics - Brian\n🏀7:00PM Timberwolves - James`}
            rows={8}
            className="font-mono text-sm resize-y min-h-[160px]"
          />
          <div className="space-y-2">
            <Label>If no name match, assign all unmatched to</Label>
            <Select
              value={importFallbackPublisherId || "__none__"}
              onValueChange={(v) => setImportFallbackPublisherId(v === "__none__" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Optional fallback publisher" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— none —</SelectItem>
                {publishers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.displayName || p.email || p.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={handlePreviewImport} disabled={!importPaste.trim()}>
              Preview import
            </Button>
            <Button type="button" onClick={handleConfirmImport} disabled={importing || !importPreview?.rows.length}>
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating…
                </>
              ) : (
                <>Create all from preview</>
              )}
            </Button>
          </div>
          {importPreview && (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Publisher</TableHead>
                    <TableHead className="hidden sm:table-cell">Sport</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importPreview.rows.map((r, idx) => (
                    <TableRow key={`${r.lineIndex}-${idx}`}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.startsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.endsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{r.title}</TableCell>
                      <TableCell className="text-sm">
                        {r.matchedPublisherId ? (
                          publisherName(r.matchedPublisherId)
                        ) : (
                          <span className="text-destructive">
                            Unmatched{r.publisherHint ? ` (${r.publisherHint})` : ""}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs">{r.sport}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground px-3 py-2 border-t">
                Day set to <span className="font-mono">{importPreview.dateKey}</span> from the pasted date.
              </p>
            </div>
          )}
        </div>

        <div className="border-t pt-4">
          <h3 className="text-sm font-medium mb-2">Calls on {dateKey}</h3>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : calls.length === 0 ? (
            <Alert>
              <AlertDescription>No scheduled calls for this day yet.</AlertDescription>
            </Alert>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Publisher</TableHead>
                    <TableHead className="hidden md:table-cell">Room ID</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calls.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-xs sm:text-sm whitespace-nowrap">
                        {c.startsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} –{" "}
                        {c.endsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </TableCell>
                      <TableCell className="font-medium text-sm">{c.title}</TableCell>
                      <TableCell className="text-sm">{c.publisherName}</TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-xs max-w-[200px] truncate">
                        {c.roomId}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => handleDelete(c.id)}
                          aria-label="Delete call"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

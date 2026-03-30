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
import { US_STREAM_SPORTS, DEFAULT_STREAM_SPORT } from "@/lib/sports"
import { Phone, Plus, Trash2, Loader2 } from "lucide-react"
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

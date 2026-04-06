"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  subscribeToActiveStreams,
  endStreamSession,
  updateStreamSessionPublisher,
  isAwaitingBroadcastSession,
  resetScheduledSessionAfterBroadcast,
  type StreamSession,
} from "@/lib/streaming"
import { getUsersByRole } from "@/lib/admin"
import { deleteScheduledCall } from "@/lib/scheduled-calls"
import { StreamChatPanel } from "@/components/ui/stream-chat-panel"
import { useAuth } from "@/hooks/use-auth"
import { Radio, MessageSquare, UserCog, Loader2, Trash2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"

type PublisherRow = { id: string; displayName?: string; email?: string }

export function ActiveRoomsAdmin() {
  const { user, userProfile } = useAuth()
  const [streams, setStreams] = useState<StreamSession[]>([])
  const [publishers, setPublishers] = useState<PublisherRow[]>([])
  const [loading, setLoading] = useState(true)
  const [endingId, setEndingId] = useState<string | null>(null)
  const [removingScheduleId, setRemovingScheduleId] = useState<string | null>(null)
  const [reassignSession, setReassignSession] = useState<StreamSession | null>(null)
  const [reassignPublisherId, setReassignPublisherId] = useState("")
  const [reassignSaving, setReassignSaving] = useState(false)
  const [chatSession, setChatSession] = useState<StreamSession | null>(null)

  useEffect(() => {
    const unsub = subscribeToActiveStreams((list) => {
      setStreams(list)
      setLoading(false)
    })
    return unsub
  }, [])

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

  const publisherLabel = (id: string) => {
    const p = publishers.find((x) => x.id === id)
    return p?.displayName || p?.email || id
  }

  const handleEnd = async (s: StreamSession) => {
    if (!s.id) return
    if (s.scheduledCallId && isAwaitingBroadcastSession(s)) {
      return
    }
    setEndingId(s.id)
    const r = s.scheduledCallId
      ? await resetScheduledSessionAfterBroadcast(s.id)
      : await endStreamSession(s.id)
    setEndingId(null)
    if (r.success) {
      toast({
        title: s.scheduledCallId ? "Broadcast stopped" : "Room closed",
        description: s.scheduledCallId
          ? "The publisher slot is back to “waiting for host.” Use Remove from schedule if you want to delete this game from the calendar entirely."
          : "Session marked inactive in Firestore.",
      })
      if (chatSession?.id === s.id) setChatSession(null)
    } else {
      toast({ title: "Could not close room", description: r.error, variant: "destructive" })
    }
  }

  const handleRemoveFromSchedule = async (s: StreamSession) => {
    if (!s.scheduledCallId) return
    setRemovingScheduleId(s.id)
    const r = await deleteScheduledCall(s.scheduledCallId)
    setRemovingScheduleId(null)
    if (r.success) {
      toast({
        title: "Removed from schedule",
        description: "The scheduled call and this room entry are deleted. Publishers and subscribers will no longer see this slot.",
      })
      if (chatSession?.id === s.id) setChatSession(null)
    } else {
      toast({ title: "Could not remove", description: r.error, variant: "destructive" })
    }
  }

  const openReassign = (s: StreamSession) => {
    setReassignSession(s)
    setReassignPublisherId(s.publisherId)
  }

  const handleReassign = async () => {
    if (!reassignSession?.id || !reassignPublisherId) return
    setReassignSaving(true)
    const name = publisherLabel(reassignPublisherId)
    const r = await updateStreamSessionPublisher(reassignSession.id, reassignPublisherId, name)
    setReassignSaving(false)
    if (r.success) {
      toast({
        title: "Publisher updated",
        description:
          "The session record now points at the new publisher. The previous host should stop broadcasting; Agora audio still comes from whoever is actually publishing.",
      })
      setReassignSession(null)
      setReassignPublisherId("")
    } else {
      toast({ title: "Update failed", description: r.error, variant: "destructive" })
    }
  }

  const adminName = userProfile?.displayName || user?.email || "Admin"
  const adminId = user?.uid ?? ""

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            <CardTitle>Live rooms</CardTitle>
          </div>
          <CardDescription>
            Active <code className="text-xs">streamSessions</code> rows. For <strong>scheduled</strong> rooms:{" "}
            <strong>End</strong> stops the live broadcast and returns the slot to &quot;waiting for host.&quot;{" "}
            <strong>Remove from schedule</strong> deletes the calendar entry and this row (you don&apos;t need to use the
            Schedule tab). The plain-text block at the top of the Schedule tab is separate—it does not list these rooms.
            Reassigning updates metadata only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading active rooms…
            </div>
          ) : streams.length === 0 ? (
            <Alert>
              <AlertDescription>No active rooms right now.</AlertDescription>
            </Alert>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Publisher</TableHead>
                    <TableHead className="hidden md:table-cell font-mono text-xs">Room ID</TableHead>
                    <TableHead className="hidden sm:table-cell">Started</TableHead>
                    <TableHead className="text-right min-w-[220px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {streams.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium text-sm max-w-[200px]">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <span className="truncate">{s.title || "Untitled"}</span>
                          {isAwaitingBroadcastSession(s) && (
                            <Badge variant="secondary" className="text-[10px] shrink-0">
                              Waiting for host
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{s.publisherName}</TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-[11px] max-w-[220px] truncate">
                        {s.roomId}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground whitespace-nowrap">
                        {s.createdAt instanceof Date
                          ? s.createdAt.toLocaleString()
                          : new Date(s.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => setChatSession(s)}
                          >
                            <MessageSquare className="h-3.5 w-3.5 mr-1" />
                            Chat
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => openReassign(s)}
                          >
                            <UserCog className="h-3.5 w-3.5 mr-1" />
                            Reassign
                          </Button>
                          {s.scheduledCallId && isAwaitingBroadcastSession(s) ? null : (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  className="h-8"
                                  disabled={endingId === s.id || removingScheduleId === s.id}
                                >
                                  {endingId === s.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    "End"
                                  )}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    {s.scheduledCallId ? "Stop live broadcast?" : "End this room?"}
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {s.scheduledCallId ? (
                                      <>
                                        Stops the live feed for this scheduled game and returns the room to
                                        &quot;waiting for host.&quot; The calendar entry stays—use{" "}
                                        <strong>Remove from schedule</strong> if you want to delete the game from the
                                        schedule entirely.
                                      </>
                                    ) : (
                                      <>
                                        Marks the stream session inactive. The publisher should also stop broadcasting in
                                        their dashboard so Agora disconnects.
                                      </>
                                    )}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleEnd(s)}>
                                    {s.scheduledCallId ? "Stop broadcast" : "End room"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                          {s.scheduledCallId ? (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-destructive border-destructive/50 hover:bg-destructive/10"
                                  disabled={removingScheduleId === s.id || endingId === s.id}
                                >
                                  {removingScheduleId === s.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <>
                                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                                      Remove
                                    </>
                                  )}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remove from schedule?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This deletes the scheduled call from the database and removes this room from Live
                                    rooms. It does not change the plain-text schedule block at the top of the Schedule
                                    tab. Publishers assigned to this game will no longer see it in their list.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => handleRemoveFromSchedule(s)}
                                  >
                                    Remove from schedule
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!reassignSession} onOpenChange={(open) => !open && setReassignSession(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reassign publisher</DialogTitle>
            <DialogDescription>
              Updates <span className="font-mono text-xs">{reassignSession?.title || reassignSession?.roomId}</span>.
              This does not move the live Agora feed—coordinate with hosts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Publisher</Label>
            <Select value={reassignPublisherId} onValueChange={setReassignPublisherId}>
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReassignSession(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleReassign} disabled={reassignSaving || !reassignPublisherId}>
              {reassignSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!chatSession} onOpenChange={(open) => !open && setChatSession(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Room chat</SheetTitle>
            <SheetDescription>
              Publisher, privileged subscribers (chat enabled), and admin messages for this stream. Session:{" "}
              <span className="font-mono text-xs">{chatSession?.id}</span>
            </SheetDescription>
          </SheetHeader>
          {chatSession?.id && adminId ? (
            <div className="mt-4">
              <StreamChatPanel
                streamSessionId={chatSession.id}
                streamTitle={chatSession.title}
                currentUserId={adminId}
                currentUserName={adminName}
                currentUserEmail={user?.email ?? undefined}
                isPublisher={false}
                canChat
                isAdmin
                messageListClassName="h-[min(50vh,360px)] rounded-md border p-3"
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-4">Sign in as admin to view chat.</p>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

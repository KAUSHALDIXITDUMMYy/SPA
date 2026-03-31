"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { sendChatMessage, subscribeToStreamChat, type ChatMessage } from "@/lib/chat"
import { createReport, blockUser } from "@/lib/admin"
import { useAuth } from "@/hooks/use-auth"
import { MessageSquare, Send, MoreHorizontal, Flag, Ban } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface StreamChatPanelProps {
  streamSessionId: string
  streamTitle?: string
  currentUserId: string
  currentUserName: string
  currentUserEmail?: string
  isPublisher: boolean
  canChat: boolean
  /** Admin dashboard: full transcript + send as moderator */
  isAdmin?: boolean
  /** Override message list height (default h-[200px]) */
  messageListClassName?: string
  /** Override Firestore message limit (default 100, admin view uses 500) */
  chatHistoryLimit?: number
}

const REPORT_REASONS = [
  "Abusive or harassing content",
  "Hate speech or discrimination",
  "Spam",
  "Impersonation",
  "Other",
] as const

export function StreamChatPanel({
  streamSessionId,
  streamTitle,
  currentUserId,
  currentUserName,
  currentUserEmail,
  isPublisher,
  canChat,
  isAdmin = false,
  messageListClassName,
  chatHistoryLimit,
}: StreamChatPanelProps) {
  const { user, userProfile } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const [reportTarget, setReportTarget] = useState<{ id: string; name: string } | null>(null)
  const [reportReason, setReportReason] = useState<string>(REPORT_REASONS[0])
  const [reportDetails, setReportDetails] = useState("")
  const [reportSubmitting, setReportSubmitting] = useState(false)
  const [blockTarget, setBlockTarget] = useState<{ id: string; name: string } | null>(null)
  const [blockSubmitting, setBlockSubmitting] = useState(false)

  const blockedIds = userProfile?.blockedUserIds ?? []
  const visibleMessages = isAdmin
    ? messages
    : messages.filter((m) => !blockedIds.includes(m.senderId))

  useEffect(() => {
    const lim = chatHistoryLimit ?? (isAdmin ? 500 : 100)
    const unsubscribe = subscribeToStreamChat(streamSessionId, (msgs) => {
      setMessages(msgs)
    }, lim)
    return () => unsubscribe()
  }, [streamSessionId, isAdmin, chatHistoryLimit])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = async () => {
    if (!isAdmin && !canChat && !isPublisher) return
    const text = inputText.trim()
    if (!text) return

    setSending(true)
    setError("")
    const role = isAdmin ? "admin" : isPublisher ? "publisher" : "subscriber"
    const result = await sendChatMessage(streamSessionId, currentUserId, currentUserName, role, text)

    if (result.success) {
      setInputText("")
    } else {
      setError(result.error || "Failed to send message")
    }
    setSending(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const canSend = (isAdmin || isPublisher || canChat) && inputText.trim().length > 0

  const handleReportSubmit = async () => {
    if (!reportTarget || !user || !userProfile) return
    setReportSubmitting(true)
    const { success, error } = await createReport({
      reporterId: user.uid,
      reporterName: currentUserName,
      reporterEmail: currentUserEmail || user.email || undefined,
      reportedUserId: reportTarget.id,
      reportedUserName: reportTarget.name,
      contentType: "user",
      reason: reportReason,
      details: reportDetails.trim() || undefined,
    })
    setReportSubmitting(false)
    setReportTarget(null)
    setReportDetails("")
    if (success) {
      toast({ title: "Report submitted", description: "We will review it within 24 hours." })
    } else {
      toast({ title: "Error", description: error, variant: "destructive" })
    }
  }

  const handleBlockConfirm = async () => {
    if (!blockTarget || !user || !userProfile) return
    setBlockSubmitting(true)
    const { success, error } = await blockUser(
      user.uid,
      currentUserName,
      blockTarget.id,
      blockTarget.name
    )
    setBlockSubmitting(false)
    setBlockTarget(null)
    if (success) {
      toast({ title: "User blocked", description: "You won't see their messages anymore." })
    } else {
      toast({ title: "Error", description: error, variant: "destructive" })
    }
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Live Chat
          </CardTitle>
          {streamTitle && (
            <Badge variant="outline" className="text-xs font-normal truncate max-w-[120px]">
              {streamTitle}
            </Badge>
          )}
        </div>
        <CardDescription className="text-xs">
          {isAdmin
            ? "Read publisher and subscriber messages. Your replies appear as Admin."
            : isPublisher
              ? "Reply to privileged subscribers"
              : canChat
                ? "Chat with the publisher"
                : "You don't have chat access. Contact admin for privileges."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ScrollArea className={messageListClassName ?? "h-[200px] rounded-md border p-3"}>
          <div className="space-y-2">
            {visibleMessages.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No messages yet. Send a message to start the conversation.
              </p>
            ) : (
              visibleMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col gap-0.5 ${msg.senderId === currentUserId ? "items-end" : "items-start"}`}
                >
                  <div className="flex items-start gap-1 max-w-[95%]">
                    <div
                      className={`rounded-lg px-3 py-1.5 text-sm ${
                        msg.senderId === currentUserId
                          ? "bg-primary text-primary-foreground"
                          : msg.senderRole === "publisher"
                            ? "bg-muted border"
                            : msg.senderRole === "admin"
                              ? "border border-violet-300 bg-violet-50 text-violet-950 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-100"
                              : "bg-muted/70"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium opacity-80">
                          {msg.senderName}
                          {msg.senderRole === "publisher" && (
                            <span className="ml-1 text-[10px]">(Publisher)</span>
                          )}
                          {msg.senderRole === "admin" && (
                            <span className="ml-1 text-[10px]">(Admin)</span>
                          )}
                          {msg.senderRole === "subscriber" && (
                            <span className="ml-1 text-[10px]">(Subscriber)</span>
                          )}
                        </p>
                        {msg.senderId !== currentUserId && !isAdmin && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                                <MoreHorizontal className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => setReportTarget({ id: msg.senderId, name: msg.senderName })}
                              >
                                <Flag className="h-3 w-3 mr-2" />
                                Report user
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setBlockTarget({ id: msg.senderId, name: msg.senderName })}
                                className="text-destructive focus:text-destructive"
                              >
                                <Ban className="h-3 w-3 mr-2" />
                                Block user
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                      <p className="break-words">{msg.text}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {msg.createdAt instanceof Date
                      ? msg.createdAt.toLocaleTimeString()
                      : new Date(msg.createdAt as any).toLocaleTimeString()}
                  </p>
                </div>
              ))
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        {/* Report dialog */}
        <Dialog open={!!reportTarget} onOpenChange={(open) => !open && setReportTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Report user</DialogTitle>
              <DialogDescription>
                Report {reportTarget?.name} for objectionable content or abuse. We review reports within 24 hours.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>Reason</Label>
                <Select value={reportReason} onValueChange={setReportReason}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORT_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Details (optional)</Label>
                <Textarea
                  placeholder="Any additional context..."
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setReportTarget(null)}>Cancel</Button>
              <Button onClick={handleReportSubmit} disabled={reportSubmitting}>
                {reportSubmitting ? "Submitting…" : "Submit report"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Block confirmation */}
        <AlertDialog open={!!blockTarget} onOpenChange={(open) => !open && setBlockTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Block user?</AlertDialogTitle>
              <AlertDialogDescription>
                Block {blockTarget?.name}? You won&apos;t see their messages. You can contact admin to manage blocked users.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleBlockConfirm} disabled={blockSubmitting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {blockSubmitting ? "Blocking…" : "Block"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        {(isAdmin || isPublisher || canChat) && (
          <div className="flex gap-2">
            <Input
              placeholder="Type a message..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              className="text-sm"
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!canSend || sending}
              className="shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

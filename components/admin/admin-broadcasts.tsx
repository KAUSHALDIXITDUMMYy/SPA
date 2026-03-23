"use client"

import { useEffect, useState } from "react"
import {
  createAdminBroadcast,
  subscribeAdminBroadcasts,
  type AdminBroadcast,
} from "@/lib/admin"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Bell, Send } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { toast } from "@/hooks/use-toast"

export function AdminBroadcasts() {
  const { user, userProfile } = useAuth()
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [broadcasts, setBroadcasts] = useState<AdminBroadcast[]>([])

  useEffect(() => {
    const unsub = subscribeAdminBroadcasts(setBroadcasts)
    return unsub
  }, [])

  const handleSend = async () => {
    if (!user?.uid) {
      toast({ title: "Error", description: "You must be signed in.", variant: "destructive" })
      return
    }
    setSending(true)
    try {
      const result = await createAdminBroadcast(
        message,
        user.uid,
        userProfile?.displayName || userProfile?.email || undefined
      )
      if (result.success) {
        toast({ title: "Sent", description: "Subscribers with assignments will see this in their notifications tab." })
        setMessage("")
      } else {
        toast({
          title: "Could not send",
          description: result.error || "Unknown error",
          variant: "destructive",
        })
      }
    } finally {
      setSending(false)
    }
  }

  const formatDate = (d: Date) => {
    const date = d instanceof Date ? d : new Date(d)
    return date.toLocaleString()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Subscriber notifications
        </CardTitle>
        <CardDescription>
          Write a message for every subscriber who has at least one publisher or stream assignment. They will see it
          under Notifications as &quot;Message from ADMIN&quot;.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          placeholder="Type your message to subscribers…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          className="resize-y min-h-[120px]"
        />
        <Button onClick={handleSend} disabled={sending || !message.trim()} className="w-full sm:w-auto">
          <Send className="h-4 w-4 mr-2" />
          {sending ? "Sending…" : "Send notification"}
        </Button>

        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Recent notifications</h3>
          {broadcasts.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">No notifications sent yet.</p>
          ) : (
            <ScrollArea className="h-[320px] pr-4">
              <ul className="space-y-3">
                {broadcasts.map((b) => (
                  <li key={b.id} className="rounded-lg border bg-muted/30 p-3 text-sm">
                    <p className="whitespace-pre-wrap break-words">{b.message}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {formatDate(b.createdAt)}
                      {b.createdByName ? ` · ${b.createdByName}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

"use client"

import { useEffect, useState } from "react"
import { subscribeAdminBroadcasts, type AdminBroadcast } from "@/lib/admin"
import { subscribeSubscriberAssignmentEligibility } from "@/lib/subscriber"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Bell, Shield } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"

export function SubscriberNotifications() {
  const { user } = useAuth()
  const [eligible, setEligible] = useState(false)
  const [eligibilityReady, setEligibilityReady] = useState(false)
  const [broadcasts, setBroadcasts] = useState<AdminBroadcast[]>([])

  useEffect(() => {
    if (!user?.uid) return
    const unsub = subscribeSubscriberAssignmentEligibility(user.uid, (ok) => {
      setEligible(ok)
      setEligibilityReady(true)
    })
    return unsub
  }, [user?.uid])

  useEffect(() => {
    if (!eligible) {
      setBroadcasts([])
      return
    }
    const unsub = subscribeAdminBroadcasts(setBroadcasts)
    return unsub
  }, [eligible])

  const formatDate = (d: Date) => {
    const date = d instanceof Date ? d : new Date(d)
    return date.toLocaleString()
  }

  if (!eligibilityReady) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">Loading…</CardContent>
      </Card>
    )
  }

  if (!eligible) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5" />
            Notifications
          </CardTitle>
          <CardDescription>
            Admin messages appear here once you are assigned to at least one publisher or stream.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            You don&apos;t have any publisher or stream assignments yet. Contact your administrator if you need access.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bell className="h-5 w-5" />
          Notifications
        </CardTitle>
        <CardDescription>Messages from your administrator</CardDescription>
      </CardHeader>
      <CardContent>
        {broadcasts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No messages from admin yet.</p>
        ) : (
          <ScrollArea className="h-[min(480px,60vh)] pr-4">
            <ul className="space-y-4">
              {broadcasts.map((b) => (
                <li key={b.id} className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      Message from ADMIN
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">{b.message}</p>
                  <p className="text-xs text-muted-foreground mt-3">{formatDate(b.createdAt)}</p>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}

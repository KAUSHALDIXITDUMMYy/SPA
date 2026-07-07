"use client"

import { useEffect, useState } from "react"
import { subscribeAdminBroadcasts, type AdminBroadcast } from "@/lib/admin"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Bell, Shield } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { useSubscriberDashboard } from "@/hooks/use-subscriber-dashboard"
import { broadcastVisibleToSubscriber } from "@/lib/tenant"

export function SubscriberNotifications() {
  const { userProfile } = useAuth()
  const { hasAssignment, loading } = useSubscriberDashboard()
  const [broadcasts, setBroadcasts] = useState<AdminBroadcast[]>([])

  useEffect(() => {
    if (!hasAssignment || !userProfile) {
      setBroadcasts([])
      return
    }
    const unsub = subscribeAdminBroadcasts((items) => {
      setBroadcasts(items.filter((b) => broadcastVisibleToSubscriber(b, userProfile)))
    })
    return unsub
  }, [hasAssignment, userProfile])

  const formatDate = (d: Date) => {
    const date = d instanceof Date ? d : new Date(d)
    return date.toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).toUpperCase()
  }

  if (loading) {
    return (
      <div className="border border-border rounded-lg p-8 text-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-3" />
        <p className="text-muted-foreground text-sm font-mono">LOADING ALERTS...</p>
      </div>
    )
  }

  if (!hasAssignment) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-mono text-lg font-bold tracking-wide uppercase">System Notifications</h2>
        </div>
        <div className="border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground font-mono">
            NO ASSIGNMENTS DETECTED. Admin messages appear here once you are assigned to at least one publisher or stream.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-mono text-lg font-bold tracking-wide uppercase">System Notifications</h2>
            <p className="text-xs text-muted-foreground font-mono">ALERTS_LOG</p>
          </div>
        </div>
        {broadcasts.length > 0 && (
          <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-1 rounded">
            {broadcasts.length} ALERT{broadcasts.length !== 1 ? "S" : ""}
          </span>
        )}
      </div>

      {/* Content */}
      {broadcasts.length === 0 ? (
        <div className="border border-border rounded-lg p-8 text-center">
          <Bell className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-mono">NO ACTIVE NOTIFICATIONS</p>
          <p className="text-xs text-muted-foreground/60 mt-1">System is clear. No admin messages pending.</p>
        </div>
      ) : (
        <ScrollArea className="h-[min(520px,65vh)]">
          <div className="space-y-3 pr-4">
            {broadcasts.map((b) => (
              <div key={b.id} className="rounded-lg border border-border bg-card p-4 hover:border-primary/30 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-mono font-bold tracking-wider bg-primary/10 text-primary border border-primary/20">
                    ADMIN
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground tracking-wider">
                    {formatDate(b.createdAt)}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap break-words text-foreground leading-relaxed">{b.message}</p>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

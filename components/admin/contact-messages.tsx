"use client"

import { useEffect, useMemo, useState } from "react"
import { getContactMessagesPage, markContactMessageRead, type ContactMessage } from "@/lib/admin"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Mail, RefreshCw, Loader2 } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { resolveUserTenant } from "@/lib/tenant"
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll"

export function ContactMessages() {
  const { userProfile } = useAuth()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const {
    items: rawMessages,
    setItems: setMessages,
    loading,
    loadingMore,
    hasMore,
    reset,
    sentinelRef,
  } = useInfiniteScroll<ContactMessage>({
    fetchPage: getContactMessagesPage,
    enabled: Boolean(userProfile),
    resetKey: userProfile?.uid,
  })

  const messages = useMemo(() => {
    const scope = userProfile?.role === "admin" ? resolveUserTenant(userProfile) : "default"
    if (userProfile?.role !== "admin") return rawMessages
    return rawMessages.filter((m) => resolveUserTenant({ email: m.email }) === scope)
  }, [rawMessages, userProfile])

  const handleMarkRead = async (id: string) => {
    await markContactMessageRead(id)
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, read: true } : m)))
    setSelectedId(id)
  }

  const formatDate = (d: Date) => {
    const date = d instanceof Date ? d : new Date(d)
    return date.toLocaleString()
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading contact messages...
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Contact messages
          </CardTitle>
          <CardDescription>Messages sent from the Contact Us page (100 per page)</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => void reset()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {messages.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No contact messages yet.</p>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {messages.map((msg) => (
                <Card
                  key={msg.id}
                  className={`cursor-pointer transition-colors ${
                    selectedId === msg.id ? "ring-2 ring-primary" : ""
                  } ${!msg.read ? "border-l-4 border-l-primary" : ""}`}
                  onClick={() => {
                    setSelectedId(msg.id ?? null)
                    if (!msg.read && msg.id) void handleMarkRead(msg.id)
                  }}
                >
                  <CardHeader className="py-3 px-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{msg.subject}</p>
                        <p className="text-sm text-muted-foreground">
                          {msg.name} &bull; {msg.email}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!msg.read && (
                          <Badge variant="default" className="text-xs">
                            New
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(msg.createdAt)}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="py-2 px-4 text-sm text-muted-foreground whitespace-pre-wrap">
                    {msg.message}
                  </CardContent>
                </Card>
              ))}
              {hasMore && (
                <div ref={sentinelRef} className="py-4 text-center text-sm text-muted-foreground">
                  {loadingMore ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading more…
                    </span>
                  ) : (
                    "Scroll for more messages"
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}

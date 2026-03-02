"use client"

import { useEffect, useState } from "react"
import { getContactMessages, markContactMessageRead, type ContactMessage } from "@/lib/admin"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Mail, RefreshCw } from "lucide-react"

export function ContactMessages() {
  const [messages, setMessages] = useState<ContactMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const list = await getContactMessages()
    setMessages(list)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleMarkRead = async (id: string) => {
    await markContactMessageRead(id)
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, read: true } : m))
    )
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
          <CardDescription>Messages sent from the Contact Us page</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
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
                          <Badge variant="secondary">New</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatDate(msg.createdAt)}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="py-0 px-4 pb-3 pt-0">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {msg.message}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}

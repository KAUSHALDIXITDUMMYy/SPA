"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { sendChatMessage, subscribeToStreamChat, type ChatMessage } from "@/lib/chat"
import { MessageSquare, Send } from "lucide-react"

interface StreamChatPanelProps {
  streamSessionId: string
  streamTitle?: string
  currentUserId: string
  currentUserName: string
  isPublisher: boolean
  canChat: boolean
}

export function StreamChatPanel({
  streamSessionId,
  streamTitle,
  currentUserId,
  currentUserName,
  isPublisher,
  canChat,
}: StreamChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsubscribe = subscribeToStreamChat(streamSessionId, (msgs) => {
      setMessages(msgs)
    })
    return () => unsubscribe()
  }, [streamSessionId])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = async () => {
    if (!canChat && !isPublisher) return
    const text = inputText.trim()
    if (!text) return

    setSending(true)
    setError("")
    const result = await sendChatMessage(
      streamSessionId,
      currentUserId,
      currentUserName,
      isPublisher ? "publisher" : "subscriber",
      text
    )

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

  const canSend = (isPublisher || canChat) && inputText.trim().length > 0

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
          {isPublisher
            ? "Reply to privileged subscribers"
            : canChat
              ? "Chat with the publisher"
              : "You don't have chat access. Contact admin for privileges."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ScrollArea className="h-[200px] rounded-md border p-3">
          <div className="space-y-2">
            {messages.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No messages yet. Send a message to start the conversation.
              </p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col gap-0.5 ${msg.senderId === currentUserId ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm ${
                      msg.senderId === currentUserId
                        ? "bg-primary text-primary-foreground"
                        : msg.senderRole === "publisher"
                          ? "bg-muted border"
                          : "bg-muted/70"
                    }`}
                  >
                    <p className="text-xs font-medium opacity-80 mb-0.5">
                      {msg.senderName}
                      {msg.senderRole === "publisher" && (
                        <span className="ml-1 text-[10px]">(Publisher)</span>
                      )}
                    </p>
                    <p className="break-words">{msg.text}</p>
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

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        {(isPublisher || canChat) && (
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

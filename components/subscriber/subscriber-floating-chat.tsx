"use client"

import { useState } from "react"
import { MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { StreamChatPanel } from "@/components/ui/stream-chat-panel"

type SubscriberFloatingChatProps = {
  streamSessionId: string | undefined
  streamTitle?: string
  userId: string
  userName: string
  userEmail?: string
  allowChat: boolean
}

export function SubscriberFloatingChat({
  streamSessionId,
  streamTitle,
  userId,
  userName,
  userEmail,
  allowChat,
}: SubscriberFloatingChatProps) {
  const [open, setOpen] = useState(false)

  if (!allowChat || !streamSessionId) return null

  return (
    <>
      <div className="mt-3 flex w-full justify-center px-3 sm:mt-4">
        <Button
          type="button"
          variant="secondary"
          className="h-12 gap-2 rounded-full border bg-card/95 px-5 shadow-lg backdrop-blur-sm dark:bg-card/90"
          onClick={() => setOpen(true)}
          aria-label="Open stream chat"
        >
          <MessageSquare className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">Stream chat</span>
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="h-[88dvh] max-h-[640px] rounded-t-2xl flex flex-col gap-0 p-0"
        >
          <SheetHeader className="px-4 pt-4 pb-2 text-left border-b shrink-0">
            <SheetTitle className="text-base">Stream chat</SheetTitle>
            <SheetDescription className="text-xs line-clamp-2">
              {streamTitle ? `${streamTitle} · ` : ""}
              Messages for this broadcast only.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <StreamChatPanel
              key={streamSessionId}
              streamSessionId={streamSessionId}
              streamTitle={streamTitle}
              currentUserId={userId}
              currentUserName={userName}
              currentUserEmail={userEmail}
              isPublisher={false}
              canChat
              messageListClassName="h-[min(42vh,280px)] rounded-md border p-3"
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

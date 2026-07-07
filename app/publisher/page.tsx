"use client"

import { ProtectedRoute } from "@/components/auth/protected-route"
import { StreamControls } from "@/components/publisher/stream-controls"
import { ScheduledCallsPublisherSection } from "@/components/publisher/scheduled-calls-publisher"
import type { ScheduledCall } from "@/lib/scheduled-calls"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { signOut } from "@/lib/auth"
import { useAuth } from "@/hooks/use-auth"
import { useRouter } from "next/navigation"
import { useState, useEffect, useRef } from "react"
import { Podcast as Broadcast, LogOut, Radio, AlertTriangle, UserX } from "lucide-react"
import type { StreamSession } from "@/lib/streaming"
import { DEFAULT_STREAM_SPORT } from "@/lib/sports"
import { toast } from "@/hooks/use-toast"

export default function PublisherDashboard() {
  const { userProfile } = useAuth()
  const router = useRouter()
  const [currentStream, setCurrentStream] = useState<StreamSession | null>(null)
  const [broadcastScheduledCall, setBroadcastScheduledCall] = useState<ScheduledCall | null>(null)
  const previousActiveStatus = useRef<boolean | null>(null)
  const [signOutWhileLiveOpen, setSignOutWhileLiveOpen] = useState(false)

  useEffect(() => {
    if (userProfile && previousActiveStatus.current !== null) {
      if (userProfile.isActive !== previousActiveStatus.current) {
        if (userProfile.isActive) {
          toast({
            title: "Account Activated",
            description: "Your account has been reactivated by an administrator. You can now publish streams.",
            variant: "default",
          })
        } else {
          toast({
            title: "Account Deactivated",
            description: "Your account has been deactivated by an administrator. You can no longer publish.",
            variant: "destructive",
          })
        }
      }
    }

    if (userProfile) {
      previousActiveStatus.current = userProfile.isActive
    }
  }, [userProfile?.isActive])

  const handleSignOut = async () => {
    await signOut()
    router.push("/")
  }

  const requestSignOut = () => {
    if (currentStream) {
      setSignOutWhileLiveOpen(true)
      return
    }
    void handleSignOut()
  }

  const handleStreamStart = (session: StreamSession) => {
    setCurrentStream(session)
  }

  const handleStreamEnd = () => {
    setCurrentStream(null)
    setBroadcastScheduledCall(null)
  }

  return (
    <ProtectedRoute allowedRoles={["publisher"]}>
      <div className="min-h-screen bg-background flex">
        <AlertDialog open={signOutWhileLiveOpen} onOpenChange={setSignOutWhileLiveOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="font-mono uppercase">End your broadcast first</AlertDialogTitle>
              <AlertDialogDescription>
                You are still live. Use the red &quot;End Stream&quot; button in the live controls below, then sign out
                when you are done. Signing out now would disconnect listeners while the session may still appear active.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction type="button" onClick={() => setSignOutWhileLiveOpen(false)}>
                OK
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Sidebar */}
        <aside className="hidden md:flex flex-col w-56 border-r border-border bg-sidebar shrink-0">
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
                <Broadcast className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-mono text-sm font-bold text-foreground tracking-wide">CREATOR HUB</p>
                {currentStream ? (
                  <p className="text-xs text-red-400 font-mono animate-pulse">LIVE SESSION ACTIVE</p>
                ) : (
                  <p className="text-xs text-muted-foreground font-mono">READY TO BROADCAST</p>
                )}
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-1">
            <div className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium bg-accent text-accent-foreground">
              <Radio className="h-4 w-4" />
              <span className="font-mono tracking-wide">Streams</span>
            </div>
          </nav>

          {/* Live indicator */}
          {currentStream && (
            <div className="mx-3 mb-3 p-3 rounded-lg border border-red-500/30 bg-red-500/10">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-xs font-mono text-red-400">LIVE NOW</span>
              </div>
              <p className="text-xs text-foreground truncate font-medium">
                {currentStream.sport && currentStream.sport !== DEFAULT_STREAM_SPORT
                  ? `${currentStream.sport}: `
                  : ""}
                {currentStream.title}
              </p>
            </div>
          )}

          {/* Bottom actions */}
          <div className="p-3 border-t border-border">
            <button
              onClick={requestSignOut}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-mono tracking-wide"
            >
              <LogOut className="h-3.5 w-3.5" />
              SIGN OUT
            </button>
          </div>
        </aside>

        {/* Mobile Header */}
        <div className="flex flex-col flex-1 min-w-0">
          <header className="md:hidden border-b border-border bg-card px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Broadcast className="h-5 w-5 text-primary" />
                <span className="font-mono font-bold text-sm tracking-wide">PUBLISHER</span>
                {currentStream && (
                  <span className="flex items-center gap-1 ml-2 px-2 py-0.5 bg-red-500/10 rounded text-xs text-red-400 font-mono">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                    LIVE
                  </span>
                )}
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={requestSignOut}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
            {userProfile && !userProfile.isActive ? (
              <Card className="border-destructive bg-card">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-full bg-destructive/10">
                      <UserX className="h-6 w-6 text-destructive" />
                    </div>
                    <div>
                      <CardTitle className="font-mono uppercase tracking-wide">Account Inactive</CardTitle>
                      <CardDescription>Your access has been temporarily disabled</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Your account is currently inactive. You are unable to stream or access content at this time.
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-2 text-muted-foreground text-sm">
                    <p>Your account has been deactivated by an administrator. This means:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>You cannot start or manage streams</li>
                      <li>All your publishing features are temporarily disabled</li>
                    </ul>
                    <p className="mt-4 font-medium text-foreground">
                      Please contact your administrator to reactivate your account.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                <ScheduledCallsPublisherSection
                  onChooseCall={setBroadcastScheduledCall}
                  chosenCallId={broadcastScheduledCall?.id ?? null}
                  disabled={!!currentStream}
                />
                <StreamControls
                  onStreamStart={handleStreamStart}
                  onStreamEnd={handleStreamEnd}
                  broadcastScheduledCall={broadcastScheduledCall}
                  onClearBroadcastScheduledCall={() => setBroadcastScheduledCall(null)}
                />
              </div>
            )}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  )
}

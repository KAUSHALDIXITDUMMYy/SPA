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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { signOut } from "@/lib/auth"
import { useAuth } from "@/hooks/use-auth"
import { useRouter } from "next/navigation"
import { useState, useEffect, useRef } from "react"
import { Podcast as Broadcast, LogOut, Radio, AlertTriangle, UserX, Menu } from "lucide-react"
import type { StreamSession } from "@/lib/streaming"
import { DEFAULT_STREAM_SPORT } from "@/lib/sports"
import { toast } from "@/hooks/use-toast"

export default function PublisherDashboard() {
  const { userProfile } = useAuth()
  const router = useRouter()
  const [currentStream, setCurrentStream] = useState<StreamSession | null>(null)
  const [broadcastScheduledCall, setBroadcastScheduledCall] = useState<ScheduledCall | null>(null)
  const previousActiveStatus = useRef<boolean | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [signOutWhileLiveOpen, setSignOutWhileLiveOpen] = useState(false)

  // Monitor for real-time changes to active status
  useEffect(() => {
    if (userProfile && previousActiveStatus.current !== null) {
      // Status changed
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
    setMenuOpen(false)
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
      <div className="min-h-screen bg-background">
        <AlertDialog open={signOutWhileLiveOpen} onOpenChange={setSignOutWhileLiveOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>End your broadcast first</AlertDialogTitle>
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

        {/* Header */}
        <header className="border-b bg-card">
          <div className="container mx-auto px-4 py-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-4 min-w-0">
                <Broadcast className="h-6 w-6 flex-shrink-0" />
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold truncate">Publisher Dashboard</h1>
                  <p className="text-sm sm:text-base text-muted-foreground truncate">
                    Welcome back, {userProfile?.displayName || userProfile?.email}
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                {currentStream && (
                  <div className="flex items-center space-x-2 px-3 py-1.5 bg-red-100 dark:bg-red-900 rounded-full w-full sm:w-auto justify-center sm:justify-start">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0"></div>
                    <span className="text-xs sm:text-sm font-medium text-red-700 dark:text-red-300 truncate">
                      LIVE
                      {currentStream.sport && currentStream.sport !== DEFAULT_STREAM_SPORT
                        ? ` · ${currentStream.sport}`
                        : ""}
                      : {currentStream.title}
                    </span>
                  </div>
                )}
                <Button variant="outline" onClick={requestSignOut} className="hidden sm:flex flex-1 sm:flex-initial">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </Button>
                <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="icon" type="button" className="sm:hidden shrink-0" aria-label="Open menu">
                      <Menu className="h-4 w-4" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="rounded-t-2xl">
                    <SheetHeader>
                      <SheetTitle>Menu</SheetTitle>
                    </SheetHeader>
                    <div className="py-4">
                      <Button variant="outline" className="w-full justify-start" onClick={requestSignOut}>
                        <LogOut className="h-4 w-4 mr-2" />
                        Sign Out
                      </Button>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
          {/* Check if user is inactive */}
          {userProfile && !userProfile.isActive ? (
            <Card className="border-destructive">
              <CardHeader>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="p-3 rounded-full bg-destructive/10 flex-shrink-0">
                    <UserX className="h-6 w-6 sm:h-8 sm:w-8 text-destructive" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-xl sm:text-2xl">Account Inactive</CardTitle>
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

                <div className="space-y-2 text-muted-foreground">
                  <p>
                    Your account has been deactivated by an administrator. This means:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>You cannot start or manage streams</li>
                    <li>All your publishing features are temporarily disabled</li>
                  </ul>
                  <p className="mt-4 font-medium">
                    Please contact your administrator to reactivate your account.
                  </p>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button variant="outline" onClick={requestSignOut} className="hidden sm:inline-flex">
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            // Active user — scheduled rooms + existing stream controls
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
    </ProtectedRoute>
  )
}

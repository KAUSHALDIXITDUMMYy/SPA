"use client"

import { ProtectedRoute } from "@/components/auth/protected-route"
import { RealTimeStreams } from "@/components/subscriber/real-time-streams"
import { TodaysSchedule } from "@/components/subscriber/todays-schedule"
import { SubscriberScheduledCalls } from "@/components/subscriber/scheduled-calls-subscriber"
import { SubscriberNotifications } from "@/components/subscriber/subscriber-notifications"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { signOut } from "@/lib/auth"
import { useAuth } from "@/hooks/use-auth"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { Radio, LogOut, AlertTriangle, UserX, Calendar, Bell, Phone, KeyRound } from "lucide-react"
import { ChangePasswordDialog } from "@/components/subscriber/change-password-dialog"
import { SubscriberDashboardProvider } from "@/hooks/use-subscriber-dashboard"
import { toast } from "@/hooks/use-toast"

const NAV_ITEMS = [
  { id: "streams", label: "Streams", Icon: Radio },
  { id: "scheduled-calls", label: "Calls", Icon: Phone },
  { id: "notifications", label: "Alerts", Icon: Bell },
  { id: "schedule", label: "Schedule", Icon: Calendar },
] as const

export default function SubscriberDashboard() {
  const { user, userProfile } = useAuth()
  const router = useRouter()
  const previousActiveStatus = useRef<boolean | null>(null)
  const [activeTab, setActiveTab] = useState("streams")

  useEffect(() => {
    if (userProfile && previousActiveStatus.current !== null) {
      if (userProfile.isActive !== previousActiveStatus.current) {
        if (userProfile.isActive) {
          toast({
            title: "Account Activated",
            description: "Your account has been reactivated by an administrator. You can now access all content.",
            variant: "default",
          })
        } else {
          toast({
            title: "Account Deactivated",
            description: "Your account has been deactivated by an administrator. You can no longer access content.",
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

  return (
    <ProtectedRoute allowedRoles={["subscriber"]}>
      <div className="min-h-screen bg-background flex">
        {/* Sidebar */}
        <aside className="hidden md:flex flex-col w-56 border-r border-border bg-sidebar shrink-0">
          {/* Logo/Hub area */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center">
                <Radio className="h-4 w-4 text-accent" />
              </div>
              <div>
                <p className="font-mono text-sm font-bold text-foreground tracking-wide">HUB</p>
                <p className="text-xs text-primary font-mono">LIVE SESSION ACTIVE</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-1">
            {NAV_ITEMS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="font-mono tracking-wide">{label}</span>
              </button>
            ))}
          </nav>

          {/* Bottom actions */}
          <div className="p-3 border-t border-border space-y-2">
            <ChangePasswordDialog>
              <button className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-mono tracking-wide">
                <KeyRound className="h-3.5 w-3.5" />
                CHANGE PASSWORD
              </button>
            </ChangePasswordDialog>
            <button
              onClick={handleSignOut}
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
                <Radio className="h-5 w-5 text-primary" />
                <span className="font-mono font-bold text-sm tracking-wide">SPA</span>
              </div>
              <div className="flex items-center gap-2">
                <ChangePasswordDialog>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <KeyRound className="h-4 w-4" />
                  </Button>
                </ChangePasswordDialog>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {/* Mobile nav tabs */}
            <nav className="flex gap-1 mt-3 overflow-x-auto">
              {NAV_ITEMS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-mono tracking-wide whitespace-nowrap transition-colors ${
                    activeTab === id
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </nav>
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
                      Your account is currently inactive. You are unable to access streams and content at this time.
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-2 text-muted-foreground text-sm">
                    <p>Your account has been deactivated by an administrator. This means:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>You cannot listen to any audio streams</li>
                      <li>All your assigned content is temporarily hidden</li>
                    </ul>
                    <p className="mt-4 font-medium text-foreground">
                      Please contact your administrator to reactivate your account.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : user?.uid ? (
              <SubscriberDashboardProvider subscriberId={user.uid}>
                <div className="space-y-6">
                  {activeTab === "streams" && <RealTimeStreams />}
                  {activeTab === "scheduled-calls" && <SubscriberScheduledCalls userId={user.uid} />}
                  {activeTab === "notifications" && <SubscriberNotifications />}
                  {activeTab === "schedule" && <TodaysSchedule />}
                </div>
              </SubscriberDashboardProvider>
            ) : null}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  )
}

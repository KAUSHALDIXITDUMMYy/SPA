"use client"

import { ProtectedRoute } from "@/components/auth/protected-route"
import { UserManagement } from "@/components/admin/user-management"
import { AdminAnalytics } from "@/components/admin/admin-analytics"
import { Button } from "@/components/ui/button"
import { signOut } from "@/lib/auth"
import { logoutAllUsers } from "@/lib/admin"
import { useAuth } from "@/hooks/use-auth"
import { isShadowAdmin, KEVIONICS_PRODUCT_NAME } from "@/lib/tenant"
import { useRouter } from "next/navigation"
import {
  Settings,
  Users,
  Shield,
  LogOut,
  BarChart3,
  UserX,
  Calendar,
  Mail,
  Flag,
  Bell,
  Radio,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react"
import { SubscriberAssignments } from "@/components/admin/subscriber-assignments"
import { StreamAssignments } from "@/components/admin/stream-assignments"
import { TodaysScheduleAdmin } from "@/components/admin/todays-schedule"
import { ScheduledCallsAdmin } from "@/components/admin/scheduled-calls-admin"
import { ContactMessages } from "@/components/admin/contact-messages"
import { ReportsModeration } from "@/components/admin/reports-moderation"
import { AdminBroadcasts } from "@/components/admin/admin-broadcasts"
import { ActiveRoomsAdmin } from "@/components/admin/active-rooms-admin"
import { useState, useEffect } from "react"
import { toast } from "@/hooks/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

const ADMIN_SECTIONS: { value: string; label: string; Icon: LucideIcon }[] = [
  { value: "users", label: "Users", Icon: Users },
  { value: "live-rooms", label: "Live Rooms", Icon: Radio },
  { value: "analytics", label: "Analytics", Icon: BarChart3 },
  { value: "assignments", label: "Publishers", Icon: Shield },
  { value: "stream-assignments", label: "Streams", Icon: Settings },
  { value: "schedule", label: "Schedule", Icon: Calendar },
  { value: "contact", label: "Contact", Icon: Mail },
  { value: "reports", label: "Reports", Icon: Flag },
  { value: "notifications", label: "Alerts", Icon: Bell },
]

export default function AdminDashboard() {
  const { userProfile } = useAuth()
  const router = useRouter()
  const [logoutAllLoading, setLogoutAllLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("users")
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)")
    const onChange = () => {
      if (mq.matches) setMobileNavOpen(false)
    }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  const handleSignOut = async () => {
    await signOut()
    router.push("/")
  }

  const handleLogoutAll = async () => {
    setLogoutAllLoading(true)
    try {
      const result = await logoutAllUsers(userProfile)
      if (result.success) {
        toast({
          title: "Success",
          description: `Successfully logged out ${result.count} user(s). They can now log in from any browser.`,
        })
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to log out all users",
          variant: "destructive",
        })
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to log out all users",
        variant: "destructive",
      })
    } finally {
      setLogoutAllLoading(false)
    }
  }

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <div className="min-h-screen bg-background flex">
        {/* Sidebar - Desktop */}
        <aside className="hidden md:flex flex-col w-56 border-r border-border bg-sidebar shrink-0">
          {/* Admin identity */}
          <div className="p-4 border-b border-border">
            <h1 className="font-mono text-sm font-bold tracking-widest text-foreground">AUDIO_CORE</h1>
            <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
              {userProfile && isShadowAdmin(userProfile)
                ? KEVIONICS_PRODUCT_NAME.toUpperCase()
                : "ADMIN PANEL"}
            </p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {ADMIN_SECTIONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                onClick={() => setActiveTab(value)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === value
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="font-mono tracking-wide">{label}</span>
              </button>
            ))}
          </nav>

          {/* Bottom section */}
          <div className="p-3 border-t border-border space-y-1">
            <button
              onClick={() => router.push("/admin/access-logs")}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-mono tracking-wide"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              ACCESS LOGS
            </button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  disabled={logoutAllLoading}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-destructive hover:text-destructive/80 transition-colors font-mono tracking-wide disabled:opacity-50"
                >
                  <UserX className="h-3.5 w-3.5" />
                  {logoutAllLoading ? "LOGGING OUT..." : "LOGOUT ALL"}
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-mono uppercase">Logout All Users?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {userProfile && isShadowAdmin(userProfile)
                      ? "This clears active subscriber sessions only for Kevionics (@kevionics.com) accounts."
                      : "This clears active subscriber sessions for main-tenant accounts only (not Kevionics shadow subscribers)."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleLogoutAll} disabled={logoutAllLoading}>
                    {logoutAllLoading ? "Logging out..." : "Confirm"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-mono tracking-wide"
            >
              <LogOut className="h-3.5 w-3.5" />
              SIGN OUT
            </button>
          </div>
        </aside>

        {/* Main area */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Mobile Header */}
          <header className="md:hidden border-b border-border bg-card px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                <span className="font-mono font-bold text-sm tracking-wide">AUDIO_CORE</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMobileNavOpen(!mobileNavOpen)}>
                  <Settings className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Mobile nav - collapsible */}
            {mobileNavOpen && (
              <nav className="flex flex-wrap gap-1 mt-3 pb-1">
                {ADMIN_SECTIONS.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    onClick={() => {
                      setActiveTab(value)
                      setMobileNavOpen(false)
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-mono tracking-wide whitespace-nowrap transition-colors ${
                      activeTab === value
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground bg-secondary/50"
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </button>
                ))}
              </nav>
            )}

            {/* Active section indicator */}
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs font-mono text-primary tracking-wider">
                {ADMIN_SECTIONS.find((s) => s.value === activeTab)?.label?.toUpperCase()}
              </span>
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
            {activeTab === "users" && <UserManagement />}
            {activeTab === "live-rooms" && <ActiveRoomsAdmin />}
            {activeTab === "analytics" && <AdminAnalytics />}
            {activeTab === "assignments" && <SubscriberAssignments />}
            {activeTab === "stream-assignments" && <StreamAssignments active={activeTab === "stream-assignments"} />}
            {activeTab === "schedule" && (
              <div className="space-y-8">
                <TodaysScheduleAdmin />
                <ScheduledCallsAdmin />
              </div>
            )}
            {activeTab === "contact" && <ContactMessages />}
            {activeTab === "reports" && <ReportsModeration />}
            {activeTab === "notifications" && <AdminBroadcasts />}
          </main>
        </div>
      </div>
    </ProtectedRoute>
  )
}

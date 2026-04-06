"use client"

import { ProtectedRoute } from "@/components/auth/protected-route"
import { UserManagement } from "@/components/admin/user-management"
import { AdminAnalytics } from "@/components/admin/admin-analytics"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { signOut } from "@/lib/auth"
import { logoutAllUsers } from "@/lib/admin"
import { useAuth } from "@/hooks/use-auth"
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
  Menu,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

const ADMIN_SECTIONS: { value: string; label: string; Icon: LucideIcon }[] = [
  { value: "users", label: "User Management", Icon: Users },
  { value: "live-rooms", label: "Live rooms", Icon: Radio },
  { value: "analytics", label: "Analytics", Icon: BarChart3 },
  { value: "assignments", label: "Publisher Assignments", Icon: Shield },
  { value: "stream-assignments", label: "Stream Assignments", Icon: Settings },
  { value: "schedule", label: "Today's Schedule", Icon: Calendar },
  { value: "contact", label: "Contact", Icon: Mail },
  { value: "reports", label: "Reports", Icon: Flag },
  { value: "notifications", label: "Notifications", Icon: Bell },
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

  const activeSectionLabel = ADMIN_SECTIONS.find((s) => s.value === activeTab)?.label ?? "Admin"

  const handleSignOut = async () => {
    await signOut()
    router.push("/")
  }

  const handleLogoutAll = async () => {
    setLogoutAllLoading(true)
    try {
      const result = await logoutAllUsers()
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
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b bg-card">
          <div className="container mx-auto px-4 py-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <Settings className="h-6 w-6 flex-shrink-0 mt-1" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <h1 className="text-xl sm:text-2xl font-bold truncate">Admin Dashboard</h1>
                    <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                      <SheetTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="md:hidden shrink-0 h-9 w-9"
                          aria-label="Open admin sections menu"
                          aria-expanded={mobileNavOpen}
                        >
                          <Menu className="h-5 w-5" />
                        </Button>
                      </SheetTrigger>
                      <SheetContent
                        side="bottom"
                        className="max-h-[min(85vh,32rem)] rounded-t-2xl flex flex-col gap-0 p-0"
                      >
                        <SheetHeader className="text-left space-y-1 px-4 pt-4 pb-3 border-b shrink-0">
                          <SheetTitle>Jump to section</SheetTitle>
                          <SheetDescription>Choose an admin area</SheetDescription>
                        </SheetHeader>
                        <nav
                          className="flex flex-col gap-0.5 overflow-y-auto px-2 py-3 pb-6"
                          aria-label="Admin sections"
                        >
                          {ADMIN_SECTIONS.map(({ value, label, Icon }) => (
                            <Button
                              key={value}
                              type="button"
                              variant={activeTab === value ? "secondary" : "ghost"}
                              className="w-full justify-start gap-3 h-12 px-3 text-base font-normal"
                              onClick={() => {
                                setActiveTab(value)
                                setMobileNavOpen(false)
                              }}
                            >
                              <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                              {label}
                            </Button>
                          ))}
                        </nav>
                      </SheetContent>
                    </Sheet>
                  </div>
                  <p className="text-sm sm:text-base text-muted-foreground truncate">
                    Welcome back, {userProfile?.displayName || userProfile?.email}
                  </p>
                  <p className="md:hidden text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{activeSectionLabel}</span>
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={logoutAllLoading} className="w-full sm:w-auto">
                      <UserX className="h-4 w-4 mr-2" />
                      <span className="hidden sm:inline">{logoutAllLoading ? "Logging out..." : "Logout All Users"}</span>
                      <span className="sm:hidden">{logoutAllLoading ? "Logging out..." : "Logout All"}</span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="mx-4 max-w-[calc(100vw-2rem)]">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Logout All Users?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will clear all active sessions and allow users to log in from any browser. 
                        This is useful before starting a new stream session. All users will need to log in again.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                      <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleLogoutAll} disabled={logoutAllLoading} className="w-full sm:w-auto">
                        {logoutAllLoading ? "Logging out..." : "Logout All Users"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button variant="outline" onClick={handleSignOut} className="w-full sm:w-auto">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 sm:space-y-6">
            <TabsList className="hidden md:grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-9 h-auto gap-1">
              <TabsTrigger value="users" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-1.5 text-xs sm:text-sm">
                <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">User Management</span>
                <span className="xs:hidden">Users</span>
              </TabsTrigger>
              <TabsTrigger value="live-rooms" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-1.5 text-xs sm:text-sm">
                <Radio className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Live rooms</span>
                <span className="xs:hidden">Live</span>
              </TabsTrigger>
              <TabsTrigger value="analytics" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-1.5 text-xs sm:text-sm">
                <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4" />
                <span>Analytics</span>
              </TabsTrigger>
              <TabsTrigger value="assignments" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-1.5 text-xs sm:text-sm">
                <Shield className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Publisher Assignments</span>
                <span className="xs:hidden">Publishers</span>
              </TabsTrigger>
              <TabsTrigger value="stream-assignments" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-1.5 text-xs sm:text-sm">
                <Settings className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Stream Assignments</span>
                <span className="xs:hidden">Streams</span>
              </TabsTrigger>
              <TabsTrigger value="schedule" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-1.5 text-xs sm:text-sm">
                <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Today&apos;s Schedule</span>
                <span className="xs:hidden">Schedule</span>
              </TabsTrigger>
              <TabsTrigger value="contact" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-1.5 text-xs sm:text-sm">
                <Mail className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Contact</span>
                <span className="xs:hidden">Contact</span>
              </TabsTrigger>
              <TabsTrigger value="reports" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-1.5 text-xs sm:text-sm">
                <Flag className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Reports</span>
                <span className="xs:hidden">Reports</span>
              </TabsTrigger>
              <TabsTrigger value="notifications" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-1.5 text-xs sm:text-sm">
                <Bell className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Notifications</span>
                <span className="xs:hidden">Notify</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="users">
              <UserManagement />
            </TabsContent>

            <TabsContent value="live-rooms">
              <ActiveRoomsAdmin />
            </TabsContent>

            <TabsContent value="analytics">
              <AdminAnalytics />
            </TabsContent>

            <TabsContent value="assignments">
              <SubscriberAssignments />
            </TabsContent>

            <TabsContent value="stream-assignments">
              <StreamAssignments />
            </TabsContent>

            <TabsContent value="schedule">
              <div className="space-y-8">
                <TodaysScheduleAdmin />
                <ScheduledCallsAdmin />
              </div>
            </TabsContent>

            <TabsContent value="contact">
              <ContactMessages />
            </TabsContent>

            <TabsContent value="reports">
              <ReportsModeration />
            </TabsContent>

            <TabsContent value="notifications">
              <AdminBroadcasts />
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </ProtectedRoute>
  )
}

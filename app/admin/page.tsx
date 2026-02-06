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
import { Settings, Users, Shield, LogOut, BarChart3, UserX, Calendar } from "lucide-react"
import { SubscriberAssignments } from "@/components/admin/subscriber-assignments"
import { StreamAssignments } from "@/components/admin/stream-assignments"
import { TodaysScheduleAdmin } from "@/components/admin/todays-schedule"
import { useState } from "react"
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

export default function AdminDashboard() {
  const { userProfile } = useAuth()
  const router = useRouter()
  const [logoutAllLoading, setLogoutAllLoading] = useState(false)

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
              <div className="flex items-center space-x-4">
                <Settings className="h-6 w-6 flex-shrink-0" />
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold truncate">Admin Dashboard</h1>
                  <p className="text-sm sm:text-base text-muted-foreground truncate">
                    Welcome back, {userProfile?.displayName || userProfile?.email}
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
          <Tabs defaultValue="users" className="space-y-4 sm:space-y-6">
            <TabsList className="grid w-full grid-cols-5 h-auto">
              <TabsTrigger value="users" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-1.5 text-xs sm:text-sm">
                <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">User Management</span>
                <span className="xs:hidden">Users</span>
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
            </TabsList>

            <TabsContent value="users">
              <UserManagement />
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
              <TodaysScheduleAdmin />
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </ProtectedRoute>
  )
}

"use client"

import { ProtectedRoute } from "@/components/auth/protected-route"
import { StreamControls } from "@/components/publisher/stream-controls"
import { StreamHistory } from "@/components/publisher/stream-history"
import { PublisherAnalytics } from "@/components/publisher/publisher-analytics"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { signOut } from "@/lib/auth"
import { useAuth } from "@/hooks/use-auth"
import { useRouter } from "next/navigation"
import { useState, useEffect, useRef } from "react"
import { Podcast as Broadcast, History, LogOut, Radio, BarChart3, AlertTriangle, UserX } from "lucide-react"
import type { StreamSession } from "@/lib/streaming"
import { toast } from "@/hooks/use-toast"

export default function PublisherDashboard() {
  const { userProfile } = useAuth()
  const router = useRouter()
  const [currentStream, setCurrentStream] = useState<StreamSession | null>(null)
  const previousActiveStatus = useRef<boolean | null>(null)

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
    await signOut()
    router.push("/")
  }

  const handleStreamStart = (session: StreamSession) => {
    setCurrentStream(session)
  }

  const handleStreamEnd = () => {
    setCurrentStream(null)
  }

  return (
    <ProtectedRoute allowedRoles={["publisher"]}>
      <div className="min-h-screen bg-background">
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
                      LIVE: {currentStream.title}
                    </span>
                  </div>
                )}
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
                    <li>You cannot access analytics</li>
                    <li>All your publishing features are temporarily disabled</li>
                  </ul>
                  <p className="mt-4 font-medium">
                    Please contact your administrator to reactivate your account.
                  </p>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button variant="outline" onClick={handleSignOut}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            // Active user - show normal content
            <Tabs defaultValue="stream" className="space-y-4 sm:space-y-6">
              <TabsList className="grid w-full grid-cols-3 h-auto">
                <TabsTrigger value="stream" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-1.5 text-xs sm:text-sm">
                  <Radio className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden xs:inline">Audio Stream</span>
                  <span className="xs:hidden">Stream</span>
                </TabsTrigger>
                <TabsTrigger value="analytics" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-1.5 text-xs sm:text-sm">
                  <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span>Analytics</span>
                </TabsTrigger>
                <TabsTrigger value="history" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-1.5 text-xs sm:text-sm">
                  <History className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden xs:inline">Stream History</span>
                  <span className="xs:hidden">History</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="stream" forceMount>
                <StreamControls onStreamStart={handleStreamStart} onStreamEnd={handleStreamEnd} />
              </TabsContent>

              <TabsContent value="analytics">
                <PublisherAnalytics />
              </TabsContent>

              <TabsContent value="history">
                <StreamHistory />
              </TabsContent>
            </Tabs>
          )}
        </main>
      </div>
    </ProtectedRoute>
  )
}

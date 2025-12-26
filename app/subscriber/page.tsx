"use client"

import { ProtectedRoute } from "@/components/auth/protected-route"
import { RealTimeStreams } from "@/components/subscriber/real-time-streams"
import { SubscriberZoomCalls } from "@/components/subscriber/zoom-calls"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { signOut } from "@/lib/auth"
import { useAuth } from "@/hooks/use-auth"
import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"
import { Radio, LogOut, Headphones, AlertTriangle, UserX } from "lucide-react"
import { toast } from "@/hooks/use-toast"

export default function SubscriberDashboard() {
  const { userProfile } = useAuth()
  const router = useRouter()
  const previousActiveStatus = useRef<boolean | null>(null)

  // Monitor for real-time changes to active status
  useEffect(() => {
    if (userProfile && previousActiveStatus.current !== null) {
      // Status changed
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
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b bg-card">
          <div className="container mx-auto px-4 py-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-4 min-w-0">
                <Radio className="h-6 w-6 flex-shrink-0" />
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold truncate">Subscriber Dashboard</h1>
                  <p className="text-sm sm:text-base text-muted-foreground truncate">
                    Welcome back, {userProfile?.displayName || userProfile?.email}
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={handleSignOut} className="w-full sm:w-auto">
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
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
                    Your account is currently inactive. You are unable to access streams and content at this time.
                  </AlertDescription>
                </Alert>

                <div className="space-y-2 text-muted-foreground">
                  <p>
                    Your account has been deactivated by an administrator. This means:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>You cannot listen to any audio streams</li>
                    <li>You cannot join any Zoom calls</li>
                    <li>All your assigned content is temporarily hidden</li>
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
            <Tabs defaultValue="streams" className="space-y-4 sm:space-y-6">
              <TabsList className="grid w-full grid-cols-2 h-auto">
                <TabsTrigger value="streams" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-1.5 text-xs sm:text-sm">
                  <Radio className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span>Audio Streams</span>
                </TabsTrigger>
                <TabsTrigger value="zoom" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-1.5 text-xs sm:text-sm">
                  <Headphones className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span>Zoom Calls</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="streams">
                <RealTimeStreams />
              </TabsContent>

              <TabsContent value="zoom">
                <SubscriberZoomCalls />
              </TabsContent>
            </Tabs>
          )}
        </main>
      </div>
    </ProtectedRoute>
  )
}

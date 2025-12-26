"use client"

import { useAuth } from "@/hooks/use-auth"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function Dashboard() {
  const { userProfile, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && userProfile) {
      // Redirect based on user role
      switch (userProfile.role) {
        case "admin":
          router.push("/admin")
          break
        case "publisher":
          router.push("/publisher")
          break
        case "subscriber":
          router.push("/subscriber")
          break
        default:
          router.push("/")
      }
    }
  }, [userProfile, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Redirecting...</p>
      </div>
    </div>
  )
}

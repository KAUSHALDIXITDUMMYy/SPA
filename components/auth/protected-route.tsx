"use client"

import type React from "react"

import { useAuth } from "@/hooks/use-auth"
import type { UserRole } from "@/lib/auth"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: UserRole[]
  redirectTo?: string
}

export function ProtectedRoute({ children, allowedRoles = [], redirectTo = "/" }: ProtectedRouteProps) {
  const { user, userProfile, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push(redirectTo)
        return
      }

      // Require Terms/EULA acceptance (app store compliance)
      if (userProfile && !userProfile.termsAcceptedAt) {
        const currentPath = typeof window !== "undefined" ? window.location.pathname : ""
        router.push(`/terms?redirect=${encodeURIComponent(currentPath || "/dashboard")}`)
        return
      }

      if (allowedRoles.length > 0 && userProfile && !allowedRoles.includes(userProfile.role)) {
        router.push("/unauthorized")
        return
      }
    }
  }, [user, userProfile, loading, router, allowedRoles, redirectTo])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user || (allowedRoles.length > 0 && userProfile && !allowedRoles.includes(userProfile.role)) || (userProfile && !userProfile.termsAcceptedAt)) {
    return null
  }

  return <>{children}</>
}

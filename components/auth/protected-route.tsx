"use client"

import type React from "react"

import { useAuth } from "@/hooks/use-auth"
import type { UserRole } from "@/lib/auth"
import { isMfaVerifiedThisSession } from "@/lib/mfa-client"
import { subscriberMustChangePassword } from "@/lib/account"
import { ENFORCE_PLAYER_2FA } from "@/lib/config"
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

      // Mandatory 2FA for subscribers.
      if (ENFORCE_PLAYER_2FA && userProfile && userProfile.role === "subscriber" && user) {
        const currentPath = typeof window !== "undefined" ? window.location.pathname : ""
        // Not enrolled yet → force setup (but allow the security page itself).
        if (!userProfile.totpEnabled && currentPath !== "/security") {
          router.push("/security?setup=required")
          return
        }
        // Enrolled but this browser session hasn't passed the code challenge.
        if (userProfile.totpEnabled && !isMfaVerifiedThisSession(user.uid)) {
          router.push("/")
          return
        }
      }

      // Force subscribers to set their own password before using the app.
      if (user && subscriberMustChangePassword(userProfile, user.uid)) {
        const currentPath = typeof window !== "undefined" ? window.location.pathname : ""
        if (currentPath !== "/change-password") {
          router.push("/change-password")
          return
        }
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

  const currentPath = typeof window !== "undefined" ? window.location.pathname : ""
  const isSubscriber2fa = ENFORCE_PLAYER_2FA && !!userProfile && userProfile.role === "subscriber" && !!user
  const needsSetup = isSubscriber2fa && !userProfile!.totpEnabled && currentPath !== "/security"
  const needsMfa = isSubscriber2fa && !!userProfile!.totpEnabled && !isMfaVerifiedThisSession(user!.uid)
  const needsPasswordChange =
    !!user && subscriberMustChangePassword(userProfile, user.uid) && currentPath !== "/change-password"

  if (
    !user ||
    (allowedRoles.length > 0 && userProfile && !allowedRoles.includes(userProfile.role)) ||
    (userProfile && !userProfile.termsAcceptedAt) ||
    needsSetup ||
    needsMfa ||
    needsPasswordChange
  ) {
    return null
  }

  return <>{children}</>
}

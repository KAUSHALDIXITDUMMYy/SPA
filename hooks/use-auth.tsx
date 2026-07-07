"use client"

import type React from "react"

import { useState, useEffect, createContext, useContext } from "react"
import type { User } from "firebase/auth"
import { onAuthStateChange, getUserProfile, signOut, heartbeatSession, type UserProfile } from "@/lib/auth"
import { useRouter } from "next/navigation"
import { toast } from "@/hooks/use-toast"
import { startPoll } from "@/lib/client/poll"

interface AuthContextType {
  user: User | null
  userProfile: UserProfile | null
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (user) => {
      setUser(user)

      if (user) {
        // Sync role into JWT custom claims so Firestore rules recognize admin/publisher/subscriber.
        try {
          const { fetchWithAuth } = await import("@/lib/client/authenticated-fetch")
          const res = await fetchWithAuth("/api/auth/sync-claims", { method: "POST" })
          if (res.ok) {
            await user.getIdToken(true)
          }
        } catch {
          // Non-fatal — rules fall back to Firestore profile role.
        }

        const profile = await getUserProfile(user.uid)
        setUserProfile(profile)
      } else {
        setUserProfile(null)
      }

      setLoading(false)
    })

    return unsubscribe
  }, [])

  // Poll for user profile changes (isActive status, etc.). Replaces the Firestore
  // realtime listener so the browser never reads the users collection directly.
  useEffect(() => {
    if (!user) {
      return
    }

    let active = true
    const refresh = async () => {
      const profile = await getUserProfile(user.uid)
      if (!active || !profile) return

      setUserProfile(profile)

      // For subscribers - check if user is still active
      if (profile.role === "subscriber" && !profile.isActive) {
        toast({
          title: "Account Deactivated",
          description: "Your account has been deactivated by an administrator.",
          variant: "destructive",
        })
        signOut().then(() => {
          router.push("/")
        })
      }
    }

    // Visibility-aware: pauses while the tab is hidden (background tabs were
    // multiplying the users-collection read cost). Refreshes on return.
    const stop = startPoll(() => void refresh(), 30000)
    return () => {
      active = false
      stop()
    }
  }, [user, router])

  // Periodically update lastLoginAt to keep session alive for subscribers
  useEffect(() => {
    if (!user || !userProfile || userProfile.role !== "subscriber") {
      return
    }

    // Keep the single-session marker alive via the backend (no direct Firestore writes).
    const interval = setInterval(() => {
      void heartbeatSession()
    }, 3 * 60 * 1000)

    return () => clearInterval(interval)
  }, [user, userProfile])

  // Auto-logout when tab is closed (for subscribers)
  useEffect(() => {
    if (!user || !userProfile || userProfile.role !== "subscriber") {
      return
    }

    // On tab close we can only reliably clear local state. The backend single-session
    // logic treats a session with no recent heartbeat as expired (~5 min), so another
    // browser can take over shortly after — matching the existing behavior/message.
    const handleBeforeUnload = (_event: BeforeUnloadEvent) => {
      if (typeof window !== "undefined") {
        localStorage.removeItem("sessionId")
      }
    }

    const handlePageHide = (event: PageTransitionEvent) => {
      if (event.persisted) {
        // Page is being cached (e.g., back/forward navigation)
        return
      }
      if (typeof window !== "undefined") {
        localStorage.removeItem("sessionId")
      }
    }

    // Add both event listeners for maximum compatibility
    window.addEventListener("beforeunload", handleBeforeUnload)
    window.addEventListener("pagehide", handlePageHide)

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
      window.removeEventListener("pagehide", handlePageHide)
    }
  }, [user, userProfile])

  return <AuthContext.Provider value={{ user, userProfile, loading }}>{children}</AuthContext.Provider>
}

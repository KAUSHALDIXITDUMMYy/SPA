"use client"

import type React from "react"

import { useState, useEffect, createContext, useContext, useRef } from "react"
import type { User } from "firebase/auth"
import {
  onAuthStateChange,
  getUserProfile,
  signOut,
  heartbeatSession,
  isLocalSessionStale,
  type UserProfile,
} from "@/lib/auth"
import { getLocalSessionId } from "@/lib/client/authenticated-fetch"
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
  const kickingRef = useRef(false)

  const forceLocalSignOut = async (message: string) => {
    if (kickingRef.current) return
    kickingRef.current = true
    toast({
      title: "Signed out",
      description: message,
      variant: "destructive",
    })
    await signOut({ clearServerSession: false })
    setUserProfile(null)
    router.push("/")
    kickingRef.current = false
  }

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
        if (profile?.role === "subscriber") {
          const local = getLocalSessionId()
          // Only kick when we have a local session that no longer matches (another device won).
          // Missing local right after Firebase sign-in is OK — establishSession is still running.
          if (local && profile.sessionId && profile.sessionId !== local) {
            await forceLocalSignOut(
              "This account was signed in on another device or browser. Only one login is allowed.",
            )
            setLoading(false)
            return
          }
        }
        setUserProfile(profile)
      } else {
        setUserProfile(null)
      }

      setLoading(false)
    })

    return unsubscribe
  }, [])

  // Poll for user profile changes (isActive, session takeover). Replaces the Firestore
  // realtime listener so the browser never reads the users collection directly.
  useEffect(() => {
    if (!user) {
      return
    }

    let active = true
    const refresh = async () => {
      const profile = await getUserProfile(user.uid)
      if (!active) return

      if (!profile) {
        return
      }

      setUserProfile(profile)

      if (profile.role === "subscriber" && !profile.isActive) {
        toast({
          title: "Account Deactivated",
          description: "Your account has been deactivated by an administrator.",
          variant: "destructive",
        })
        await signOut()
        router.push("/")
        return
      }

      if (isLocalSessionStale(profile)) {
        await forceLocalSignOut(
          "This account was signed in on another device or browser. Only one login is allowed.",
        )
      }
    }

    // Visibility-aware: pauses while the tab is hidden (background tabs were
    // multiplying the users-collection read cost). Refreshes on return.
    const stop = startPoll(() => void refresh(), 15000)
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

    const interval = setInterval(() => {
      void heartbeatSession()
    }, 3 * 60 * 1000)

    return () => clearInterval(interval)
  }, [user, userProfile])

  return <AuthContext.Provider value={{ user, userProfile, loading }}>{children}</AuthContext.Provider>
}

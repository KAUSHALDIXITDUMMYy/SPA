"use client"

import type React from "react"

import { useState, useEffect, createContext, useContext } from "react"
import type { User } from "firebase/auth"
import { onAuthStateChange, getUserProfile, signOut, type UserProfile } from "@/lib/auth"
import { doc, onSnapshot } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useRouter } from "next/navigation"
import { toast } from "@/hooks/use-toast"

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
        const profile = await getUserProfile(user.uid)
        setUserProfile(profile)
      } else {
        setUserProfile(null)
      }

      setLoading(false)
    })

    return unsubscribe
  }, [])

  // Real-time listener for user profile changes (isActive status, etc.)
  useEffect(() => {
    if (!user) {
      return
    }

    const userRef = doc(db, "users", user.uid)
    const unsubscribe = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as UserProfile
        
        // Convert Firestore timestamp to Date if needed
        const profile: UserProfile = {
          ...data,
          createdAt: data.createdAt instanceof Date ? data.createdAt : (data.createdAt as any).toDate?.() || new Date(),
          lastLoginAt: data.lastLoginAt instanceof Date ? data.lastLoginAt : (data.lastLoginAt as any)?.toDate?.() || undefined,
        }
        
        // Update profile in real-time
        setUserProfile(profile)
        
        // For subscribers - check if user is still active
        if (profile.role === "subscriber" && !profile.isActive) {
          toast({
            title: "Account Deactivated",
            description: "Your account has been deactivated by an administrator.",
            variant: "destructive",
          })
          
          // Force logout
          signOut().then(() => {
            router.push("/")
          })
        }
      }
    })

    return unsubscribe
  }, [user, router])

  // Periodically update lastLoginAt to keep session alive for subscribers
  useEffect(() => {
    if (!user || !userProfile || userProfile.role !== "subscriber") {
      return
    }

    const updateActivity = async () => {
      try {
        const { doc, updateDoc } = await import("firebase/firestore")
        const { db } = await import("@/lib/firebase")
        const userRef = doc(db, "users", user.uid)
        
        await updateDoc(userRef, {
          lastLoginAt: new Date(),
        })
      } catch (error) {
        console.error("Error updating session activity:", error)
      }
    }

    // Update every minute to keep session alive
    const interval = setInterval(updateActivity, 60 * 1000)

    return () => clearInterval(interval)
  }, [user, userProfile])

  // Auto-logout when tab is closed (for subscribers)
  useEffect(() => {
    if (!user || !userProfile || userProfile.role !== "subscriber") {
      return
    }

    const handleBeforeUnload = async (event: BeforeUnloadEvent) => {
      // Clear session when tab is closed
      try {
        const { doc, updateDoc } = await import("firebase/firestore")
        const { db } = await import("@/lib/firebase")
        const userRef = doc(db, "users", user.uid)
        
        // Use sendBeacon or navigator.sendBeacon for reliable cleanup
        // Since we can't use async/await in beforeunload, we'll use navigator.sendBeacon
        // or just clear localStorage which will be checked on next login
        if (typeof window !== "undefined") {
          localStorage.removeItem("sessionId")
        }
        
        // Clear sessionId in Firestore (non-blocking)
        updateDoc(userRef, {
          sessionId: null,
        }).catch((error) => {
          console.error("Error clearing session on tab close:", error)
        })
      } catch (error) {
        console.error("Error in beforeunload handler:", error)
      }
    }

    const handlePageHide = async (event: PageTransitionEvent) => {
      // Also handle pagehide event (more reliable than beforeunload)
      if (event.persisted) {
        // Page is being cached (e.g., back/forward navigation)
        return
      }
      
      try {
        const { doc, updateDoc } = await import("firebase/firestore")
        const { db } = await import("@/lib/firebase")
        const userRef = doc(db, "users", user.uid)
        
        // Clear sessionId in Firestore
        await updateDoc(userRef, {
          sessionId: null,
        })
        
        // Clear localStorage
        if (typeof window !== "undefined") {
          localStorage.removeItem("sessionId")
        }
      } catch (error) {
        console.error("Error clearing session on page hide:", error)
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

"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { signIn, signOut, getUserProfile, type UserProfile } from "@/lib/auth"
import { useAuth } from "@/hooks/use-auth"
import { MfaChallenge } from "@/components/auth/mfa-challenge"
import { isMfaVerifiedThisSession } from "@/lib/mfa-client"
import { subscriberMustChangePassword } from "@/lib/account"
import { ENFORCE_PLAYER_2FA } from "@/lib/config"

export function LoginForm() {
  const { user, userProfile, loading: authLoading } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [mfaUid, setMfaUid] = useState<string | null>(null)
  const router = useRouter()

  // Decide where to go after credentials are accepted. Subscribers with 2FA
  // enabled must pass the TOTP challenge before leaving the login screen.
  const proceedAfterAuth = (uid: string, profile: UserProfile) => {
    if (ENFORCE_PLAYER_2FA && profile.role === "subscriber") {
      // Mandatory 2FA: a player who hasn't enrolled must set it up first.
      if (!profile.totpEnabled) {
        router.replace("/security?setup=required")
        return
      }
      // Enrolled but this browser session hasn't passed the code challenge yet.
      if (!isMfaVerifiedThisSession(uid)) {
        setMfaUid(uid)
        return
      }
    }
    // Force players to set their own password (all existing + new players, until changed once).
    if (subscriberMustChangePassword(profile, uid)) {
      router.replace("/change-password")
      return
    }
    if (!profile.termsAcceptedAt) {
      router.replace(`/terms?redirect=${encodeURIComponent("/dashboard")}`)
      return
    }
    router.replace("/dashboard")
  }

  // If Firebase already has a session, route appropriately (or show 2FA).
  useEffect(() => {
    if (authLoading) return
    if (!user || !userProfile) return
    if (mfaUid) return
    proceedAfterAuth(user.uid, userProfile)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, userProfile, router, mfaUid])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    const { user, error: signInError } = await signIn(email, password)

    if (signInError) {
      setError(signInError)
    } else if (user) {
      const profile = await getUserProfile(user.uid)
      if (profile) {
        proceedAfterAuth(user.uid, profile)
      } else {
        router.push("/dashboard")
      }
    }

    setLoading(false)
  }

  if (mfaUid) {
    return (
      <MfaChallenge
        uid={mfaUid}
        onVerified={() => router.replace("/dashboard")}
        onCancel={() => {
          setMfaUid(null)
          setPassword("")
        }}
      />
    )
  }

  if (authLoading) {
    return (
      <div className="w-full max-w-md mx-auto border border-accent/40 rounded-lg p-8">
        <div className="space-y-2 mb-6">
          <p className="text-sm font-medium text-foreground">Access Hub</p>
          <h2 className="font-mono text-xl tracking-tight uppercase text-muted-foreground">Checking Session</h2>
        </div>
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-hidden />
        </div>
      </div>
    )
  }

  if (user && userProfile) {
    return (
      <div className="w-full max-w-md mx-auto border border-accent/40 rounded-lg p-8">
        <div className="space-y-2 mb-6">
          <p className="text-sm font-medium text-foreground">Access Hub</p>
          <h2 className="font-mono text-xl tracking-tight uppercase text-muted-foreground">Opening Account</h2>
        </div>
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-hidden />
        </div>
      </div>
    )
  }

  if (user && !userProfile) {
    return (
      <div className="w-full max-w-md mx-auto border border-accent/40 rounded-lg p-8">
        <div className="space-y-2 mb-6">
          <p className="text-sm font-medium text-foreground">Access Hub</p>
          <h2 className="font-mono text-xl tracking-tight uppercase text-muted-foreground">Profile Error</h2>
        </div>
        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertDescription>
              Try signing out and signing in again. If this keeps happening, contact your administrator.
            </AlertDescription>
          </Alert>
          <Button
            type="button"
            variant="outline"
            className="w-full font-mono uppercase tracking-wider"
            onClick={() => signOut().then(() => router.refresh())}
          >
            Sign out and try again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md mx-auto border border-accent/40 rounded-lg p-8">
      <div className="space-y-2 mb-8">
        <p className="text-sm font-medium text-foreground">Access Hub</p>
        <h2 className="font-mono text-xl tracking-tight uppercase text-muted-foreground">Initialize Creator Session</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="email" className="font-mono text-xs tracking-widest uppercase text-muted-foreground">Identity</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="CREATOR_ID"
              className="pl-8 bg-secondary border-border font-mono placeholder:text-muted-foreground/50"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="font-mono text-xs tracking-widest uppercase text-muted-foreground">Passcode</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            className="bg-secondary border-border font-mono placeholder:text-muted-foreground/50"
          />
        </div>

        <Button type="submit" className="w-full font-mono uppercase tracking-wider text-sm font-bold" disabled={loading}>
          {loading ? "Authenticating..." : "Sign In"}
        </Button>
      </form>
    </div>
  )
}

"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { signIn, signOut, getUserProfile, type UserProfile } from "@/lib/auth"
import { useAuth } from "@/hooks/use-auth"
import { MfaChallenge } from "@/components/auth/mfa-challenge"
import { isMfaVerifiedThisSession } from "@/lib/mfa-client"

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
    if (profile.role === "subscriber") {
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
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Sign In</CardTitle>
          <CardDescription>Checking your session…</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-hidden />
        </CardContent>
      </Card>
    )
  }

  if (user && userProfile) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Sign In</CardTitle>
          <CardDescription>Opening your account…</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-hidden />
        </CardContent>
      </Card>
    )
  }

  if (user && !userProfile) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Sign In</CardTitle>
          <CardDescription>We couldn&apos;t load your account profile.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertDescription>
              Try signing out and signing in again. If this keeps happening, contact your administrator.
            </AlertDescription>
          </Alert>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => signOut().then(() => router.refresh())}
          >
            Sign out and try again
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Sign In</CardTitle>
        <CardDescription>Enter your credentials to access Sportsmagician Audio</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { signIn, signOut } from "@/lib/auth"
import { useAuth } from "@/hooks/use-auth"

export function LoginForm() {
  const { user, userProfile, loading: authLoading } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // If Firebase already has a session, skip the login form (stay signed in across visits).
  useEffect(() => {
    if (authLoading) return
    if (!user || !userProfile) return

    if (!userProfile.termsAcceptedAt) {
      router.replace(`/terms?redirect=${encodeURIComponent("/dashboard")}`)
      return
    }
    router.replace("/dashboard")
  }, [authLoading, user, userProfile, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    const { user, error: signInError } = await signIn(email, password)

    if (signInError) {
      setError(signInError)
    } else if (user) {
      // Successfully logged in
      router.push("/dashboard")
    }

    setLoading(false)
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

"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Loader2, ShieldCheck } from "lucide-react"
import { verifyMfaCode, markMfaVerified } from "@/lib/mfa-client"
import { signOut } from "@/lib/auth"

interface MfaChallengeProps {
  uid: string
  onVerified: () => void
  onCancel?: () => void
}

export function MfaChallenge({ uid, onVerified, onCancel }: MfaChallengeProps) {
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const submit = async () => {
    setLoading(true)
    setError("")
    try {
      const result = await verifyMfaCode(code)
      if (result.ok) {
        markMfaVerified(uid)
        onVerified()
      } else {
        setError(result.error || "Incorrect code. Try again.")
        setCode("")
      }
    } catch (e: any) {
      setError(e.message || "Verification failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Two-Factor Verification
        </CardTitle>
        <CardDescription>Enter the 6-digit code from your authenticator app to finish signing in.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-center">
          <InputOTP
            maxLength={6}
            value={code}
            onChange={setCode}
            onComplete={(value) => {
              if (value.length === 6 && !loading) submit()
            }}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>

        <Button className="w-full" onClick={submit} disabled={loading || code.length !== 6}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
          Verify
        </Button>

        <Button
          variant="ghost"
          className="w-full"
          disabled={loading}
          onClick={async () => {
            await signOut()
            onCancel?.()
          }}
        >
          Sign in with a different account
        </Button>
      </CardContent>
    </Card>
  )
}

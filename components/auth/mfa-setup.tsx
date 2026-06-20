"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { ShieldCheck, ShieldAlert, Loader2, LogOut } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { signOut } from "@/lib/auth"
import { startMfaSetup, confirmMfaSetup, markMfaVerified, type MfaSetupResult } from "@/lib/mfa-client"
import { toast } from "@/hooks/use-toast"

type Step = "idle" | "setup"

export function MfaSetup() {
  const { user, userProfile } = useAuth()
  const router = useRouter()
  const enabled = userProfile?.totpEnabled === true

  // Mandatory enrollment: when arriving via /security?setup=required and not yet
  // enrolled, we auto-start setup and don't allow skipping.
  const [required, setRequired] = useState(false)

  const [step, setStep] = useState<Step>("idle")
  const [setupData, setSetupData] = useState<MfaSetupResult | null>(null)
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      setRequired(params.get("setup") === "required")
    }
  }, [])

  // Auto-begin setup when enrollment is required and not done yet.
  useEffect(() => {
    if (required && !enabled && step === "idle" && !setupData && !loading) {
      beginSetup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [required, enabled])

  // Once enrollment is confirmed (profile flips to enabled), leave the forced
  // setup screen and enter the app.
  useEffect(() => {
    if (required && enabled) {
      if (user) markMfaVerified(user.uid)
      router.replace("/subscriber")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [required, enabled, user])

  const beginSetup = async () => {
    setLoading(true)
    setError("")
    try {
      const data = await startMfaSetup()
      setSetupData(data)
      setStep("setup")
      setCode("")
    } catch (e: any) {
      setError(e.message || "Could not start setup")
    } finally {
      setLoading(false)
    }
  }

  const confirm = async () => {
    setLoading(true)
    setError("")
    try {
      await confirmMfaSetup(code)
      // The confirming code proves possession, so count this browser session as verified.
      if (user) markMfaVerified(user.uid)
      toast({ title: "Two-factor enabled", description: "You'll be asked for a code each time you sign in." })
      setStep("idle")
      setSetupData(null)
      setCode("")
      // When required, the enabled→redirect effect takes over once the profile updates.
    } catch (e: any) {
      setError(e.message || "Could not verify code")
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    setLoading(true)
    try {
      await signOut()
      router.replace("/")
    } catch (e: any) {
      setError(e.message || "Could not log out")
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {enabled ? <ShieldCheck className="h-5 w-5 text-green-600" /> : <ShieldAlert className="h-5 w-5 text-muted-foreground" />}
            Two-Factor Authentication
          </CardTitle>
          <Badge variant={enabled ? "default" : "secondary"}>{enabled ? "On" : "Off"}</Badge>
        </div>
        <CardDescription>
          Add an extra layer of security using an authenticator app like Google Authenticator or Authy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {enabled && step === "idle" && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Two-factor authentication is active on your account. You'll enter a 6-digit code from your authenticator app
              each time you sign in.
            </p>
            <p className="text-xs text-muted-foreground">
              2FA is required for all players. If you lose access to your authenticator, contact your administrator to
              reset it.
            </p>
          </div>
        )}

        {!enabled && step === "idle" && (
          <div className="space-y-3">
            {required && (
              <Alert>
                <AlertDescription>
                  Two-factor authentication is required before you can use your account. Please complete setup below.
                </AlertDescription>
              </Alert>
            )}
            <Button onClick={beginSetup} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Set up 2FA
            </Button>
          </div>
        )}

        {step === "setup" && setupData && (
          <div className="space-y-4">
            <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
              <li>Open Google Authenticator (or any TOTP app).</li>
              <li>Scan the QR code below, or enter the key manually.</li>
              <li>Enter the 6-digit code the app shows to confirm.</li>
            </ol>

            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setupData.qr} alt="2FA QR code" width={180} height={180} className="rounded border" />
            </div>

            <div className="text-center">
              <p className="text-xs text-muted-foreground">Manual key</p>
              <code className="text-xs break-all font-mono">{setupData.secret}</code>
            </div>

            <div className="flex flex-col items-center gap-3">
              <InputOTP maxLength={6} value={code} onChange={setCode}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>

              <div className="flex gap-2">
                <Button onClick={confirm} disabled={loading || code.length !== 6}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Confirm &amp; enable
                </Button>
                {!required && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setStep("idle")
                      setSetupData(null)
                      setCode("")
                      setError("")
                    }}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {required && !enabled && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-2 text-center">
              Not ready to set up 2FA right now? You can log out and finish later. You won't be able to use your account
              until 2FA is set up.
            </p>
            <Button variant="ghost" className="w-full" onClick={handleLogout} disabled={loading}>
              <LogOut className="h-4 w-4 mr-2" />
              Log out and set up later
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

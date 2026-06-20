"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { GeneratePasswordButton } from "@/components/admin/generate-password-button"
import { changeOwnPassword } from "@/lib/account"
import { signOut } from "@/lib/auth"
import { toast } from "@/hooks/use-toast"
import { KeyRound, LogOut, Loader2 } from "lucide-react"

export default function ChangePasswordPage() {
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!currentPassword) {
      setError("Please enter your current password.")
      return
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.")
      return
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.")
      return
    }
    if (newPassword === currentPassword) {
      setError("Your new password must be different from your current one.")
      return
    }

    setLoading(true)
    const result = await changeOwnPassword(currentPassword, newPassword)
    setLoading(false)

    if (result.success) {
      toast({ title: "Password updated", description: "Your new password is now active." })
      router.replace("/subscriber")
    } else {
      setError(result.error || "Could not change password.")
    }
  }

  const handleLogout = async () => {
    setLoading(true)
    await signOut()
    router.replace("/")
  }

  return (
    <ProtectedRoute allowedRoles={["subscriber"]}>
      <div className="min-h-screen bg-muted/30 flex items-center justify-center py-8 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Set Your Password
            </CardTitle>
            <CardDescription>
              For your security, please set your own password before continuing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="current-password"
                  required
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="new-password">New password</Label>
                  <GeneratePasswordButton
                    onGenerate={(pwd) => {
                      setNewPassword(pwd)
                      setConfirmPassword(pwd)
                    }}
                    disabled={loading}
                  />
                </div>
                <Input
                  id="new-password"
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="new-password"
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Save new password
              </Button>
            </form>

            <div className="pt-4 mt-4 border-t">
              <p className="text-xs text-muted-foreground mb-2 text-center">
                Not ready now? You can log out and do this later. You won't be able to use your account until your
                password is changed.
              </p>
              <Button variant="ghost" className="w-full" onClick={handleLogout} disabled={loading}>
                <LogOut className="h-4 w-4 mr-2" />
                Log out and do it later
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  )
}

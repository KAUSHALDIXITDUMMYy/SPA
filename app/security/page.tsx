"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { MfaSetup } from "@/components/auth/mfa-setup"
import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

export default function SecurityPage() {
  const router = useRouter()
  const { userProfile } = useAuth()
  const [setupRequired, setSetupRequired] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      setSetupRequired(params.get("setup") === "required")
    }
  }, [])

  // Only allow leaving the page once 2FA is enabled (mandatory enrollment).
  const canGoBack = !setupRequired || userProfile?.totpEnabled === true

  return (
    <ProtectedRoute allowedRoles={["subscriber"]}>
      <div className="min-h-screen bg-muted/30 py-8 px-4">
        <div className="max-w-md mx-auto space-y-4">
          {canGoBack && (
            <Button variant="ghost" size="sm" onClick={() => router.push("/subscriber")} className="-ml-2">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          )}
          <h1 className="text-2xl font-bold">Security</h1>
          <MfaSetup />
        </div>
      </div>
    </ProtectedRoute>
  )
}

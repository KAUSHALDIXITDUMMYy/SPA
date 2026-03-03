"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/hooks/use-auth"
import { acceptTerms } from "@/lib/auth"
import { ArrowLeft, FileText } from "lucide-react"

export default function TermsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, userProfile, loading } = useAuth()
  const [accepting, setAccepting] = useState(false)
  const redirectTo = searchParams.get("redirect") || "/dashboard"

  const handleAccept = async () => {
    if (!user) {
      router.push("/")
      return
    }
    setAccepting(true)
    const { success, error } = await acceptTerms(user.uid)
    setAccepting(false)
    if (success) {
      router.push(redirectTo)
    } else {
      console.error("Failed to accept terms:", error)
    }
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <Link
          href={user ? redirectTo : "/"}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {user ? "Back" : "Back to home"}
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Terms of Service &amp; End User License Agreement (EULA)
            </CardTitle>
            <CardDescription>Sportsmagician Audio – Last updated: March 2025</CardDescription>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-4">
            <p className="font-medium text-foreground">
              By using this service you agree to the following terms. We have <strong>zero tolerance</strong> for objectionable content or abusive behavior.
            </p>

            <section>
              <h3 className="text-base font-semibold mt-4">1. Acceptance</h3>
              <p>By accessing or using Sportsmagician Audio (&quot;Service&quot;), you agree to be bound by these Terms and our content and conduct policies.</p>
            </section>

            <section>
              <h3 className="text-base font-semibold mt-4">2. No Objectionable Content or Abuse</h3>
              <p>We have <strong>zero tolerance</strong> for:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Objectionable, offensive, harassing, or abusive content or behavior</li>
                <li>Hate speech, discrimination, or threats</li>
                <li>Impersonation or misuse of the platform</li>
                <li>Spam, illegal content, or content that violates applicable laws</li>
              </ul>
              <p>Violations may result in immediate removal of content, suspension, or permanent termination of your account.</p>
            </section>

            <section>
              <h3 className="text-base font-semibold mt-4">3. Reporting and Blocking</h3>
              <p>You may report (flag) content or users and block other users through the in-app tools. We review reports and act on them in line with our moderation process.</p>
            </section>

            <section>
              <h3 className="text-base font-semibold mt-4">4. Moderation Process</h3>
              <p>We aim to act on reports within <strong>24 hours</strong>: we may remove content, suspend, or remove offending accounts as appropriate.</p>
            </section>

            <section>
              <h3 className="text-base font-semibold mt-4">5. License and Use</h3>
              <p>We grant you a limited, non-exclusive license to use the Service for its intended purpose, subject to these Terms and acceptable use.</p>
            </section>

            <section>
              <h3 className="text-base font-semibold mt-4">6. Termination</h3>
              <p>We may suspend or terminate your access at any time for violation of these Terms or for any other reason we deem necessary.</p>
            </section>

            <p className="text-muted-foreground text-sm mt-6">
              For full terms, contact us via the Contact Us page. Continued use of the Service constitutes acceptance of these Terms.
            </p>
          </CardContent>
        </Card>

        {user && (
          <Card>
            <CardHeader>
              <CardTitle>Accept Terms</CardTitle>
              <CardDescription>You must accept the Terms to continue using the service.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleAccept} disabled={accepting} className="w-full sm:w-auto">
                {accepting ? "Accepting…" : "I Accept the Terms"}
              </Button>
            </CardContent>
          </Card>
        )}

        {!user && !loading && (
          <p className="text-center text-muted-foreground text-sm">
            <Link href="/" className="underline">Sign in</Link> to accept the Terms and use the service.
          </p>
        )}
      </div>
    </div>
  )
}

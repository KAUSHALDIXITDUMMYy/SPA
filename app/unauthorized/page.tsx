import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle } from "lucide-react"
import Link from "next/link"

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <CardTitle>Access Denied</CardTitle>
          <CardDescription>You don't have permission to access this page</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Button asChild>
            <Link href="/">Return to Home</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

import { LoginForm } from "@/components/auth/login-form"

export default function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Sportsmagician Audio</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Professional Audio Streaming Management System</p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}

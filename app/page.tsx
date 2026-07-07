import Link from "next/link"
import { LoginForm } from "@/components/auth/login-form"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4">
        <h2 className="text-primary font-mono font-bold text-lg tracking-wider">SPORTSMAGICIAN</h2>
        <span className="text-muted-foreground font-mono text-xs tracking-widest hidden sm:block">
          SYSTEM STATUS: NOMINAL // HIGH FIDELITY
        </span>
      </header>

      {/* Watermark */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 text-[12rem] sm:text-[16rem] font-black text-muted/20 leading-none tracking-tighter select-none pointer-events-none hidden lg:block">
        SPA
      </div>

      {/* Login Card */}
      <div className="relative z-10 flex items-center justify-center min-h-[calc(100vh-8rem)] px-4">
        <div className="w-full max-w-md">
          <LoginForm />
          <div className="flex items-center justify-center gap-6 mt-6 text-xs font-mono text-muted-foreground tracking-wider">
            <Link href="/terms" className="hover:text-primary transition-colors">
              TERMS & EULA
            </Link>
            <Link href="/contact-us" className="hover:text-primary transition-colors">
              CONTACT
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

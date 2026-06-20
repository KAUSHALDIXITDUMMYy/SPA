"use client"

import { Button } from "@/components/ui/button"
import { Wand2 } from "lucide-react"
import { generateStrongPassword } from "@/lib/password"
import { toast } from "@/hooks/use-toast"

interface GeneratePasswordButtonProps {
  /** Called with the freshly generated password (set it into your state). */
  onGenerate: (password: string) => void
  length?: number
  disabled?: boolean
  className?: string
}

/**
 * Generates a strong password, hands it back via onGenerate, and copies it to
 * the clipboard so the admin can share it before it's hashed away.
 */
export function GeneratePasswordButton({ onGenerate, length = 16, disabled, className }: GeneratePasswordButtonProps) {
  const handleClick = async () => {
    const pwd = generateStrongPassword(length)
    onGenerate(pwd)
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(pwd)
        toast({ title: "Strong password generated", description: "Copied to clipboard. Save it before closing." })
      } else {
        toast({ title: "Strong password generated", description: pwd })
      }
    } catch {
      toast({ title: "Strong password generated", description: pwd })
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={disabled} className={className}>
      <Wand2 className="h-4 w-4 mr-1" />
      Generate
    </Button>
  )
}

/**
 * Cryptographically strong password generation + simple strength scoring.
 * Used by the admin "Create user" / "Bulk create" / "Reset password" flows.
 */

const LOWER = "abcdefghijkmnpqrstuvwxyz" // no l/o to avoid confusion
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ" // no I/O
const DIGITS = "23456789" // no 0/1
const SYMBOLS = "!@#$%^&*-_=+?"

const ALL = LOWER + UPPER + DIGITS + SYMBOLS

/** Return a uniformly random integer in [0, max) using crypto. */
function randomInt(max: number): number {
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    // Rejection sampling to avoid modulo bias.
    const limit = Math.floor(0xffffffff / max) * max
    const buf = new Uint32Array(1)
    let x = 0
    do {
      globalThis.crypto.getRandomValues(buf)
      x = buf[0]
    } while (x >= limit)
    return x % max
  }
  // Fallback (should not happen in browsers / modern Node).
  return Math.floor(Math.random() * max)
}

function pick(chars: string): string {
  return chars[randomInt(chars.length)]
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Generate a strong password that always contains at least one lowercase,
 * uppercase, digit and symbol. Default length is 16.
 */
export function generateStrongPassword(length = 16): string {
  const len = Math.max(12, length)
  const required = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)]
  const rest: string[] = []
  for (let i = required.length; i < len; i++) {
    rest.push(pick(ALL))
  }
  return shuffle([...required, ...rest]).join("")
}

export type PasswordStrength = "weak" | "fair" | "strong"

/** Lightweight heuristic strength score for UI feedback. */
export function scorePasswordStrength(password: string): PasswordStrength {
  if (!password) return "weak"
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  if (score <= 2) return "weak"
  if (score <= 4) return "fair"
  return "strong"
}

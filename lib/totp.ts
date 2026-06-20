/**
 * Server-only TOTP (Google Authenticator compatible) helpers built on otplib v13.
 */
import { generateSecret, generateURI, verify } from "otplib"

export const TOTP_ISSUER = "Sportsmagician Audio"

// Accept codes within one 30s step of drift in either direction.
const EPOCH_TOLERANCE_SECONDS = 30

export function generateTotpSecret(): string {
  return generateSecret()
}

export function buildOtpAuthUrl(accountName: string, secret: string): string {
  return generateURI({ issuer: TOTP_ISSUER, label: accountName, secret })
}

export async function verifyTotp(token: string, secret: string): Promise<boolean> {
  if (!token || !secret) return false
  const cleaned = token.replace(/\s+/g, "")
  if (!/^\d{6}$/.test(cleaned)) return false
  try {
    const result = await verify({ token: cleaned, secret, epochTolerance: EPOCH_TOLERANCE_SECONDS })
    return !!result?.valid
  } catch {
    return false
  }
}

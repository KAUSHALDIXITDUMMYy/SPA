/**
 * Watches for the operational assignment day to advance (6 PM ET after the
 * effective date) and wipes streamAssignments automatically — same as the
 * rollover on scheduled-call save, but on a timer so admins don't have to
 * trigger it manually.
 *
 * Runs only on the long-lived VPS process (not Vercel serverless).
 */

import {
  getScheduleDateKey,
  rollAssignmentDayOnScheduleSave,
} from "@/lib/server/assignment-day"

const CHECK_MS = 60_000

let started = false
let ticking = false

export async function tickAssignmentDayRollover(): Promise<void> {
  if (ticking) return
  ticking = true
  try {
    const dateKey = getScheduleDateKey()
    await rollAssignmentDayOnScheduleSave(dateKey)
  } catch (error) {
    console.error("[assignmentDay] Auto rollover tick failed:", error)
  } finally {
    ticking = false
  }
}

export function startAssignmentDayRolloverWatch(): void {
  if (started) return
  if (process.env.VERCEL === "1") return

  started = true
  console.log(
    "[assignmentDay] Rollover watch started (6 PM ET after 2026-07-10; check every 60s)",
  )
  void tickAssignmentDayRollover()
  setInterval(() => void tickAssignmentDayRollover(), CHECK_MS)
}

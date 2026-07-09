/** VPS-only background jobs (assignment day rollover at 6 PM ET). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { startAssignmentDayRolloverWatch } = await import(
    "@/lib/server/assignment-day-rollover"
  )
  startAssignmentDayRolloverWatch()
}

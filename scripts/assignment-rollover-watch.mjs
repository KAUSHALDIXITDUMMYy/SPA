#!/usr/bin/env node
/** Polls the local backend every 60s to run assignment-day rollover (6 PM IST). VPS only. */
const URL = process.env.ASSIGNMENT_ROLLOVER_URL || "http://127.0.0.1:3000/api/cron/assignment-rollover"
const MS = 60_000

async function tick() {
  try {
    const res = await fetch(URL, { method: "GET" })
    const json = await res.json().catch(() => ({}))
    if (json.rolledOver) {
      console.log(
        `[assignment-rollover-watch] rolled ${json.dateKey}; deleted ${json.deletedCount ?? 0}`,
      )
    }
  } catch (error) {
    console.error("[assignment-rollover-watch] tick failed:", error?.message || error)
  }
}

console.log(`[assignment-rollover-watch] polling ${URL} every ${MS / 1000}s`)
void tick()
setInterval(() => void tick(), MS)

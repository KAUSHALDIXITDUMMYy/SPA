/**
 * Visibility-aware polling. Runs `fn` immediately, then every `intervalMs` — but
 * PAUSES while the browser tab is hidden and resumes (with an immediate run) when
 * it becomes visible again. Background tabs are the main multiplier of Firestore
 * read cost, so pausing them is the single biggest lever on the bill.
 *
 * Returns a stop function with the same shape as the previous `setInterval` cleanup.
 */
export function startPoll(fn: () => void | Promise<void>, intervalMs: number): () => void {
  let stopped = false
  let timer: ReturnType<typeof setInterval> | null = null

  const run = () => {
    if (stopped) return
    void fn()
  }

  const startTimer = () => {
    if (timer != null) return
    timer = setInterval(run, intervalMs)
  }

  const stopTimer = () => {
    if (timer != null) {
      clearInterval(timer)
      timer = null
    }
  }

  const hasDocument = typeof document !== "undefined"

  const onVisibility = () => {
    if (stopped) return
    if (document.visibilityState === "visible") {
      run() // refresh immediately on return so the UI isn't stale
      startTimer()
    } else {
      stopTimer()
    }
  }

  // Kick off: run once now, and only start the interval if we're visible.
  run()
  if (!hasDocument || document.visibilityState === "visible") {
    startTimer()
  }
  if (hasDocument) {
    document.addEventListener("visibilitychange", onVisibility)
  }

  return () => {
    stopped = true
    stopTimer()
    if (hasDocument) document.removeEventListener("visibilitychange", onVisibility)
  }
}

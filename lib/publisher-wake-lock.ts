/**
 * Screen wake lock while publishing — reduces sleep / dim on supported mobile browsers (often Android Chrome).
 * iOS WebView support varies; safe no-op when unavailable.
 */

export async function requestScreenWakeLock(): Promise<WakeLockSentinel | null> {
  if (typeof navigator === "undefined") return null
  const w = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> } })
    .wakeLock
  if (!w?.request) return null
  try {
    return await w.request("screen")
  } catch {
    return null
  }
}

export async function releaseWakeLock(sentinel: WakeLockSentinel | null): Promise<void> {
  if (!sentinel) return
  try {
    await sentinel.release()
  } catch {
    // already released
  }
}

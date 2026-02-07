/**
 * Silent audio loop to reduce browser tab throttling when backgrounded.
 * Browsers exempt tabs with active audio playback from aggressive throttling.
 * Must be started from a user gesture (e.g. click to start stream).
 */

let audioContext: AudioContext | null = null
let oscillator: OscillatorNode | null = null
let gainNode: GainNode | null = null
let isRunning = false

/**
 * Start the silent audio loop. Call this from a user gesture (click, etc.).
 * Helps keep the tab from being throttled when minimized or in background.
 */
export function startSilentAudio(): boolean {
  if (typeof window === "undefined") return false
  if (isRunning) return true

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return false

    audioContext = new AudioContextClass()

    // Oscillator at 22000 Hz - inaudible to most humans (upper limit ~20kHz)
    oscillator = audioContext.createOscillator()
    oscillator.type = "sine"
    oscillator.frequency.value = 22000

    // Gain near zero - effectively silent even if 22kHz is audible to some
    gainNode = audioContext.createGain()
    gainNode.gain.value = 0.0001

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    oscillator.start(0)

    isRunning = true
    return true
  } catch (e) {
    console.warn("[silent-audio] Failed to start:", e)
    return false
  }
}

/**
 * Stop the silent audio loop. Call when stream ends or user leaves.
 */
export function stopSilentAudio(): void {
  if (!isRunning) return

  try {
    if (oscillator) {
      oscillator.stop()
      oscillator.disconnect()
      oscillator = null
    }
    if (gainNode) {
      gainNode.disconnect()
      gainNode = null
    }
    if (audioContext) {
      audioContext.close()
      audioContext = null
    }
    isRunning = false
  } catch (e) {
    console.warn("[silent-audio] Failed to stop:", e)
  }
}

/**
 * Check if silent audio is currently running.
 */
export function isSilentAudioRunning(): boolean {
  return isRunning
}

"use client"

import { cn } from "@/lib/utils"

/** Animated bars suggesting live audio playback (mobile inline player). */
export function AudioPlayingIndicator({
  playing,
  className,
}: {
  playing: boolean
  className?: string
}) {
  const n = 6
  return (
    <div
      className={cn("flex h-16 items-end justify-center gap-1.5", className)}
      aria-label={playing ? "Sound playing" : "Sound muted or idle"}
    >
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className={cn(
            "w-1.5 shrink-0 rounded-full bg-primary origin-bottom",
            playing ? "subscriber-audio-bar min-h-[8px]" : "h-2 bg-muted-foreground/35",
          )}
          style={
            playing
              ? { height: 28, animationDelay: `${i * 95}ms` }
              : undefined
          }
        />
      ))}
    </div>
  )
}

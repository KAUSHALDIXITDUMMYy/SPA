/** Curated options for US-focused sports audio streams (publisher selection + subscriber filters). */
export const US_STREAM_SPORTS = [
  "General",
  "NFL",
  "NBA",
  "MLB",
  "NHL",
  "UFC",
  "MLS",
  "NCAA Football",
  "NCAA Basketball",
  "NASCAR",
  "Formula 1",
  "IndyCar",
  "WNBA",
  "PGA Tour",
  "LPGA",
  "Tennis",
  "Boxing",
  "Olympics",
  "Esports",
  "Other",
] as const

export type USStreamSport = (typeof US_STREAM_SPORTS)[number]

export const DEFAULT_STREAM_SPORT: USStreamSport = "General"

export const SPORT_FILTER_ALL = "all"

/** Streams with no sport set (legacy sessions). */
export const SPORT_FILTER_UNSPECIFIED = "__unspecified__"

export function streamSportLabel(sport?: string | null): string {
  if (sport == null || String(sport).trim() === "") return "Not specified"
  return String(sport).trim()
}

export function matchesSportFilter(sport: string | undefined | null, filter: string): boolean {
  if (filter === SPORT_FILTER_ALL) return true
  const s = sport?.trim() ?? ""
  if (filter === SPORT_FILTER_UNSPECIFIED) return s === ""
  return s === filter
}

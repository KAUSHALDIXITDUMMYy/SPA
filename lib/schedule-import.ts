import { addHours, isValid, parse } from "date-fns"

export type ScheduleImportPublisher = {
  id: string
  displayName?: string
  email?: string
}

/** One game line after parsing (times are local, same day as `dateKey`). */
export interface ScheduleImportRow {
  lineIndex: number
  rawLine: string
  title: string
  publisherHint?: string
  sport: string
  startsAt: Date
  endsAt: Date
  matchedPublisherId: string | null
}

export interface ScheduleImportParseResult {
  dateKey: string | null
  rows: ScheduleImportRow[]
  errors: string[]
}

const TIME_RE = /(\d{1,2}):(\d{2})\s*(AM|PM)/i

function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function parseDateFromLine(line: string): Date | null {
  const s = line.trim().replace(/(\d+)(st|nd|rd|th)/gi, "$1")
  const formats = ["MMM d, yyyy", "MMMM d, yyyy", "M/d/yyyy", "MM/dd/yyyy", "yyyy-MM-dd"]
  for (const f of formats) {
    const d = parse(s, f, new Date())
    if (isValid(d)) return d
  }
  return null
}

function timeTo24h(hour12: number, min: number, ampm: string): { h: number; m: number } {
  let h = hour12 % 12
  if (ampm.toUpperCase() === "PM") h += 12
  return { h, m: min }
}

function guessSportFromLine(line: string, defaultSport: string): string {
  if (line.includes("🏀")) return "NBA"
  if (line.includes("🏒")) return "NHL"
  if (line.includes("🏈")) return "NFL"
  if (line.includes("⚾")) return "MLB"
  if (line.includes("⚽")) return "MLS"
  return defaultSport
}

/**
 * Match pasted name (e.g. "Brian", "Ed") to a publisher — exact displayName / email local-part first, then substring.
 */
export function matchPublisherByHint(hint: string, publishers: ScheduleImportPublisher[]): string | null {
  const h = hint.trim().toLowerCase()
  if (!h) return null

  const dnExact = publishers.find((p) => (p.displayName || "").trim().toLowerCase() === h)
  if (dnExact) return dnExact.id

  const emailLocal = publishers.find((p) => {
    const local = (p.email || "").split("@")[0]?.trim().toLowerCase()
    return local === h
  })
  if (emailLocal) return emailLocal.id

  const starts = publishers.filter((p) => {
    const dn = (p.displayName || "").trim().toLowerCase()
    return dn.length > 0 && (dn.startsWith(h) || h.startsWith(dn))
  })
  if (starts.length === 1) return starts[0].id

  const includes = publishers.filter((p) => {
    const dn = (p.displayName || "").trim().toLowerCase()
    return dn.length > 0 && (dn.includes(h) || h.includes(dn))
  })
  if (includes.length === 1) return includes[0].id

  return null
}

function extractTitleAndPublisher(afterTime: string): { title: string; publisherHint?: string } {
  const rest = afterTime.trim()
  const m = rest.match(/^(.+?)\s-\s(.+)$/)
  if (m) {
    return { title: rest, publisherHint: m[2].trim() }
  }
  return { title: rest }
}

type RawGame = {
  lineIndex: number
  rawLine: string
  title: string
  publisherHint?: string
  sport: string
  startsAt: Date
}

/**
 * Parse the Sports Magic schedule text: header line, date line (e.g. Feb 6th, 2026), blank lines, then lines like
 * 🏀6:30PM Celtics - Brian
 */
export function parseSportsMagicScheduleText(text: string, defaultSport = "General"): ScheduleImportParseResult {
  const errors: string[] = []
  const lines = text.split(/\r?\n/)

  let parsedDate: Date | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    if (TIME_RE.test(line)) continue
    const d = parseDateFromLine(line)
    if (d) {
      parsedDate = d
      break
    }
  }

  if (!parsedDate) {
    return { dateKey: null, rows: [], errors: ["Could not find a date line (e.g. Feb 6th, 2026)."] }
  }

  const dateKey = toDateKey(parsedDate)
  const y = parsedDate.getFullYear()
  const mo = parsedDate.getMonth()
  const day = parsedDate.getDate()

  const rawGames: RawGame[] = []

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex]
    const line = rawLine.trim()
    if (!line) continue

    const tm = line.match(TIME_RE)
    if (!tm) continue

    const hour12 = parseInt(tm[1], 10)
    const min = parseInt(tm[2], 10)
    const ampm = tm[3]
    const { h, m: minute } = timeTo24h(hour12, min, ampm)
    const afterTime = line.slice((tm.index ?? 0) + tm[0].length)
    const { title, publisherHint } = extractTitleAndPublisher(afterTime)

    if (!title) {
      errors.push(`Line ${lineIndex + 1}: missing title after time.`)
      continue
    }

    const sport = guessSportFromLine(line, defaultSport)
    const startsAt = new Date(y, mo, day, h, minute, 0, 0)

    rawGames.push({
      lineIndex,
      rawLine: line,
      title,
      publisherHint,
      sport,
      startsAt,
    })
  }

  rawGames.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())

  const rows: ScheduleImportRow[] = rawGames.map((row, i) => {
    const next = rawGames[i + 1]
    let endsAt = next ? next.startsAt : addHours(row.startsAt, 2)
    if (endsAt.getTime() <= row.startsAt.getTime()) {
      endsAt = addHours(row.startsAt, 2)
    }
    return {
      ...row,
      endsAt,
      matchedPublisherId: null,
    }
  })

  if (!rows.length) {
    return {
      dateKey,
      rows: [],
      errors: errors.length ? errors : ["No game lines found (need a time like 6:30PM on each line)."],
    }
  }

  return { dateKey, rows, errors }
}

export function attachPublisherMatches(
  rows: ScheduleImportRow[],
  publishers: ScheduleImportPublisher[],
  fallbackPublisherId?: string,
): ScheduleImportRow[] {
  return rows.map((row) => {
    let matchedPublisherId: string | null = null
    if (row.publisherHint) {
      matchedPublisherId = matchPublisherByHint(row.publisherHint, publishers)
    }
    if (!matchedPublisherId && fallbackPublisherId) {
      matchedPublisherId = fallbackPublisherId
    }
    return { ...row, matchedPublisherId }
  })
}

/** Full parse + publisher matching for admin import. */
export function buildScheduleImportPreview(
  text: string,
  publishers: ScheduleImportPublisher[],
  options: { defaultSport?: string; fallbackPublisherId?: string } = {},
): ScheduleImportParseResult {
  const defaultSport = options.defaultSport ?? "General"
  const { dateKey, rows, errors } = parseSportsMagicScheduleText(text, defaultSport)
  if (!dateKey || !rows.length) {
    return { dateKey, rows: [], errors }
  }
  const matched = attachPublisherMatches(rows, publishers, options.fallbackPublisherId)
  return { dateKey, rows: matched, errors }
}

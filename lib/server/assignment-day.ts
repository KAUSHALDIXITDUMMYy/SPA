/**
 * Stream assignments are scoped to the current schedule day. When the operational
 * day advances (6:00 PM US Eastern from 2026-07-10 onward, midnight before that),
 * all prior streamAssignments are wiped. Rollover runs automatically on the VPS and
 * also when an admin saves scheduled calls for a later day.
 */

import type { Firestore } from "firebase-admin/firestore"
import { getAdminDb } from "@/lib/firebase-admin"

const META_COLLECTION = "systemConfig"
const META_DOC_ID = "assignmentDay"
const FIRESTORE_IN_LIMIT = 30
const DELETE_BATCH_SIZE = 500

export function normalizeDateKey(value: string): string | null {
  const trimmed = String(value || "").trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null
}

const SCHEDULE_TIMEZONE = "America/New_York"
/** Operational day flips at this hour (US Eastern) once 6 PM rollover is active. */
export const ASSIGNMENT_ROLLOVER_HOUR_ET = 18
/**
 * First US-Eastern calendar date when the 6 PM boundary applies.
 * Before this date, midnight Eastern is still used (so today's 6 PM does not wipe).
 */
export const ASSIGNMENT_ROLLOVER_EFFECTIVE_FROM = "2026-07-10"

function getEasternCalendarDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SCHEDULE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

function getEasternHour(d: Date): number {
  const h = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: SCHEDULE_TIMEZONE,
      hour: "numeric",
      hour12: false,
    }).format(d),
  )
  return h === 24 ? 0 : h
}

function previousDateKey(dateKey: string): string {
  const [y, m, day] = dateKey.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, day))
  dt.setUTCDate(dt.getUTCDate() - 1)
  return dt.toISOString().slice(0, 10)
}

/**
 * Operational schedule day (US Eastern).
 * - Before ASSIGNMENT_ROLLOVER_EFFECTIVE_FROM: calendar midnight (legacy).
 * - On/after that date: day flips at 6:00 PM ET (e.g. Jul 10 5:59 PM → Jul 9, Jul 10 6:00 PM → Jul 10).
 */
export function getScheduleDateKey(d = new Date()): string {
  const calendarToday = getEasternCalendarDateKey(d)

  if (calendarToday < ASSIGNMENT_ROLLOVER_EFFECTIVE_FROM) {
    return calendarToday
  }

  if (getEasternHour(d) < ASSIGNMENT_ROLLOVER_HOUR_ET) {
    return previousDateKey(calendarToday)
  }
  return calendarToday
}

export async function getAssignmentDayMeta(db: Firestore) {
  const snap = await db.collection(META_COLLECTION).doc(META_DOC_ID).get()
  if (!snap.exists) return null
  const data = snap.data() || {}
  const dateKey = normalizeDateKey(String(data.dateKey ?? ""))
  if (!dateKey) return null
  return { dateKey }
}

async function setAssignmentDayMeta(db: Firestore, dateKey: string) {
  await db.collection(META_COLLECTION).doc(META_DOC_ID).set(
    { dateKey, updatedAt: new Date() },
    { merge: true },
  )
}

export async function deleteAllStreamAssignments(db: Firestore): Promise<number> {
  const snap = await db.collection("streamAssignments").get()
  if (snap.empty) return 0

  let deleted = 0
  for (let i = 0; i < snap.docs.length; i += DELETE_BATCH_SIZE) {
    const batch = db.batch()
    const slice = snap.docs.slice(i, i + DELETE_BATCH_SIZE)
    slice.forEach((doc) => batch.delete(doc.ref))
    await batch.commit()
    deleted += slice.length
  }
  return deleted
}

/**
 * Call when scheduled calls are saved for `newDateKey`. If the day moved forward,
 * wipe all stream assignments from prior days.
 */
export async function rollAssignmentDayOnScheduleSave(
  newDateKey: string,
): Promise<{ rolledOver: boolean; deletedCount?: number; dateKey: string }> {
  const normalized = normalizeDateKey(newDateKey)
  if (!normalized) {
    return { rolledOver: false, dateKey: getScheduleDateKey() }
  }

  const db = await getAdminDb()
  const meta = await getAssignmentDayMeta(db)
  const previous = meta?.dateKey

  if (!previous) {
    await setAssignmentDayMeta(db, normalized)
    return { rolledOver: false, dateKey: normalized }
  }

  if (previous === normalized || normalized <= previous) {
    return { rolledOver: false, dateKey: previous }
  }

  const deletedCount = await deleteAllStreamAssignments(db)
  await setAssignmentDayMeta(db, normalized)
  console.log(
    `[assignmentDay] Rolled ${previous} -> ${normalized}; deleted ${deletedCount} stream assignment(s)`,
  )
  return { rolledOver: true, deletedCount, dateKey: normalized }
}

export async function resolveAssignmentDateKey(db: Firestore): Promise<string> {
  const meta = await getAssignmentDayMeta(db)
  return meta?.dateKey || getScheduleDateKey()
}

/** Load assignments only for the streams shown in the admin matrix (today's rooms). */
export async function getStreamAssignmentDocsForStreamIds(
  db: Firestore,
  streamIds: string[],
) {
  const ids = [...new Set(streamIds.filter(Boolean))]
  if (!ids.length) return []

  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += FIRESTORE_IN_LIMIT) {
    chunks.push(ids.slice(i, i + FIRESTORE_IN_LIMIT))
  }

  const snaps = await Promise.all(
    chunks.map((chunk) =>
      db.collection("streamAssignments").where("streamSessionId", "in", chunk).get(),
    ),
  )

  const byId = new Map<string, (typeof snaps)[0]["docs"][0]>()
  for (const snap of snaps) {
    for (const doc of snap.docs) {
      byId.set(doc.id, doc)
    }
  }
  return Array.from(byId.values())
}

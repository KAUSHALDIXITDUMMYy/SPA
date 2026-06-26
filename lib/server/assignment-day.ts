/**
 * Stream assignments are scoped to the current schedule day. When an admin saves
 * scheduled calls for a later calendar day, all prior streamAssignments are removed
 * in the background so the admin UI never has to load historical rows.
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

/** Calendar day for schedule rollover (US Eastern — matches typical game-day ops). */
export function getScheduleDateKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
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

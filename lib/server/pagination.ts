import type { Firestore, Query, DocumentSnapshot } from "firebase-admin/firestore"
import { normalizePageLimit } from "@/lib/pagination"

const SCAN_BATCH = 100

export type ServerPage<T> = {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
}

/**
 * Cursor-based pagination on an ordered Firestore query. When `accept` filters rows,
 * over-fetches until `limit` accepted items or the query is exhausted.
 */
export async function paginateOrderedQuery<T>(input: {
  db: Firestore
  buildQuery: (db: Firestore) => Query
  mapDoc: (doc: DocumentSnapshot) => T
  accept?: (item: T) => boolean
  limit?: number
  cursor?: string | null
  cursorCollection?: string
}): Promise<ServerPage<T>> {
  const limit = normalizePageLimit(input.limit)
  const accept = input.accept ?? (() => true)
  const target = limit + 1
  const buffer: T[] = []
  let scanAfter: DocumentSnapshot | null = null
  let lastAcceptedDoc: DocumentSnapshot | null = null

  if (input.cursor) {
    const collection = input.cursorCollection || "users"
    const cursorSnap = await input.db.collection(collection).doc(input.cursor).get()
    if (cursorSnap.exists) scanAfter = cursorSnap
  }

  while (buffer.length < target) {
    let q = input.buildQuery(input.db).limit(SCAN_BATCH)
    if (scanAfter) q = q.startAfter(scanAfter)

    const snap = await q.get()
    if (snap.empty) break

    for (const doc of snap.docs) {
      scanAfter = doc
      const row = input.mapDoc(doc)
      if (!accept(row)) continue
      buffer.push(row)
      lastAcceptedDoc = doc
      if (buffer.length >= target) break
    }

    if (buffer.length >= target) break
    if (snap.docs.length < SCAN_BATCH) break
  }

  const hasMore = buffer.length > limit
  return {
    items: buffer.slice(0, limit),
    nextCursor: hasMore && lastAcceptedDoc ? lastAcceptedDoc.id : null,
    hasMore,
  }
}

export async function queryByIdChunks<T>(
  db: Firestore,
  collection: string,
  field: string,
  ids: string[],
  mapDoc: (doc: DocumentSnapshot) => T,
): Promise<T[]> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return []

  const chunks: string[][] = []
  for (let i = 0; i < unique.length; i += 30) {
    chunks.push(unique.slice(i, i + 30))
  }

  const byId = new Map<string, T>()
  const snaps = await Promise.all(
    chunks.map((chunk) => db.collection(collection).where(field, "in", chunk).get()),
  )
  for (const snap of snaps) {
    for (const doc of snap.docs) {
      byId.set(doc.id, mapDoc(doc))
    }
  }
  return Array.from(byId.values())
}

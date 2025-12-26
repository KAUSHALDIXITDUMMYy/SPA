import { db } from "./firebase"
import { collection, addDoc, doc, updateDoc, deleteDoc, getDocs, onSnapshot, query, where, orderBy } from "firebase/firestore"

export interface ZoomCall {
  id?: string
  publisherId: string
  title: string
  url?: string
  joinUrl?: string
  meetingNumber?: string
  password?: string
  description?: string
  isActive: boolean
  createdAt: Date
}

export interface ZoomCallAssignment {
  id?: string
  zoomCallId: string
  subscriberId: string
  createdAt: Date
}

export interface ZoomPublisherAssignment {
  id?: string
  publisherId: string
  subscriberId: string
  createdAt: Date
}

const CALLS_COLLECTION = "zoomCalls"
const ASSIGNMENTS_COLLECTION = "zoomCallAssignments"
const PUBLISHER_ASSIGNMENTS_COLLECTION = "zoomPublisherAssignments"

export const createZoomCall = async (call: Omit<ZoomCall, "id" | "createdAt">) => {
  const data = { ...call, createdAt: new Date() }
  const ref = await addDoc(collection(db, CALLS_COLLECTION), data as any)
  return { success: true, id: ref.id }
}

export const updateZoomCall = async (callId: string, updates: Partial<ZoomCall>) => {
  await updateDoc(doc(db, CALLS_COLLECTION, callId), updates as any)
  return { success: true }
}

export const deleteZoomCall = async (callId: string) => {
  await deleteDoc(doc(db, CALLS_COLLECTION, callId))
  return { success: true }
}

export const getPublisherZoomCalls = async (publisherId: string) => {
  const q = query(collection(db, CALLS_COLLECTION), where("publisherId", "==", publisherId))
  const snap = await getDocs(q)
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ZoomCall[]
  return rows.sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime())
}

export const subscribePublisherActiveZoomCalls = (publisherId: string, cb: (calls: ZoomCall[]) => void) => {
  const q = query(
    collection(db, CALLS_COLLECTION),
    where("publisherId", "==", publisherId),
    where("isActive", "==", true),
    orderBy("createdAt", "desc"),
  )
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ZoomCall[]
    cb(rows)
  })
}

export const subscribeAllZoomCalls = (cb: (calls: ZoomCall[]) => void) => {
  const q = query(collection(db, CALLS_COLLECTION), orderBy("createdAt", "desc"))
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ZoomCall[]
    cb(rows)
  })
}

export const assignSubscriberToZoomCall = async (zoomCallId: string, subscriberId: string) => {
  const data: ZoomCallAssignment = { zoomCallId, subscriberId, createdAt: new Date() }
  const ref = await addDoc(collection(db, ASSIGNMENTS_COLLECTION), data as any)
  return { success: true, id: ref.id }
}

export const unassignSubscriberFromZoomCall = async (assignmentId: string) => {
  await deleteDoc(doc(db, ASSIGNMENTS_COLLECTION, assignmentId))
  return { success: true }
}

export const subscribeZoomCallAssignments = (zoomCallId: string, cb: (assignments: ZoomCallAssignment[]) => void) => {
  const q = query(collection(db, ASSIGNMENTS_COLLECTION), where("zoomCallId", "==", zoomCallId), orderBy("createdAt", "desc"))
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ZoomCallAssignment[]
    cb(rows)
  })
}

export const subscribeSubscriberAllowedZoomCalls = (subscriberId: string, cb: (calls: (ZoomCall & { assignmentId: string })[]) => void) => {
  const qCallAssign = query(collection(db, ASSIGNMENTS_COLLECTION), where("subscriberId", "==", subscriberId))
  const qPublisherAssign = query(collection(db, PUBLISHER_ASSIGNMENTS_COLLECTION), where("subscriberId", "==", subscriberId))

  // Track latest snapshots
  let latestCallAssignments: ZoomCallAssignment[] = []
  let latestPublisherAssignments: ZoomPublisherAssignment[] = []

  const recompute = async () => {
    // Build filters
    const callIds = new Set(latestCallAssignments.map((a) => a.zoomCallId))
    const publisherIds = new Set(latestPublisherAssignments.map((a) => a.publisherId))

    if (callIds.size === 0 && publisherIds.size === 0) {
      cb([])
      return
    }

    const callsSnap = await getDocs(query(collection(db, CALLS_COLLECTION)))
    const allCalls = callsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as ZoomCall[]

    const allowedCalls: ZoomCall[] = allCalls.filter((c: any) => {
      if (!c.isActive) return false
      if (callIds.has(c.id as any)) return true
      if (publisherIds.has(c.publisherId as any)) return true
      return false
    })

    // Prefer mapping to assignment IDs when present, else synthesize using publisher assignment id
    const result: (ZoomCall & { assignmentId: string })[] = []
    for (const call of allowedCalls) {
      const callAssignment = latestCallAssignments.find((a) => a.zoomCallId === call.id)
      const publisherAssignment = latestPublisherAssignments.find((a) => a.publisherId === call.publisherId)
      const assignmentId = callAssignment?.id || publisherAssignment?.id || ""
      result.push({ ...(call as any), assignmentId })
    }

    result.sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime())
    cb(result)
  }

  const unsubCall = onSnapshot(qCallAssign, async (assignSnap) => {
    latestCallAssignments = assignSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as ZoomCallAssignment[]
    await recompute()
  })

  const unsubPublisher = onSnapshot(qPublisherAssign, async (assignSnap) => {
    latestPublisherAssignments = assignSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as ZoomPublisherAssignment[]
    await recompute()
  })

  return () => {
    try { unsubCall() } catch {}
    try { unsubPublisher() } catch {}
  }
}

// Publisher-level assignments
export const assignSubscriberToPublisherZoom = async (publisherId: string, subscriberId: string) => {
  const data: ZoomPublisherAssignment = { publisherId, subscriberId, createdAt: new Date() }
  const ref = await addDoc(collection(db, PUBLISHER_ASSIGNMENTS_COLLECTION), data as any)
  return { success: true, id: ref.id }
}

export const unassignSubscriberFromPublisherZoom = async (assignmentId: string) => {
  await deleteDoc(doc(db, PUBLISHER_ASSIGNMENTS_COLLECTION, assignmentId))
  return { success: true }
}

export const subscribePublisherZoomAssignments = (publisherId: string, cb: (assignments: ZoomPublisherAssignment[]) => void) => {
  const q = query(collection(db, PUBLISHER_ASSIGNMENTS_COLLECTION), where("publisherId", "==", publisherId), orderBy("createdAt", "desc"))
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ZoomPublisherAssignment[]
    cb(rows)
  })
}


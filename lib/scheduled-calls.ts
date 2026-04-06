import { db } from "./firebase"
import { createScheduledPlaceholderSession, removeStreamSessionsForScheduledCall } from "./streaming"
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore"

/** Local calendar day (publisher timezone) */
export function getLocalDateKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export interface ScheduledCall {
  id: string
  dateKey: string
  title: string
  description?: string
  startsAt: Date
  endsAt: Date
  roomId: string
  publisherId: string
  publisherName: string
  sport?: string
  createdAt: Date
  updatedAt: Date
}

function parseDoc(id: string, data: Record<string, unknown>): ScheduledCall {
  return {
    id,
    dateKey: String(data.dateKey ?? ""),
    title: String(data.title ?? ""),
    description: data.description ? String(data.description) : undefined,
    startsAt: (data.startsAt as { toDate?: () => Date })?.toDate?.() ?? new Date(data.startsAt as string),
    endsAt: (data.endsAt as { toDate?: () => Date })?.toDate?.() ?? new Date(data.endsAt as string),
    roomId: String(data.roomId ?? ""),
    publisherId: String(data.publisherId ?? ""),
    publisherName: String(data.publisherName ?? ""),
    sport: data.sport ? String(data.sport) : undefined,
    createdAt: (data.createdAt as { toDate?: () => Date })?.toDate?.() ?? new Date(),
    updatedAt: (data.updatedAt as { toDate?: () => Date })?.toDate?.() ?? new Date(),
  }
}

export function generateScheduledRoomId(dateKey: string): string {
  const rand = Math.random().toString(36).substring(2, 10)
  return `sched-${dateKey}-${rand}`
}

export async function createScheduledCall(input: {
  dateKey: string
  title: string
  description?: string
  startsAt: Date
  endsAt: Date
  publisherId: string
  publisherName: string
  sport?: string
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    if (input.endsAt.getTime() <= input.startsAt.getTime()) {
      return { success: false, error: "End time must be after start time." }
    }
    const roomId = generateScheduledRoomId(input.dateKey)
    const ref = await addDoc(collection(db, "scheduledCalls"), {
      dateKey: input.dateKey,
      title: input.title.trim(),
      description: input.description?.trim() || "",
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      roomId,
      publisherId: input.publisherId,
      publisherName: input.publisherName,
      sport: input.sport || "",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const placeholder = await createScheduledPlaceholderSession({
      scheduledCallId: ref.id,
      roomId,
      publisherId: input.publisherId,
      publisherName: input.publisherName,
      title: input.title.trim(),
      description: input.description?.trim(),
      sport: input.sport,
    })
    if (!placeholder.success) {
      console.error("[scheduledCalls] Failed to create streamSessions placeholder:", placeholder.error)
    }
    return { success: true, id: ref.id }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to create call"
    return { success: false, error: msg }
  }
}

export async function deleteScheduledCall(callId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await removeStreamSessionsForScheduledCall(callId)
    await deleteDoc(doc(db, "scheduledCalls", callId))
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Delete failed" }
  }
}

export async function updateScheduledCall(
  callId: string,
  patch: Partial<{
    title: string
    description: string
    startsAt: Date
    endsAt: Date
    publisherId: string
    publisherName: string
    sport: string
  }>,
): Promise<{ success: boolean; error?: string }> {
  try {
    await updateDoc(doc(db, "scheduledCalls", callId), {
      ...patch,
      updatedAt: new Date(),
    })
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Update failed" }
  }
}

export async function getScheduledCallById(callId: string): Promise<ScheduledCall | null> {
  try {
    const snap = await getDoc(doc(db, "scheduledCalls", callId))
    if (!snap.exists()) return null
    return parseDoc(snap.id, snap.data() as Record<string, unknown>)
  } catch {
    return null
  }
}

export async function getScheduledCallsForDate(dateKey: string): Promise<ScheduledCall[]> {
  const q = query(collection(db, "scheduledCalls"), where("dateKey", "==", dateKey))
  const snap = await getDocs(q)
  const list = snap.docs.map((d) => parseDoc(d.id, d.data() as Record<string, unknown>))
  return list.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
}

export function subscribeScheduledCallsForDate(
  dateKey: string,
  callback: (calls: ScheduledCall[]) => void,
): Unsubscribe {
  const q = query(collection(db, "scheduledCalls"), where("dateKey", "==", dateKey))
  return onSnapshot(q, (snapshot) => {
    const list = snapshot.docs.map((d) => parseDoc(d.id, d.data() as Record<string, unknown>))
    list.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    callback(list)
  })
}

/** Whether "now" falls in the scheduled window (inclusive bounds). */
export function isCallInTimeWindow(call: ScheduledCall, now = new Date()): boolean {
  return now.getTime() >= call.startsAt.getTime() && now.getTime() <= call.endsAt.getTime()
}

export function isScheduledCallTransmitting(
  call: ScheduledCall,
  activeSessions: { roomId: string; publisherId: string; isActive: boolean; awaitingBroadcast?: boolean }[],
): boolean {
  return activeSessions.some(
    (s) =>
      s.isActive &&
      s.awaitingBroadcast !== true &&
      s.roomId === call.roomId &&
      s.publisherId === call.publisherId,
  )
}

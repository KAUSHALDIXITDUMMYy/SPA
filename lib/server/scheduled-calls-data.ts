/**
 * Server-only scheduled-calls operations (Firebase Admin SDK). Mirrors lib/scheduled-calls.ts.
 * Creating/deleting a call also manages the linked streamSessions placeholder row.
 */

import { getAdminDb } from "@/lib/firebase-admin"
import { rollAssignmentDayOnScheduleSave } from "@/lib/server/assignment-day"
import {
  createScheduledPlaceholderSession,
  removeStreamSessionsForScheduledCall,
} from "@/lib/server/streaming-data"

function toIso(value: any): string | null {
  if (!value) return null
  if (typeof value?.toDate === "function") return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function serialize(id: string, data: any) {
  return {
    id,
    dateKey: String(data.dateKey ?? ""),
    title: String(data.title ?? ""),
    description: data.description ? String(data.description) : undefined,
    startsAt: toIso(data.startsAt),
    endsAt: toIso(data.endsAt),
    roomId: String(data.roomId ?? ""),
    publisherId: String(data.publisherId ?? ""),
    publisherName: String(data.publisherName ?? ""),
    sport: data.sport ? String(data.sport) : undefined,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  }
}

function generateScheduledRoomId(dateKey: string): string {
  const rand = Math.random().toString(36).substring(2, 10)
  return `sched-${dateKey}-${rand}`
}

export async function createScheduledCall(input: {
  dateKey: string
  title: string
  description?: string
  startsAt: string | Date
  endsAt: string | Date
  publisherId: string
  publisherName: string
  sport?: string
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const startsAt = new Date(input.startsAt)
  const endsAt = new Date(input.endsAt)
  if (endsAt.getTime() <= startsAt.getTime()) {
    return { success: false, error: "End time must be after start time." }
  }

  await rollAssignmentDayOnScheduleSave(input.dateKey)

  const db = await getAdminDb()
  const roomId = generateScheduledRoomId(input.dateKey)
  const ref = await db.collection("scheduledCalls").add({
    dateKey: input.dateKey,
    title: input.title.trim(),
    description: input.description?.trim() || "",
    startsAt,
    endsAt,
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
    console.error("[scheduledCalls] placeholder creation failed:", placeholder.error)
  }
  return { success: true, id: ref.id }
}

export async function deleteScheduledCall(callId: string): Promise<{ success: boolean; error?: string }> {
  const db = await getAdminDb()
  await removeStreamSessionsForScheduledCall(callId)
  await db.collection("scheduledCalls").doc(callId).delete()
  return { success: true }
}

export async function updateScheduledCall(
  callId: string,
  patch: Record<string, any>,
): Promise<{ success: boolean; error?: string }> {
  const db = await getAdminDb()
  const normalized: Record<string, any> = { ...patch, updatedAt: new Date() }
  if (patch.startsAt) normalized.startsAt = new Date(patch.startsAt)
  if (patch.endsAt) normalized.endsAt = new Date(patch.endsAt)
  await db.collection("scheduledCalls").doc(callId).update(normalized)
  return { success: true }
}

export async function getScheduledCallById(callId: string) {
  const db = await getAdminDb()
  const snap = await db.collection("scheduledCalls").doc(callId).get()
  if (!snap.exists) return null
  return serialize(snap.id, snap.data())
}

export async function getScheduledCallsForDate(dateKey: string) {
  const db = await getAdminDb()
  const snap = await db.collection("scheduledCalls").where("dateKey", "==", dateKey).get()
  return snap.docs
    .map((d: any) => serialize(d.id, d.data()))
    .sort((a: any, b: any) => new Date(a.startsAt || 0).getTime() - new Date(b.startsAt || 0).getTime())
}

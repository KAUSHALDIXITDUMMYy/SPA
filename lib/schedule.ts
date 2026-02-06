import { db } from "./firebase"
import { doc, getDoc, setDoc } from "firebase/firestore"

export interface DailySchedule {
  content: string
  date: string // YYYY-MM-DD
  updatedAt: Date
  updatedBy?: string
}

function getTodayDateString(): string {
  const now = new Date()
  return now.toISOString().split("T")[0]
}

/** Get today's schedule. Returns null if none exists. */
export async function getTodaysSchedule(): Promise<DailySchedule | null> {
  try {
    const dateStr = getTodayDateString()
    const docRef = doc(db, "dailySchedules", dateStr)
    const snapshot = await getDoc(docRef)
    if (!snapshot.exists()) return null
    const data = snapshot.data()
    return {
      content: data.content || "",
      date: data.date || dateStr,
      updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt),
      updatedBy: data.updatedBy,
    }
  } catch (error) {
    console.error("Error fetching today's schedule:", error)
    return null
  }
}

/** Get schedule for a specific date. */
export async function getScheduleForDate(dateStr: string): Promise<DailySchedule | null> {
  try {
    const docRef = doc(db, "dailySchedules", dateStr)
    const snapshot = await getDoc(docRef)
    if (!snapshot.exists()) return null
    const data = snapshot.data()
    return {
      content: data.content || "",
      date: data.date || dateStr,
      updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt),
      updatedBy: data.updatedBy,
    }
  } catch (error) {
    console.error("Error fetching schedule:", error)
    return null
  }
}

/** Save or update today's schedule. Admin only. */
export async function updateTodaysSchedule(
  content: string,
  updatedBy?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const dateStr = getTodayDateString()
    const docRef = doc(db, "dailySchedules", dateStr)
    await setDoc(docRef, {
      content,
      date: dateStr,
      updatedAt: new Date(),
      updatedBy: updatedBy || null,
    })
    return { success: true }
  } catch (error: any) {
    console.error("Error updating schedule:", error)
    return { success: false, error: error.message }
  }
}

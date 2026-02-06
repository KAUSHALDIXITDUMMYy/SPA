import { db } from "./firebase"
import { doc, getDoc, setDoc } from "firebase/firestore"

const SCHEDULE_DOC_ID = "current"

export interface DailySchedule {
  content: string
  updatedAt: Date
}

export const getTodaysSchedule = async (): Promise<DailySchedule | null> => {
  try {
    const scheduleRef = doc(db, "dailySchedule", SCHEDULE_DOC_ID)
    const snapshot = await getDoc(scheduleRef)
    if (!snapshot.exists()) return null
    const data = snapshot.data()
    return {
      content: data.content || "",
      updatedAt: data.updatedAt?.toDate?.() ?? new Date(data.updatedAt),
    }
  } catch (error) {
    console.error("Error fetching daily schedule:", error)
    return null
  }
}

export const setTodaysSchedule = async (content: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const scheduleRef = doc(db, "dailySchedule", SCHEDULE_DOC_ID)
    await setDoc(scheduleRef, {
      content,
      updatedAt: new Date(),
    })
    return { success: true }
  } catch (error: any) {
    console.error("Error saving daily schedule:", error)
    return { success: false, error: error?.message || "Failed to save schedule" }
  }
}

/** Alias for setTodaysSchedule (updatedBy optional, for audit) */
export const updateTodaysSchedule = async (
  content: string,
  _updatedBy?: string
): Promise<{ success: boolean; error?: string }> => setTodaysSchedule(content)

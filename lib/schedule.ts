import { db } from "./firebase"
import { doc, getDoc, setDoc } from "firebase/firestore"
import { FS } from "./firestore-paths"

export interface DailySchedule {
  content: string
  updatedAt: Date
}

/** Real schedule — subscribers / publishers / apps use this. */
export const getTodaysSchedule = async (): Promise<DailySchedule | null> => {
  try {
    const scheduleRef = doc(db, FS.schedule.live, FS.schedule.docId)
    const snapshot = await getDoc(scheduleRef)
    if (!snapshot.exists()) {
      const legacy = await getDoc(doc(db, FS.schedule.decoy, FS.schedule.docId))
      if (!legacy.exists()) return null
      const data = legacy.data()
      return {
        content: data.content || "",
        updatedAt: data.updatedAt?.toDate?.() ?? new Date(data.updatedAt),
      }
    }
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
    const scheduleRef = doc(db, FS.schedule.live, FS.schedule.docId)
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

/** Decoy schedule — legacy `dailySchedule`; clone sites sync this collection. */
export const getDecoySchedule = async (): Promise<DailySchedule | null> => {
  try {
    const scheduleRef = doc(db, FS.schedule.decoy, FS.schedule.docId)
    const snapshot = await getDoc(scheduleRef)
    if (!snapshot.exists()) return null
    const data = snapshot.data()
    return {
      content: data.content || "",
      updatedAt: data.updatedAt?.toDate?.() ?? new Date(data.updatedAt),
    }
  } catch (error) {
    console.error("Error fetching decoy schedule:", error)
    return null
  }
}

export const setDecoySchedule = async (content: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const scheduleRef = doc(db, FS.schedule.decoy, FS.schedule.docId)
    await setDoc(scheduleRef, {
      content,
      updatedAt: new Date(),
    })
    return { success: true }
  } catch (error: any) {
    console.error("Error saving decoy schedule:", error)
    return { success: false, error: error?.message || "Failed to save decoy schedule" }
  }
}

export const updateTodaysSchedule = async (
  content: string,
  _updatedBy?: string,
): Promise<{ success: boolean; error?: string }> => setTodaysSchedule(content)

import { fetchWithAuth } from "@/lib/client/authenticated-fetch"

const SCHEDULE_ENDPOINT = "/api/schedule"

export interface DailySchedule {
  content: string
  updatedAt: Date
}

export const getTodaysSchedule = async (): Promise<DailySchedule | null> => {
  try {
    const res = await fetchWithAuth(SCHEDULE_ENDPOINT, { method: "GET" })
    if (!res.ok) throw new Error(`Request failed: ${res.status}`)
    const json = await res.json()
    if (!json.schedule) return null
    return {
      content: json.schedule.content || "",
      updatedAt: new Date(json.schedule.updatedAt),
    }
  } catch (error) {
    console.error("Error fetching daily schedule:", error)
    return null
  }
}

export const setTodaysSchedule = async (
  content: string,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const res = await fetchWithAuth(SCHEDULE_ENDPOINT, {
      method: "PUT",
      body: JSON.stringify({ content }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      return { success: false, error: json.error || `Failed to save schedule (${res.status})` }
    }
    return { success: true }
  } catch (error: any) {
    console.error("Error saving daily schedule:", error)
    return { success: false, error: error?.message || "Failed to save schedule" }
  }
}

/** Alias for setTodaysSchedule (updatedBy optional, for audit) */
export const updateTodaysSchedule = async (
  content: string,
  _updatedBy?: string,
): Promise<{ success: boolean; error?: string }> => setTodaysSchedule(content)

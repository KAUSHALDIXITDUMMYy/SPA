"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  fetchSubscriberDashboard,
  splitAvailableStreams,
  type SubscriberPermission,
} from "@/lib/subscriber"
import { startPoll } from "@/lib/client/poll"

const POLL_MS = 20_000

type SubscriberDashboardState = {
  permissions: SubscriberPermission[]
  adHoc: SubscriberPermission[]
  scheduled: SubscriberPermission[]
  hasAssignment: boolean
  loading: boolean
  refreshing: boolean
  error: string
  refresh: (manual?: boolean) => Promise<void>
}

const SubscriberDashboardContext = createContext<SubscriberDashboardState | null>(null)

export function SubscriberDashboardProvider({
  subscriberId,
  enabled = true,
  children,
}: {
  subscriberId: string | null | undefined
  enabled?: boolean
  children: ReactNode
}) {
  const [permissions, setPermissions] = useState<SubscriberPermission[]>([])
  const [hasAssignment, setHasAssignment] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")

  const refresh = useCallback(
    async (manual = false) => {
      if (!subscriberId || !enabled) return
      if (manual) setRefreshing(true)
      try {
        const data = await fetchSubscriberDashboard(subscriberId)
        setPermissions(data.permissions)
        setHasAssignment(data.hasAssignment)
        setError("")
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load streams")
      } finally {
        setLoading(false)
        if (manual) setRefreshing(false)
      }
    },
    [subscriberId, enabled],
  )

  useEffect(() => {
    if (!subscriberId || !enabled) {
      setLoading(false)
      return
    }
    return startPoll(() => void refresh(), POLL_MS)
  }, [subscriberId, enabled, refresh])

  const { adHoc, scheduled } = useMemo(() => splitAvailableStreams(permissions), [permissions])

  const value = useMemo(
    () => ({
      permissions,
      adHoc,
      scheduled,
      hasAssignment,
      loading,
      refreshing,
      error,
      refresh,
    }),
    [permissions, adHoc, scheduled, hasAssignment, loading, refreshing, error, refresh],
  )

  return (
    <SubscriberDashboardContext.Provider value={value}>{children}</SubscriberDashboardContext.Provider>
  )
}

export function useSubscriberDashboard() {
  const ctx = useContext(SubscriberDashboardContext)
  if (!ctx) {
    throw new Error("useSubscriberDashboard must be used within SubscriberDashboardProvider")
  }
  return ctx
}

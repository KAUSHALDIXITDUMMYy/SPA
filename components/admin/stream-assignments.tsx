"use client"

import { useEffect, useMemo, useState, useCallback, memo, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  createStreamAssignment,
  bulkCreateStreamAssignments,
  bulkDeleteStreamAssignments,
  deleteStreamAssignment,
  updateStreamAssignment,
  getStreamAssignments,
  getStreamAssignmentsBootstrap,
  getStreamAssignmentsBootstrapPage,
  getStreamAssignmentsForSubscriberIds,
  invalidateStreamAssignmentsBootstrap,
  type StreamAssignment,
} from "@/lib/admin"
import type { StreamSession } from "@/lib/streaming"
import type { UserProfile } from "@/lib/auth"
import {
  Radio,
  Users,
  Loader2,
  CheckCircle2,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  Mail,
  Grid3x3,
  CheckSquare,
  Square,
  Eraser,
} from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { useDebouncedUserSearch } from "@/hooks/use-debounced-user-search"
import { cn } from "@/lib/utils"

/** High-contrast checkboxes for the dark matrix — empty boxes must stay visible on black. */
const MATRIX_CHECKBOX_CLASS =
  "h-5 w-5 border-2 border-foreground/70 bg-background shadow-sm " +
  "hover:border-primary hover:bg-muted " +
  "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground " +
  "dark:border-foreground/80 dark:bg-card dark:hover:bg-muted " +
  "dark:data-[state=checked]:bg-primary dark:data-[state=checked]:border-primary"

// Memoized matrix cell to prevent unnecessary re-renders
const MatrixCell = memo(({
  assigned,
  disabled,
  onToggle,
}: {
  assigned: boolean
  disabled?: boolean
  onToggle: (nextAssigned: boolean) => void
}) => (
  <td
    className={cn(
      "border border-border p-2 text-center align-middle",
      assigned ? "bg-primary/10" : "bg-card",
    )}
  >
    <Checkbox
      checked={assigned}
      disabled={disabled}
      onCheckedChange={(checked) => onToggle(checked === true)}
      className={MATRIX_CHECKBOX_CLASS}
      aria-label={assigned ? "Assigned — click to remove" : "Not assigned — click to assign"}
    />
  </td>
))

MatrixCell.displayName = "MatrixCell"

/** Matrix virtual window: load 100 rows/columns at a time; scroll loads more. */
const MATRIX_PAGE_SIZE = 100

function assignmentsToMap(assignments: StreamAssignment[]): Map<string, StreamAssignment[]> {
  const assignmentsMap = new Map<string, StreamAssignment[]>()
  assignments.forEach((assignment) => {
    const existing = assignmentsMap.get(assignment.subscriberId) || []
    assignmentsMap.set(assignment.subscriberId, [...existing, assignment])
  })
  return assignmentsMap
}

export function StreamAssignments({ active = true }: { active?: boolean }) {
  const { userProfile, loading: authLoading } = useAuth()
  const adminUid = userProfile?.role === "admin" ? userProfile.uid : null
  const hasLoadedOnce = useRef(false)
  const [subscribers, setSubscribers] = useState<(UserProfile & { id: string })[]>([])
  const [streams, setStreams] = useState<StreamSession[]>([])
  const [selectedSubscribers, setSelectedSubscribers] = useState<Set<string>>(new Set())
  const [selectedStreams, setSelectedStreams] = useState<Set<string>>(new Set())
  const [searchSubs, setSearchSubs] = useState("")
  const [searchStreams, setSearchStreams] = useState("")
  const [dataLoading, setDataLoading] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [togglingCells, setTogglingCells] = useState<Set<string>>(new Set())
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [allAssignments, setAllAssignments] = useState<Map<string, StreamAssignment[]>>(new Map())
  const [matrixExpanded, setMatrixExpanded] = useState(false)
  const [bulkEmailDialogOpen, setBulkEmailDialogOpen] = useState(false)
  const [bulkEmailSearch, setBulkEmailSearch] = useState("")
  const [bulkEmailSelectedStreams, setBulkEmailSelectedStreams] = useState<Set<string>>(new Set())
  const [bulkEmailRevokeDialogOpen, setBulkEmailRevokeDialogOpen] = useState(false)
  const [bulkEmailRevokeSearch, setBulkEmailRevokeSearch] = useState("")
  const [matrixRowsVisible, setMatrixRowsVisible] = useState(MATRIX_PAGE_SIZE)
  const [matrixColsVisible, setMatrixColsVisible] = useState(MATRIX_PAGE_SIZE)
  const [subscribersHasMore, setSubscribersHasMore] = useState(false)
  const [subscribersCursor, setSubscribersCursor] = useState<string | null>(null)
  const [loadingMoreSubscribers, setLoadingMoreSubscribers] = useState(false)
  const { searchResults, searching: searchingSubs, isSearchActive: subscriberSearchActive } =
    useDebouncedUserSearch("subscriber", searchSubs)

  useEffect(() => {
    if (!active || authLoading || !adminUid) {
      return
    }

    let cancelled = false
    const load = async () => {
      const showSpinner = !hasLoadedOnce.current
      if (showSpinner) setDataLoading(true)
      setError("")
      try {
        const { subscribers: subs, streams: activeStreams, assignments, nextCursor, hasMore } =
          await getStreamAssignmentsBootstrapPage()
        if (cancelled) return

        setSubscribers(subs as (UserProfile & { id: string })[])
        setStreams(activeStreams)
        setAllAssignments(assignmentsToMap(assignments))
        setSubscribersCursor(nextCursor ?? null)
        setSubscribersHasMore(Boolean(hasMore))
        hasLoadedOnce.current = true
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Failed to load data")
      } finally {
        if (!cancelled && showSpinner) setDataLoading(false)
      }
    }
    void load()

    return () => {
      cancelled = true
    }
  }, [active, authLoading, adminUid])

  const setAssignmentsFromList = useCallback((assignments: StreamAssignment[]) => {
    setAllAssignments(assignmentsToMap(assignments))
  }, [])

  const patchAssignmentLocal = useCallback(
    (
      subscriberId: string,
      streamId: string,
      patch: { add?: StreamAssignment; remove?: boolean; updates?: Partial<StreamAssignment> },
    ) => {
      setAllAssignments((prev) => {
        const next = new Map(prev)
        const list = [...(next.get(subscriberId) || [])]
        const idx = list.findIndex((a) => a.streamSessionId === streamId)

        if (patch.remove) {
          if (idx >= 0) list.splice(idx, 1)
        } else if (patch.add) {
          if (idx >= 0) {
            list[idx] = { ...list[idx], ...patch.add, isActive: true }
          } else {
            list.push(patch.add)
          }
        } else if (patch.updates && idx >= 0) {
          list[idx] = { ...list[idx], ...patch.updates }
        }

        next.set(subscriberId, list)
        return next
      })
    },
    [],
  )

  useEffect(() => {
    if (!subscriberSearchActive || searchResults.length === 0) return
    let cancelled = false
    void (async () => {
      const assignments = await getStreamAssignmentsForSubscriberIds(searchResults.map((s) => s.id))
      if (cancelled) return
      setAllAssignments((prev) => {
        const next = new Map(prev)
        assignments.forEach((assignment) => {
          const existing = next.get(assignment.subscriberId) || []
          const idx = existing.findIndex(
            (a) =>
              (a.id && assignment.id && a.id === assignment.id) ||
              a.streamSessionId === assignment.streamSessionId,
          )
          if (idx >= 0) {
            const list = [...existing]
            list[idx] = assignment
            next.set(assignment.subscriberId, list)
          } else {
            next.set(assignment.subscriberId, [...existing, assignment])
          }
        })
        return next
      })
    })()
    return () => {
      cancelled = true
    }
  }, [searchResults, subscriberSearchActive])

  const refreshAssignments = useCallback(async () => {
    const assignments = await getStreamAssignments()
    setAssignmentsFromList(assignments)
    invalidateStreamAssignmentsBootstrap()
  }, [setAssignmentsFromList])

  const filteredSubscribers = useMemo(() => {
    const q = searchSubs.trim().toLowerCase()
    const label = (s: UserProfile & { id: string }) =>
      (s.displayName || s.email || "").toLowerCase()
    const pool = subscriberSearchActive ? searchResults : subscribers
    const filtered =
      !subscriberSearchActive && q ? pool.filter((s) => label(s).includes(q)) : pool
    return filtered.sort((a, b) => {
      const nameA = label(a)
      const nameB = label(b)
      return nameA.localeCompare(nameB)
    })
  }, [searchSubs, subscribers, searchResults, subscriberSearchActive])

  const filteredStreams = useMemo(() => {
    const q = searchStreams.trim().toLowerCase()
    const label = (s: StreamSession) =>
      (s.title || s.publisherName || s.roomId || "").toLowerCase()
    const filtered = q ? streams.filter((s) => label(s).includes(q)) : streams
    return filtered.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [searchStreams, streams])

  const filteredStreamIds = useMemo(
    () => filteredStreams.map((s) => s.id).filter((id): id is string => Boolean(id)),
    [filteredStreams],
  )

  const allFilteredSubscribersSelected = useMemo(
    () =>
      filteredSubscribers.length > 0 &&
      filteredSubscribers.every((s) => selectedSubscribers.has(s.id)),
    [filteredSubscribers, selectedSubscribers],
  )

  const allFilteredStreamsSelected = useMemo(
    () =>
      filteredStreamIds.length > 0 &&
      filteredStreamIds.every((id) => selectedStreams.has(id)),
    [filteredStreamIds, selectedStreams],
  )

  const allBulkEmailStreamsSelected = useMemo(
    () =>
      filteredStreamIds.length > 0 &&
      filteredStreamIds.every((id) => bulkEmailSelectedStreams.has(id)),
    [filteredStreamIds, bulkEmailSelectedStreams],
  )

  useEffect(() => {
    setMatrixRowsVisible(Math.min(MATRIX_PAGE_SIZE, filteredSubscribers.length))
  }, [searchSubs, filteredSubscribers.length])

  useEffect(() => {
    setMatrixColsVisible(Math.min(MATRIX_PAGE_SIZE, filteredStreams.length))
  }, [searchStreams, filteredStreams.length])

  const streamsForMatrix = useMemo(
    () => filteredStreams.slice(0, matrixColsVisible),
    [filteredStreams, matrixColsVisible],
  )
  const subsForMatrix = useMemo(
    () => filteredSubscribers.slice(0, matrixRowsVisible),
    [filteredSubscribers, matrixRowsVisible],
  )

  const loadMoreSubscribers = useCallback(async () => {
    if (!subscribersHasMore || !subscribersCursor || loadingMoreSubscribers) return
    setLoadingMoreSubscribers(true)
    try {
      const page = await getStreamAssignmentsBootstrapPage(subscribersCursor)
      setSubscribers((prev) => {
        const seen = new Set(prev.map((s) => s.id))
        const merged = [...prev]
        for (const sub of page.subscribers) {
          if (!seen.has(sub.id)) merged.push(sub)
        }
        return merged
      })
      setAllAssignments((prev) => {
        const next = new Map(prev)
        page.assignments.forEach((assignment) => {
          const existing = next.get(assignment.subscriberId) || []
          next.set(assignment.subscriberId, [...existing, assignment])
        })
        return next
      })
      if (page.streams.length) setStreams(page.streams)
      setSubscribersCursor(page.nextCursor ?? null)
      setSubscribersHasMore(Boolean(page.hasMore))
    } catch (err: any) {
      setError(err?.message || "Failed to load more subscribers")
    } finally {
      setLoadingMoreSubscribers(false)
    }
  }, [subscribersHasMore, subscribersCursor, loadingMoreSubscribers])

  /** Pull every subscriber page so "select all / assign all" is not capped at 100. */
  const ensureAllSubscribersLoaded = useCallback(async (): Promise<(UserProfile & { id: string })[]> => {
    let all = [...subscribers]
    let cursor = subscribersCursor
    let hasMore = subscribersHasMore
    let guard = 0
    while (hasMore && cursor && guard < 200) {
      guard++
      const page = await getStreamAssignmentsBootstrapPage(cursor)
      const seen = new Set(all.map((s) => s.id))
      for (const sub of page.subscribers) {
        if (!seen.has(sub.id)) {
          all.push(sub)
          seen.add(sub.id)
        }
      }
      setAllAssignments((prev) => {
        const next = new Map(prev)
        page.assignments.forEach((assignment) => {
          const existing = next.get(assignment.subscriberId) || []
          const list = [...existing]
          const idx = list.findIndex(
            (a) =>
              (a.id && assignment.id && a.id === assignment.id) ||
              a.streamSessionId === assignment.streamSessionId,
          )
          if (idx >= 0) list[idx] = assignment
          else list.push(assignment)
          next.set(assignment.subscriberId, list)
        })
        return next
      })
      if (page.streams.length) setStreams(page.streams)
      cursor = page.nextCursor ?? null
      hasMore = Boolean(page.hasMore)
    }
    setSubscribers(all)
    setSubscribersCursor(cursor)
    setSubscribersHasMore(hasMore)
    setMatrixRowsVisible(all.length)
    return all
  }, [subscribers, subscribersCursor, subscribersHasMore])

  const handleMatrixScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget
      const edge = 72
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - edge) {
        setMatrixRowsVisible((n) =>
          Math.min(n + MATRIX_PAGE_SIZE, filteredSubscribers.length),
        )
        if (
          !subscriberSearchActive &&
          matrixRowsVisible + MATRIX_PAGE_SIZE >= filteredSubscribers.length &&
          subscribersHasMore
        ) {
          void loadMoreSubscribers()
        }
      }
      if (el.scrollLeft + el.clientWidth >= el.scrollWidth - edge) {
        setMatrixColsVisible((n) => Math.min(n + MATRIX_PAGE_SIZE, filteredStreams.length))
      }
    },
    [
      filteredSubscribers.length,
      filteredStreams.length,
      matrixRowsVisible,
      subscribersHasMore,
      subscriberSearchActive,
      loadMoreSubscribers,
    ],
  )

  // Check if subscriber has stream assigned
  const isAssigned = useCallback((subscriberId: string, streamId: string) => {
    const assignments = allAssignments.get(subscriberId) || []
    return assignments.some((a) => a.streamSessionId === streamId && a.isActive)
  }, [allAssignments])

  // Get assignment for subscriber-stream pair
  const getAssignment = useCallback((subscriberId: string, streamId: string) => {
    const assignments = allAssignments.get(subscriberId) || []
    return assignments.find((a) => a.streamSessionId === streamId)
  }, [allAssignments])

  const cellKey = useCallback((subscriberId: string, streamId: string) => `${subscriberId}:${streamId}`, [])

  // Toggle single assignment (optimistic UI — no full-page reload flash)
  const toggleAssignment = useCallback(async (subscriberId: string, streamId: string, nextAssigned: boolean) => {
    const key = cellKey(subscriberId, streamId)
    if (togglingCells.has(key)) return

    setTogglingCells((prev) => new Set(prev).add(key))
    setError("")
    setSuccess("")

    const assignment = getAssignment(subscriberId, streamId)
    const previousList = [...(allAssignments.get(subscriberId) || [])]

    if (nextAssigned) {
      if (!assignment) {
        patchAssignmentLocal(subscriberId, streamId, {
          add: {
            subscriberId,
            streamSessionId: streamId,
            isActive: true,
            createdAt: new Date(),
          },
        })
      } else if (!assignment.isActive) {
        patchAssignmentLocal(subscriberId, streamId, { updates: { isActive: true } })
      }
    } else if (assignment) {
      patchAssignmentLocal(subscriberId, streamId, { remove: true })
    }

    try {
      if (nextAssigned) {
        if (!assignment) {
          const result = await createStreamAssignment({
            subscriberId,
            streamSessionId: streamId,
            isActive: true,
          })
          if (!result.success) {
            throw new Error(result.error || "Failed to create assignment")
          }
          if (result.id) {
            patchAssignmentLocal(subscriberId, streamId, { updates: { id: result.id } })
          }
          setSuccess("Assignment created successfully")
        } else if (!assignment.isActive) {
          const result = await updateStreamAssignment(assignment.id!, { isActive: true })
          if (!result.success) {
            throw new Error(result.error || "Failed to reactivate assignment")
          }
          setSuccess("Assignment reactivated")
        }
      } else if (assignment) {
        const result = await deleteStreamAssignment(assignment.id!)
        if (!result.success) {
          throw new Error(result.error || "Failed to remove assignment")
        }
        setSuccess("Assignment removed")
      }

      invalidateStreamAssignmentsBootstrap()
    } catch (e: any) {
      setAllAssignments((prev) => {
        const next = new Map(prev)
        next.set(subscriberId, previousList)
        return next
      })
      setError(e?.message || "Operation failed")
    } finally {
      setTogglingCells((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }, [allAssignments, cellKey, getAssignment, patchAssignmentLocal, togglingCells])

  // Parse bulk emails from textarea
  const parseBulkEmails = useCallback((text: string): string[] => {
    return text
      .split(/[,\n]/)
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0 && email.includes("@"))
  }, [])

  // Find subscribers by emails (searches the provided list, not just first page)
  const findSubscribersByEmailsIn = useCallback(
    (emails: string[], pool: (UserProfile & { id: string })[]): { ids: string[]; missing: string[] } => {
      const emailSet = new Set(emails.map((e) => e.toLowerCase()))
      const foundEmails = new Set<string>()
      const ids: string[] = []
      for (const sub of pool) {
        const email = (sub.email || "").toLowerCase()
        if (email && emailSet.has(email)) {
          ids.push(sub.id)
          foundEmails.add(email)
        }
      }
      const missing = emails.filter((e) => !foundEmails.has(e.toLowerCase()))
      return { ids, missing }
    },
    [],
  )

  // Bulk assign from email search
  const bulkAssignFromEmails = useCallback(async () => {
    if (!bulkEmailSearch.trim()) {
      setError("Please enter email addresses")
      return
    }

    const emails = parseBulkEmails(bulkEmailSearch)
    if (emails.length === 0) {
      setError("No valid email addresses found")
      return
    }

    if (bulkEmailSelectedStreams.size === 0) {
      setError("Please select at least one stream")
      return
    }

    setBulkLoading(true)
    setError("")
    setSuccess("")

    try {
      const allSubs = await ensureAllSubscribersLoaded()
      const { ids: subscriberIds, missing } = findSubscribersByEmailsIn(emails, allSubs)
      if (subscriberIds.length === 0) {
        setError("No subscribers found with those email addresses")
        return
      }

      const result = await bulkCreateStreamAssignments({
        subscriberIds,
        streamSessionIds: Array.from(bulkEmailSelectedStreams),
      })
      invalidateStreamAssignmentsBootstrap()

      let successMsg = `Assigned ${subscriberIds.length} subscriber(s) to ${bulkEmailSelectedStreams.size} stream(s): ${result.created} created, ${result.reactivated} reactivated, ${result.skipped} already active.`
      if (missing.length) successMsg += ` Not found: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}.`

      setSuccess(successMsg)
      setBulkEmailSearch("")
      setBulkEmailSelectedStreams(new Set())
      setBulkEmailDialogOpen(false)
      await refreshAssignments()
    } catch (e: any) {
      setError(e?.message || "Bulk assignment failed")
    } finally {
      setBulkLoading(false)
    }
  }, [
    bulkEmailSearch,
    bulkEmailSelectedStreams,
    parseBulkEmails,
    findSubscribersByEmailsIn,
    ensureAllSubscribersLoaded,
    refreshAssignments,
  ])

  /** Paste emails → revoke those users from every stream in one click. */
  const bulkRevokeFromEmails = useCallback(async () => {
    if (!bulkEmailRevokeSearch.trim()) {
      setError("Please enter email addresses")
      return
    }
    const emails = parseBulkEmails(bulkEmailRevokeSearch)
    if (emails.length === 0) {
      setError("No valid email addresses found")
      return
    }

    setBulkLoading(true)
    setError("")
    setSuccess("")
    try {
      const allSubs = await ensureAllSubscribersLoaded()
      const { ids: subscriberIds, missing } = findSubscribersByEmailsIn(emails, allSubs)
      if (subscriberIds.length === 0) {
        setError("No subscribers found with those email addresses")
        return
      }
      if (
        !window.confirm(
          `Remove ALL stream access for ${subscriberIds.length} subscriber(s)?\n\nThey will lose access to every live stream.`,
        )
      ) {
        return
      }

      const result = await bulkDeleteStreamAssignments({ subscriberIds })
      invalidateStreamAssignmentsBootstrap()
      let msg = `Cleared ${result.deleted} assignment(s) for ${subscriberIds.length} subscriber(s) across all streams.`
      if (missing.length) msg += ` Not found: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}.`
      setSuccess(msg)
      setBulkEmailRevokeSearch("")
      setBulkEmailRevokeDialogOpen(false)
      await refreshAssignments()
    } catch (e: any) {
      setError(e?.message || "Bulk email revoke failed")
    } finally {
      setBulkLoading(false)
    }
  }, [
    bulkEmailRevokeSearch,
    parseBulkEmails,
    findSubscribersByEmailsIn,
    ensureAllSubscribersLoaded,
    refreshAssignments,
  ])

  /** Selected users only → revoke from every stream (no stream selection needed). */
  const clearSelectedFromAllStreams = useCallback(async () => {
    if (selectedSubscribers.size === 0) {
      setError("Please select at least one subscriber")
      return
    }
    if (
      !window.confirm(
        `Remove ALL stream access for ${selectedSubscribers.size} selected subscriber(s)?\n\nThey will lose access to every live stream.`,
      )
    ) {
      return
    }

    setBulkLoading(true)
    setError("")
    setSuccess("")
    try {
      const result = await bulkDeleteStreamAssignments({
        subscriberIds: Array.from(selectedSubscribers),
      })
      invalidateStreamAssignmentsBootstrap()
      setSuccess(
        `Cleared ${result.deleted} assignment(s) for ${selectedSubscribers.size} selected subscriber(s) across all streams.`,
      )
      setSelectedSubscribers(new Set())
      await refreshAssignments()
    } catch (e: any) {
      setError(e?.message || "Failed to clear selected subscribers")
    } finally {
      setBulkLoading(false)
    }
  }, [selectedSubscribers, refreshAssignments])

  // Bulk assign selected subscribers to selected streams (server-side batch)
  const bulkAssign = useCallback(async () => {
    if (selectedSubscribers.size === 0 || selectedStreams.size === 0) {
      setError("Please select at least one subscriber and one stream")
      return
    }

    setBulkLoading(true)
    setError("")
    setSuccess("")

    try {
      const result = await bulkCreateStreamAssignments({
        subscriberIds: Array.from(selectedSubscribers),
        streamSessionIds: Array.from(selectedStreams),
      })
      invalidateStreamAssignmentsBootstrap()
      let successMsg = ""
      if (result.created > 0) successMsg += `Created ${result.created} new assignment(s). `
      if (result.reactivated > 0) successMsg += `Reactivated ${result.reactivated} assignment(s). `
      if (result.skipped > 0) successMsg += `Skipped ${result.skipped} already active.`
      setSuccess(
        successMsg ||
          `No changes needed — all ${result.subscriberCount ?? selectedSubscribers.size} × ${result.streamCount ?? selectedStreams.size} already assigned.`,
      )
      setSelectedSubscribers(new Set())
      setSelectedStreams(new Set())
      await refreshAssignments()
    } catch (e: any) {
      setError(e?.message || "Bulk assignment failed")
    } finally {
      setBulkLoading(false)
    }
  }, [selectedSubscribers, selectedStreams, refreshAssignments])

  /** Load every subscriber, select all live streams, assign the full cross-product. */
  const assignAllToAll = useCallback(async () => {
    setBulkLoading(true)
    setError("")
    setSuccess("")
    try {
      const allSubs = await ensureAllSubscribersLoaded()
      const q = searchSubs.trim().toLowerCase()
      const scopedSubs = q
        ? allSubs.filter((s) => {
            const name = (s.displayName || "").toLowerCase()
            const email = (s.email || "").toLowerCase()
            return name.includes(q) || email.includes(q)
          })
        : allSubs
      const streamIds = filteredStreamIds
      if (!scopedSubs.length || !streamIds.length) {
        setError("Need at least one subscriber and one live stream")
        return
      }
      setSelectedSubscribers(new Set(scopedSubs.map((s) => s.id)))
      setSelectedStreams(new Set(streamIds))
      const result = await bulkCreateStreamAssignments({
        subscriberIds: scopedSubs.map((s) => s.id),
        streamSessionIds: streamIds,
      })
      invalidateStreamAssignmentsBootstrap()
      setSuccess(
        `Assigned ${result.subscriberCount ?? scopedSubs.length} subscriber(s) to ${result.streamCount ?? streamIds.length} stream(s): ${result.created} created, ${result.reactivated} reactivated, ${result.skipped} already active.`,
      )
      setSelectedSubscribers(new Set())
      setSelectedStreams(new Set())
      await refreshAssignments()
    } catch (e: any) {
      setError(e?.message || "Assign all failed")
    } finally {
      setBulkLoading(false)
    }
  }, [
    ensureAllSubscribersLoaded,
    searchSubs,
    filteredStreamIds,
    refreshAssignments,
  ])

  // Bulk unassign selected cross-product (server batch)
  const bulkUnassign = useCallback(async () => {
    if (selectedSubscribers.size === 0 || selectedStreams.size === 0) {
      setError("Please select at least one subscriber and one stream")
      return
    }

    setBulkLoading(true)
    setError("")
    setSuccess("")

    try {
      const result = await bulkDeleteStreamAssignments({
        subscriberIds: Array.from(selectedSubscribers),
        streamSessionIds: Array.from(selectedStreams),
      })
      invalidateStreamAssignmentsBootstrap()
      setSuccess(
        `Removed ${result.deleted} assignment(s) for ${selectedSubscribers.size} subscriber(s) × ${selectedStreams.size} stream(s)`,
      )
      setSelectedSubscribers(new Set())
      setSelectedStreams(new Set())
      await refreshAssignments()
    } catch (e: any) {
      setError(e?.message || "Bulk unassignment failed")
    } finally {
      setBulkLoading(false)
    }
  }, [selectedSubscribers, selectedStreams, refreshAssignments])

  /** One click: revoke everyone from one live stream (clear column). */
  const clearStreamColumn = useCallback(
    async (streamId: string, label: string) => {
      if (
        !window.confirm(
          `Remove ALL subscriber access from “${label}”?\n\nThis clears the whole stream column — no one-by-one clicks.`,
        )
      ) {
        return
      }
      setBulkLoading(true)
      setError("")
      setSuccess("")
      try {
        const result = await bulkDeleteStreamAssignments({ streamSessionIds: [streamId] })
        invalidateStreamAssignmentsBootstrap()
        setSuccess(`Cleared ${result.deleted} assignment(s) from “${label}”`)
        await refreshAssignments()
      } catch (e: any) {
        setError(e?.message || "Failed to clear stream")
      } finally {
        setBulkLoading(false)
      }
    },
    [refreshAssignments],
  )

  /** One click: revoke every stream for one subscriber (clear row). */
  const clearSubscriberRow = useCallback(
    async (subscriberId: string, label: string) => {
      if (
        !window.confirm(
          `Remove ALL stream access for “${label}”?\n\nThis clears their entire row.`,
        )
      ) {
        return
      }
      setBulkLoading(true)
      setError("")
      setSuccess("")
      try {
        const result = await bulkDeleteStreamAssignments({ subscriberIds: [subscriberId] })
        invalidateStreamAssignmentsBootstrap()
        setSuccess(`Cleared ${result.deleted} assignment(s) for “${label}”`)
        await refreshAssignments()
      } catch (e: any) {
        setError(e?.message || "Failed to clear subscriber")
      } finally {
        setBulkLoading(false)
      }
    },
    [refreshAssignments],
  )

  // Toggle subscriber selection
  const toggleSubscriberSelection = useCallback((id: string) => {
    setSelectedSubscribers((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }, [])

  // Toggle stream selection
  const toggleStreamSelection = useCallback((id: string) => {
    setSelectedStreams((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }, [])

  const toggleAllSubscribers = useCallback(async () => {
    if (allFilteredSubscribersSelected) {
      setSelectedSubscribers(new Set())
      return
    }
    setBulkLoading(true)
    try {
      const allSubs = await ensureAllSubscribersLoaded()
      const q = searchSubs.trim().toLowerCase()
      const scoped = q
        ? allSubs.filter((s) => {
            const name = (s.displayName || "").toLowerCase()
            const email = (s.email || "").toLowerCase()
            return name.includes(q) || email.includes(q)
          })
        : allSubs
      setSelectedSubscribers(new Set(scoped.map((s) => s.id)))
    } catch (e: any) {
      setError(e?.message || "Failed to load all subscribers")
    } finally {
      setBulkLoading(false)
    }
  }, [allFilteredSubscribersSelected, ensureAllSubscribersLoaded, searchSubs])

  const toggleAllStreams = useCallback(() => {
    if (filteredStreamIds.length === 0) return
    if (allFilteredStreamsSelected) {
      setSelectedStreams(new Set())
    } else {
      setSelectedStreams(new Set(filteredStreamIds))
    }
  }, [filteredStreamIds, allFilteredStreamsSelected])

  const toggleBulkEmailAllStreams = useCallback(() => {
    if (filteredStreamIds.length === 0) return
    if (allBulkEmailStreamsSelected) {
      setBulkEmailSelectedStreams(new Set())
    } else {
      setBulkEmailSelectedStreams(new Set(filteredStreamIds))
    }
  }, [filteredStreamIds, allBulkEmailStreamsSelected])

  // Toggle bulk email stream selection
  const toggleBulkEmailStreamSelection = useCallback((id: string) => {
    setBulkEmailSelectedStreams((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }, [])

  const parsedEmails = parseBulkEmails(bulkEmailSearch)
  const foundSubscribers = findSubscribersByEmailsIn(parsedEmails, subscribers).ids
  const parsedRevokeEmails = parseBulkEmails(bulkEmailRevokeSearch)
  const foundRevokeSubscribers = findSubscribersByEmailsIn(parsedRevokeEmails, subscribers).ids

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Stream Assignments</CardTitle>
          <CardDescription>
            Assign subscribers directly to streams. Subscribers will have access to the assigned streams.
            {dataLoading && (
              <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading…
              </span>
            )}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Bulk Email Assignment Dialog */}
        <Dialog open={bulkEmailDialogOpen} onOpenChange={setBulkEmailDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full h-auto py-6 flex flex-col items-center gap-2">
              <Mail className="h-6 w-6" />
              <div className="text-center">
                <div className="font-semibold">Bulk Email Assignment</div>
                <div className="text-xs text-muted-foreground">Assign multiple subscribers by email</div>
              </div>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Bulk Email Assignment</DialogTitle>
              <DialogDescription>
                Enter email addresses and select streams to assign them to
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="bulkEmails">Email Addresses</Label>
                <Textarea
                  id="bulkEmails"
                  placeholder="user1@example.com, user2@example.com&#10;user3@example.com"
                  value={bulkEmailSearch}
                  onChange={(e) => setBulkEmailSearch(e.target.value)}
                  rows={4}
                  className="font-mono text-sm"
                />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Found: {parsedEmails.length} email(s)</span>
                  {foundSubscribers.length > 0 && (
                    <Badge variant="secondary">{foundSubscribers.length} subscriber(s) found</Badge>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Label className="shrink-0">Select Streams</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto shrink-0"
                    onClick={toggleBulkEmailAllStreams}
                    disabled={filteredStreamIds.length === 0}
                  >
                    {allBulkEmailStreamsSelected ? (
                      <>
                        <Square className="h-4 w-4 mr-2 shrink-0" />
                        Deselect all streams
                      </>
                    ) : (
                      <>
                        <CheckSquare className="h-4 w-4 mr-2 shrink-0" />
                        Select all streams
                      </>
                    )}
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto p-2 border rounded-lg">
                  {filteredStreams.map((stream) => (
                    <div
                      key={stream.id}
                      className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                        bulkEmailSelectedStreams.has(stream.id!)
                          ? "bg-primary/10 border-primary"
                          : "hover:bg-muted"
                      }`}
                      onClick={() => toggleBulkEmailStreamSelection(stream.id!)}
                    >
                      <Checkbox
                        checked={bulkEmailSelectedStreams.has(stream.id!)}
                        onCheckedChange={() => toggleBulkEmailStreamSelection(stream.id!)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {stream.title || stream.publisherName}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          {stream.isActive ? (
                            <Badge variant="destructive" className="text-xs">LIVE</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">Ended</Badge>
                          )}
                          <span className="truncate">{stream.publisherName}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">
                  {bulkEmailSelectedStreams.size} stream(s) selected
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setBulkEmailDialogOpen(false)
                  setBulkEmailSearch("")
                  setBulkEmailSelectedStreams(new Set())
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void bulkAssignFromEmails()}
                disabled={bulkLoading || !bulkEmailSearch.trim() || bulkEmailSelectedStreams.size === 0}
              >
                {bulkLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Assign {foundSubscribers.length > 0 ? `${foundSubscribers.length} ` : ""}Subscriber(s)
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Email Revoke — paste emails, remove from all streams */}
        <Dialog open={bulkEmailRevokeDialogOpen} onOpenChange={setBulkEmailRevokeDialogOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className="w-full h-auto py-6 flex flex-col items-center gap-2 border-destructive/40"
            >
              <Eraser className="h-6 w-6 text-destructive" />
              <div className="text-center">
                <div className="font-semibold">Revoke by email</div>
                <div className="text-xs text-muted-foreground">Paste emails → clear all stream access</div>
              </div>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Revoke access by email</DialogTitle>
              <DialogDescription>
                Paste subscriber emails (comma or new-line separated). One click removes their access from every
                live stream — no stream picking needed.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Label htmlFor="bulkRevokeEmails">Email Addresses</Label>
              <Textarea
                id="bulkRevokeEmails"
                placeholder="user1@example.com, user2@example.com&#10;user3@example.com"
                value={bulkEmailRevokeSearch}
                onChange={(e) => setBulkEmailRevokeSearch(e.target.value)}
                rows={6}
                className="font-mono text-sm"
              />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{parsedRevokeEmails.length} email(s) pasted</span>
                {foundRevokeSubscribers.length > 0 && (
                  <Badge variant="secondary">{foundRevokeSubscribers.length} matched in loaded list</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Matching runs against all subscribers when you click revoke (not just the first page).
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setBulkEmailRevokeDialogOpen(false)
                  setBulkEmailRevokeSearch("")
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void bulkRevokeFromEmails()}
                disabled={bulkLoading || !bulkEmailRevokeSearch.trim()}
              >
                {bulkLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Revoking...
                  </>
                ) : (
                  <>
                    <Eraser className="h-4 w-4 mr-2" />
                    Remove from all streams
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Matrix View Toggle */}
        <Button
          variant="outline"
          className="w-full h-auto py-6 flex flex-col items-center gap-2"
          onClick={() => setMatrixExpanded(!matrixExpanded)}
        >
          <Grid3x3 className="h-6 w-6" />
          <div className="text-center">
            <div className="font-semibold">Matrix View</div>
            <div className="text-xs text-muted-foreground">
              {matrixExpanded ? "Collapse" : "Expand"} assignment matrix
            </div>
          </div>
        </Button>
      </div>

      {/* Bulk Actions Bar */}
      <Card className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex flex-col gap-2 w-full sm:flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-sm sm:text-base px-2 sm:px-3 py-1">
                  <Users className="h-4 w-4 mr-1" />
                  {selectedSubscribers.size} Subscribers
                </Badge>
                <Badge variant="secondary" className="text-sm sm:text-base px-2 sm:px-3 py-1">
                  <Radio className="h-4 w-4 mr-1" />
                  {selectedStreams.size} Streams
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2 w-full">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 min-w-[140px] sm:flex-initial"
                  onClick={() => void toggleAllSubscribers()}
                  disabled={filteredSubscribers.length === 0 || bulkLoading}
                >
                  {allFilteredSubscribersSelected ? (
                    <>
                      <Square className="h-4 w-4 mr-2 shrink-0" />
                      Deselect subscribers
                    </>
                  ) : (
                    <>
                      <CheckSquare className="h-4 w-4 mr-2 shrink-0" />
                      Select all subscribers
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 min-w-[140px] sm:flex-initial"
                  onClick={toggleAllStreams}
                  disabled={filteredStreamIds.length === 0}
                >
                  {allFilteredStreamsSelected ? (
                    <>
                      <Square className="h-4 w-4 mr-2 shrink-0" />
                      Deselect streams
                    </>
                  ) : (
                    <>
                      <CheckSquare className="h-4 w-4 mr-2 shrink-0" />
                      Select all streams
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="flex-1 hidden sm:block" />

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <Button
                onClick={() => void assignAllToAll()}
                disabled={bulkLoading || filteredStreamIds.length === 0}
                className="bg-primary text-primary-foreground hover:bg-primary/90 flex-1 sm:flex-initial"
                size="sm"
                title="Load every subscriber, then assign them all to every live stream"
              >
                {bulkLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckSquare className="h-4 w-4 mr-2" />
                )}
                Assign all → all streams
              </Button>
              <Button
                onClick={() => void clearSelectedFromAllStreams()}
                disabled={bulkLoading || selectedSubscribers.size === 0}
                variant="destructive"
                className="flex-1 sm:flex-initial"
                size="sm"
                title="Remove selected subscribers from every stream — no stream selection needed"
              >
                {bulkLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Users className="h-4 w-4 mr-2" />
                )}
                Clear selected → all streams
              </Button>
              <Button
                onClick={bulkAssign}
                disabled={bulkLoading || selectedSubscribers.size === 0 || selectedStreams.size === 0}
                className="bg-green-600 hover:bg-green-700 flex-1 sm:flex-initial"
                size="sm"
              >
                {bulkLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                <span className="hidden xs:inline">Assign Selected</span>
                <span className="xs:hidden">Assign</span>
              </Button>

              <Button
                onClick={() => void bulkUnassign()}
                disabled={bulkLoading || selectedSubscribers.size === 0 || selectedStreams.size === 0}
                variant="destructive"
                className="flex-1 sm:flex-initial"
                size="sm"
              >
                {bulkLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <X className="h-4 w-4 mr-2" />
                )}
                <span className="hidden xs:inline">Unassign Selected</span>
                <span className="xs:hidden">Unassign</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* One-click revoke by live stream — faster than hunting matrix columns */}
      {filteredStreams.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Clear by stream</CardTitle>
            <CardDescription>
              One button per live call — removes every subscriber from that stream. Use this instead of unchecking
              the matrix cell by cell.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {filteredStreams.map((stream) => {
                const label = stream.title || stream.publisherName || "Stream"
                return (
                  <Button
                    key={stream.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={bulkLoading}
                    className="border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={() => void clearStreamColumn(stream.id!, label)}
                    title={`Clear all access from ${label}`}
                  >
                    <Eraser className="h-3.5 w-3.5 mr-1.5" />
                    <span className="max-w-[160px] truncate">{label}</span>
                  </Button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Collapsible Matrix View */}
      <Collapsible open={matrixExpanded} onOpenChange={setMatrixExpanded}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Assignment Matrix</CardTitle>
                  <CardDescription>
                    Spot-check only. Prefer Clear by stream / Clear selected for mass revoke. Each column and row
                    also has a Clear button.
                  </CardDescription>
                </div>
                {matrixExpanded ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search subscribers (email or name)..."
                      value={searchSubs}
                      onChange={(e) => setSearchSubs(e.target.value)}
                      className="pl-9"
                    />
                    {searchingSubs ? (
                      <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                    ) : null}
                  </div>
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search streams..."
                      value={searchStreams}
                      onChange={(e) => setSearchStreams(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="border border-border rounded-lg overflow-hidden bg-card">
                  <div
                    onScroll={handleMatrixScroll}
                    className="overflow-auto max-h-[500px]"
                    style={{ scrollbarWidth: "thin" }}
                  >
                    <div className="inline-block min-w-full">
                      <table className="w-full border-collapse">
                        <thead className="sticky top-0 bg-muted z-10">
                          <tr>
                            <th className="border border-border p-2 text-left bg-muted font-semibold min-w-[200px] sticky left-0 z-20">
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate text-xs sm:text-sm">Subscriber \ Stream</span>
                                  <Checkbox
                                    checked={allFilteredSubscribersSelected}
                                    onCheckedChange={() => void toggleAllSubscribers()}
                                    title="Select or deselect all subscribers matching the search"
                                    className={MATRIX_CHECKBOX_CLASS}
                                  />
                                </div>
                                <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/70">
                                  <span className="text-[10px] sm:text-xs text-muted-foreground leading-tight">
                                    All streams (bulk)
                                  </span>
                                  <Checkbox
                                    checked={allFilteredStreamsSelected}
                                    onCheckedChange={toggleAllStreams}
                                    disabled={filteredStreamIds.length === 0}
                                    title="Select or deselect all live streams matching the stream search"
                                    className={MATRIX_CHECKBOX_CLASS}
                                  />
                                </div>
                              </div>
                            </th>
                            {streamsForMatrix.map((stream) => (
                              <th
                                key={stream.id}
                                className="border border-border p-2 text-left bg-muted font-medium min-w-[150px]"
                              >
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="truncate text-xs" title={stream.title || stream.publisherName}>
                                      {stream.title || stream.publisherName}
                                    </div>
                                    <Checkbox
                                      checked={selectedStreams.has(stream.id!)}
                                      onCheckedChange={() => toggleStreamSelection(stream.id!)}
                                      className={MATRIX_CHECKBOX_CLASS}
                                    />
                                  </div>
                                  <div className="flex items-center justify-between gap-1">
                                    <div className="text-xs text-muted-foreground">
                                      {stream.isActive ? (
                                        <Badge variant="destructive" className="text-xs">LIVE</Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-xs">Ended</Badge>
                                      )}
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-1.5 text-[10px] text-destructive hover:text-destructive"
                                      disabled={bulkLoading}
                                      title="Clear entire column — revoke everyone from this stream"
                                      onClick={() =>
                                        void clearStreamColumn(
                                          stream.id!,
                                          stream.title || stream.publisherName || "Stream",
                                        )
                                      }
                                    >
                                      <Eraser className="h-3 w-3 mr-0.5" />
                                      Clear
                                    </Button>
                                  </div>
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {subsForMatrix.map((sub, rowIndex) => (
                            <tr
                              key={sub.id}
                              className={cn(
                                "hover:bg-muted/40",
                                rowIndex % 2 === 1 && "bg-muted/15",
                              )}
                            >
                              <td className="border border-border p-2 font-medium bg-muted/60 sticky left-0 z-10">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="truncate text-xs sm:text-sm" title={sub.displayName || sub.email}>
                                    {sub.displayName || sub.email}
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-1 text-[10px] text-destructive hover:text-destructive"
                                      disabled={bulkLoading}
                                      title="Clear entire row — revoke all streams for this subscriber"
                                      onClick={() =>
                                        void clearSubscriberRow(sub.id, sub.displayName || sub.email || "Subscriber")
                                      }
                                    >
                                      <Eraser className="h-3 w-3" />
                                    </Button>
                                    <Checkbox
                                      checked={selectedSubscribers.has(sub.id)}
                                      onCheckedChange={() => toggleSubscriberSelection(sub.id)}
                                      className={MATRIX_CHECKBOX_CLASS}
                                    />
                                  </div>
                                </div>
                              </td>
                              {streamsForMatrix.map((stream) => (
                                <MatrixCell
                                  key={stream.id}
                                  assigned={isAssigned(sub.id, stream.id!)}
                                  disabled={togglingCells.has(cellKey(sub.id, stream.id!))}
                                  onToggle={(next) => toggleAssignment(sub.id, stream.id!, next)}
                                />
                              ))}
                            </tr>
                          ))}
                          {(matrixColsVisible < filteredStreams.length ||
                            matrixRowsVisible < filteredSubscribers.length) && (
                            <tr>
                              <td
                                colSpan={Math.max(streamsForMatrix.length, 1) + 1}
                                className="border p-2 text-center text-xs text-muted-foreground bg-muted/50"
                              >
                                {matrixRowsVisible < filteredSubscribers.length && (
                                  <span>
                                    Showing {matrixRowsVisible} of {filteredSubscribers.length} loaded subscribers — scroll
                                    down to load more rows.
                                  </span>
                                )}
                                {subscribersHasMore && matrixRowsVisible >= filteredSubscribers.length && (
                                  <span>
                                    {loadingMoreSubscribers
                                      ? "Loading more subscribers from server…"
                                      : "Scroll down to fetch the next 100 subscribers."}
                                  </span>
                                )}
                                {matrixRowsVisible < filteredSubscribers.length &&
                                  matrixColsVisible < filteredStreams.length && <span className="mx-1">·</span>}
                                {matrixColsVisible < filteredStreams.length && (
                                  <span>
                                    Showing {matrixColsVisible} of {filteredStreams.length} streams — scroll right to
                                    load {Math.min(MATRIX_PAGE_SIZE, filteredStreams.length - matrixColsVisible)} more.
                                  </span>
                                )}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  )
}

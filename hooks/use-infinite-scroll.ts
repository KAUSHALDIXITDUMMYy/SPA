"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { PaginatedResult } from "@/lib/pagination"

type FetchPage<T> = (cursor: string | null) => Promise<PaginatedResult<T>>

export function useInfiniteScroll<T>(input: {
  fetchPage: FetchPage<T>
  enabled?: boolean
  resetKey?: string | number
  merge?: (prev: T[], next: T[]) => T[]
}) {
  const { fetchPage, enabled = true, resetKey = "", merge } = input
  const [items, setItems] = useState<T[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const loadingMoreRef = useRef(false)

  const mergeItems = useCallback(
    (prev: T[], next: T[]) => (merge ? merge(prev, next) : [...prev, ...next]),
    [merge],
  )

  const loadInitial = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    setError("")
    try {
      const page = await fetchPage(null)
      setItems(page.items)
      setCursor(page.nextCursor)
      setHasMore(page.hasMore)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load")
      setItems([])
      setCursor(null)
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }, [enabled, fetchPage])

  const loadMore = useCallback(async () => {
    if (!enabled || !hasMore || !cursor || loadingMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    setError("")
    try {
      const page = await fetchPage(cursor)
      setItems((prev) => mergeItems(prev, page.items))
      setCursor(page.nextCursor)
      setHasMore(page.hasMore)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more")
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [enabled, hasMore, cursor, fetchPage, mergeItems])

  const reset = useCallback(async () => {
    setItems([])
    setCursor(null)
    setHasMore(false)
    await loadInitial()
  }, [loadInitial])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    void loadInitial()
  }, [enabled, resetKey, loadInitial])

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !enabled || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore()
      },
      { rootMargin: "200px" },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [enabled, hasMore, loadMore, items.length])

  return {
    items,
    setItems,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    reset,
    sentinelRef,
  }
}

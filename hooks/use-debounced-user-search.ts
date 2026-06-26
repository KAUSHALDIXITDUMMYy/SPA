"use client"

import { useEffect, useState } from "react"
import { searchUsersByRole } from "@/lib/admin"
import type { UserProfile } from "@/lib/auth"
import type { UserRole } from "@/lib/auth"

const DEFAULT_MIN_LENGTH = 2
const DEFAULT_DEBOUNCE_MS = 300

export function useDebouncedUserSearch(
  role: UserRole,
  query: string,
  options?: { minLength?: number; debounceMs?: number },
) {
  const minLength = options?.minLength ?? DEFAULT_MIN_LENGTH
  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const trimmed = query.trim()
  const isSearchActive = trimmed.length >= minLength
  const [searchResults, setSearchResults] = useState<(UserProfile & { id: string })[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!isSearchActive) {
      setSearchResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    const handle = setTimeout(() => {
      void searchUsersByRole(role, trimmed)
        .then((items) => {
          setSearchResults(items)
        })
        .catch(() => {
          setSearchResults([])
        })
        .finally(() => {
          setSearching(false)
        })
    }, debounceMs)

    return () => clearTimeout(handle)
  }, [role, trimmed, isSearchActive, debounceMs])

  return { searchResults, searching, isSearchActive }
}

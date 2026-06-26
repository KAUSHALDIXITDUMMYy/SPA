export const PAGE_SIZE = 100

export const MAX_PAGE_SIZE = 100

export type PaginatedResult<T> = {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
}

export function normalizePageLimit(limit?: number): number {
  if (!limit || !Number.isFinite(limit)) return PAGE_SIZE
  return Math.min(Math.max(1, Math.floor(limit)), MAX_PAGE_SIZE)
}

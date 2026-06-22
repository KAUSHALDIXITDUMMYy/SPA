/**
 * Firestore collection names — LIVE (our app) vs DECOY (legacy names clone sites still read).
 *
 * After migration, only write LIVE collections for real data.
 * Write DECOY schedule manually from admin when you want to feed false info to clones.
 */

export const FS = {
  schedule: {
    live: "sm_sched_v7",
    decoy: "dailySchedule",
    docId: "current",
  },
  streams: {
    live: "sm_streams_v7",
    decoy: "streamSessions",
  },
  scheduledCalls: {
    live: "sm_calls_v7",
    decoy: "scheduledCalls",
  },
  streamPermissions: {
    live: "sm_perms_v7",
    decoy: "streamPermissions",
  },
  streamAssignments: {
    live: "sm_assign_v7",
    decoy: "streamAssignments",
  },
  users: "users",
  streamAnalytics: "streamAnalytics",
  activeViewers: "activeViewers",
  streamChatMessages: "streamChatMessages",
  zoomCalls: "zoomCalls",
  zoomCallAssignments: "zoomCallAssignments",
  zoomPublisherAssignments: "zoomPublisherAssignments",
  contactMessages: "contactMessages",
  adminBroadcasts: "adminBroadcasts",
  reports: "reports",
  blockEvents: "blockEvents",
  accessLogs: "accessLogs",
  mfaSecrets: "mfaSecrets",
  cleanupLogs: "cleanupLogs",
} as const

/** Live stream docs use this field instead of legacy `roomId`. */
export const STREAM_CHANNEL_FIELD = "channelKey"

export function channelFromStreamData(data: Record<string, unknown>): string {
  const key = data[STREAM_CHANNEL_FIELD] ?? data.roomId
  return key != null ? String(key) : ""
}

/** Fields to persist on a new/updated live stream session. */
export function streamWritePayload(
  data: Record<string, unknown> & { roomId?: string; channelKey?: string },
): Record<string, unknown> {
  const channel = data.channelKey ?? data.roomId ?? ""
  const { roomId: _drop, channelKey: _drop2, ...rest } = data
  return { ...rest, [STREAM_CHANNEL_FIELD]: channel }
}

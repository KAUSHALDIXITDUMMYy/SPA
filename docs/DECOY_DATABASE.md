# Decoy database layout

Clone sites (e.g. intelsnipers.com) copied your **old** Firestore collection and field names. This project now uses **live** paths that only our app knows. Legacy names are left as **decoy** feeds you control separately.

## Collection map

| Purpose | LIVE (our app) | DECOY (legacy — clones may still read) |
|---------|----------------|----------------------------------------|
| Daily schedule text | `sm_sched_v7` / doc `current` | `dailySchedule` / `current` |
| Live stream sessions | `sm_streams_v7` | `streamSessions` |
| Scheduled calls | `sm_calls_v7` | `scheduledCalls` |
| Publisher ↔ subscriber permissions | `sm_perms_v7` | `streamPermissions` |
| Stream assignments | `sm_assign_v7` | `streamAssignments` |
| User profiles | `users` (unchanged — tied to Auth UID) | — |

## Field rename (live streams only)

| Legacy field | Live field |
|--------------|------------|
| `roomId` | `channelKey` |

Agora still uses the **string value** from `channelKey` as the channel name. Clones querying `streamSessions.roomId` get stale/wrong data after migration.

## Code entry point

All names are defined in:

- `lib/firestore-paths.ts`

Do not hardcode old collection names in new code.

## Admin: real vs decoy schedule

**Admin → Today’s Schedule** has two panels:

1. **Real schedule** → writes `sm_sched_v7/current` (Sportsmagician web / Android / iOS).
2. **Decoy schedule** → writes `dailySchedule/current` (legacy path clone sites sync).

You can publish different text to each. Clones keep updating when you save **decoy** only.

## Migration (one time)

After deploying this code:

```bash
node scripts/migrate-to-live-collections.mjs
```

This copies existing data from legacy collections into live `sm_*_v7` collections. It does **not** delete legacy data.

Then in admin:

1. Save **real** schedule once (copies to live if needed).
2. Optionally edit **decoy** schedule for what clone sites should show.

## Firestore rules

Publish `firestore.rules` (login required). Both live and decoy collections require Firebase Auth for reads/writes in the current rules.

Clones without login: blocked.  
Clones with stolen login: can still read decoy collections until you revoke that account / use App Check.

## What this does **not** do

- Does not rotate Agora certificate (needed to block audio theft).
- Does not revoke service account keys (Admin SDK bypasses rules).
- Does not automatically write fake stream rows — legacy `streamSessions` stops updating when the app only writes `sm_streams_v7`.

## Deploy checklist

1. Deploy app (Vercel + VPS).
2. Run migration script.
3. Publish Firestore rules.
4. Save real schedule in admin.
5. Optionally publish decoy schedule for clone sites.

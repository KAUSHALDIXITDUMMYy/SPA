/**
 * Migrate ALL data from an OLD Firebase project to a NEW Firebase project.
 *
 * What it does:
 *   1. Copies every Firestore collection / document / subcollection (IDs preserved,
 *      Timestamps / GeoPoints preserved, DocumentReferences re-pointed at the new DB).
 *   2. Copies every Firebase Auth user (UID + email + displayName preserved) and sets a
 *      BRAND-NEW strong password for each one, writing the new credentials to a file.
 *
 * Why the password reset matters: the whole point of the move is to lock out whoever has
 * access. Carrying over the old (weak / shared / plaintext) passwords would hand them the
 * new database too. After this runs, every old password is dead.
 *
 * ─── SETUP (do this once) ──────────────────────────────────────────────────────────────
 *   Download a service-account key for EACH project:
 *     Firebase Console → Project Settings → Service accounts → Generate new private key
 *
 *   Put them here (these names are gitignored — never commit them):
 *     scripts/source-service-account.json   ← the OLD (compromised) project
 *     scripts/dest-service-account.json     ← the NEW project
 *
 *   Or pass them via env:
 *     SOURCE_SERVICE_ACCOUNT='{...json...}'   DEST_SERVICE_ACCOUNT='{...json...}'
 *
 * ─── RUN ───────────────────────────────────────────────────────────────────────────────
 *   Dry run (reads source, writes NOTHING):   node scripts/migrate-to-new-project.mjs --dry-run
 *   Real run:                                  node scripts/migrate-to-new-project.mjs
 *   Skip auth (Firestore only):                node scripts/migrate-to-new-project.mjs --no-auth
 *   Exclude attacker accounts:                 node scripts/migrate-to-new-project.mjs --exclude=bad@x.com,evil@y.com
 *   Only users active in the last 7 days:      node scripts/migrate-to-new-project.mjs --active-since-days=7
 */

import admin from "firebase-admin"
import { existsSync, readFileSync, writeFileSync } from "fs"
import { randomBytes } from "crypto"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ── CLI flags ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const DRY_RUN = args.includes("--dry-run")
const NO_AUTH = args.includes("--no-auth")
const NO_FIRESTORE = args.includes("--no-firestore")
// Subcollection discovery costs one round-trip PER DOCUMENT, which is crippling on
// large flat collections. This app has no subcollections, so it's skipped by default.
// Pass --deep to walk subcollections (only needed if your data model nests them).
const DEEP = args.includes("--deep")

// Resume helpers (Spark plan caps writes at 20k/day; avoid re-writing finished collections).
//   --collections=a,b,c       only migrate these root collections
//   --skip-collections=a,b    migrate everything except these
//   --skip-existing           skip docs that already exist in the destination
function parseList(prefix) {
  const flag = args.find((a) => a.startsWith(prefix))
  if (!flag) return null
  return new Set(
    flag
      .replace(prefix, "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  )
}
const ONLY_COLLECTIONS = parseList("--collections=")
const SKIP_COLLECTIONS = parseList("--skip-collections=")
const SKIP_EXISTING = args.includes("--skip-existing")
const EXCLUDE_EMAILS = new Set(
  (args.find((a) => a.startsWith("--exclude=")) || "")
    .replace("--exclude=", "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
)

// When set (e.g. --active-since-days=7), only Auth users who signed in within the last N
// days are migrated. Firestore data is still copied in full unless --no-firestore is used.
const ACTIVE_SINCE_DAYS = (() => {
  const flag = args.find((a) => a.startsWith("--active-since-days="))
  if (!flag) return null
  const n = Number(flag.replace("--active-since-days=", ""))
  return Number.isFinite(n) && n > 0 ? n : null
})()
const ACTIVE_SINCE_MS = ACTIVE_SINCE_DAYS ? Date.now() - ACTIVE_SINCE_DAYS * 24 * 60 * 60 * 1000 : null

/** True when a user's last sign-in is within the --active-since-days window (or no filter set). */
function isRecentlyActive(user) {
  if (ACTIVE_SINCE_MS == null) return true
  const lastSignIn = user.metadata?.lastSignInTime || user.metadata?.lastRefreshTime
  if (!lastSignIn) return false
  const t = new Date(lastSignIn).getTime()
  return Number.isFinite(t) && t >= ACTIVE_SINCE_MS
}

const BATCH_LIMIT = 450 // Firestore hard cap is 500 writes per batch.

// ── Credential loading ───────────────────────────────────────────────────────
function loadServiceAccount(envVar, ...fileCandidates) {
  if (process.env[envVar]) {
    try {
      return JSON.parse(process.env[envVar])
    } catch {
      throw new Error(`${envVar} is set but is not valid JSON.`)
    }
  }
  for (const file of fileCandidates) {
    if (existsSync(file)) {
      return JSON.parse(readFileSync(file, "utf8"))
    }
  }
  throw new Error(
    `Could not find credentials. Set ${envVar} or place one of: ${fileCandidates.join(", ")}`,
  )
}

function initApp(serviceAccount, name) {
  return admin.initializeApp(
    {
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    },
    name,
  )
}

// ── Firestore migration ────────────────────────────────────────────────────────
let docsCopied = 0
let collectionsSeen = 0

/** Re-point a source DocumentReference at the destination DB so links stay valid. */
function remapValue(value, destDb) {
  if (value instanceof admin.firestore.DocumentReference) {
    return destDb.doc(value.path)
  }
  if (Array.isArray(value)) {
    return value.map((v) => remapValue(v, destDb))
  }
  if (value && typeof value === "object" && value.constructor === Object) {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = remapValue(v, destDb)
    return out
  }
  // Timestamps, GeoPoints, Buffers, primitives, null → copied as-is (portable).
  return value
}

/** Run an async mapper over items with bounded concurrency. */
async function mapWithConcurrency(items, limit, mapper) {
  const results = []
  let index = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++
      results[i] = await mapper(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}

const SUBCOLLECTION_CONCURRENCY = 25

async function copyCollection(sourceColRef, destDb) {
  collectionsSeen++
  const snapshot = await sourceColRef.get()
  if (snapshot.empty) {
    console.log(`   • ${sourceColRef.path}: 0 docs`)
    return
  }

  // 1. Copy this collection's documents in batches (skipped on dry run).
  let written = 0
  let skipped = 0
  if (!DRY_RUN) {
    let batch = destDb.batch()
    let pending = 0
    for (const docSnap of snapshot.docs) {
      const destRef = destDb.collection(sourceColRef.path).doc(docSnap.id)
      if (SKIP_EXISTING && (await destRef.get()).exists) {
        skipped++
        continue
      }
      batch.set(destRef, remapValue(docSnap.data(), destDb))
      written++
      pending++
      if (pending >= BATCH_LIMIT) {
        await batch.commit()
        batch = destDb.batch()
        pending = 0
      }
    }
    if (pending > 0) await batch.commit()
  } else {
    written = snapshot.size
  }
  docsCopied += written
  console.log(
    `   • ${sourceColRef.path}: ${snapshot.size} docs (${written} written${skipped ? `, ${skipped} already existed` : ""})`,
  )

  // 2. (Optional) Discover subcollections concurrently — one round-trip per doc.
  if (!DEEP) return
  const subCollectionGroups = await mapWithConcurrency(
    snapshot.docs,
    SUBCOLLECTION_CONCURRENCY,
    (docSnap) => docSnap.ref.listCollections(),
  )
  for (const subCollections of subCollectionGroups) {
    for (const sub of subCollections) {
      await copyCollection(sub, destDb)
    }
  }
}

async function migrateFirestore(sourceDb, destDb) {
  console.log("\n📦 Migrating Firestore data...")
  let rootCollections = await sourceDb.listCollections()
  if (rootCollections.length === 0) {
    console.log("   (no collections found in source)")
    return
  }
  if (ONLY_COLLECTIONS) {
    rootCollections = rootCollections.filter((c) => ONLY_COLLECTIONS.has(c.id))
    console.log(`   Filter: only [${[...ONLY_COLLECTIONS].join(", ")}]`)
  }
  if (SKIP_COLLECTIONS) {
    rootCollections = rootCollections.filter((c) => !SKIP_COLLECTIONS.has(c.id))
    console.log(`   Filter: skipping [${[...SKIP_COLLECTIONS].join(", ")}]`)
  }
  for (const col of rootCollections) {
    await copyCollection(col, destDb)
  }
  console.log(`✅ Firestore done: ${docsCopied} docs across ${collectionsSeen} collections.`)
}

// ── Auth migration (with fresh passwords) ───────────────────────────────────────
function strongPassword() {
  // 18 url-safe chars — far stronger than the old shared passwords.
  return randomBytes(14).toString("base64url").slice(0, 18)
}

async function migrateAuth(sourceAuth, destAuth) {
  console.log("\n👤 Migrating Auth users (resetting every password)...")
  if (ACTIVE_SINCE_DAYS) {
    console.log(`   Filter: only users active in the last ${ACTIVE_SINCE_DAYS} day(s).`)
  }
  const credentials = []
  let skippedInactive = 0
  let nextPageToken

  do {
    const page = await sourceAuth.listUsers(1000, nextPageToken)
    for (const user of page.users) {
      const email = (user.email || "").toLowerCase()

      if (email && EXCLUDE_EMAILS.has(email)) {
        console.log(`   ⛔ Skipped (excluded): ${email}`)
        continue
      }

      if (!isRecentlyActive(user)) {
        skippedInactive++
        continue
      }

      const newPassword = strongPassword()
      const props = {
        uid: user.uid,
        email: user.email || undefined,
        emailVerified: user.emailVerified,
        displayName: user.displayName || undefined,
        phoneNumber: user.phoneNumber || undefined,
        photoURL: user.photoURL || undefined,
        disabled: user.disabled,
        password: newPassword,
      }
      // Drop undefined keys so createUser doesn't complain.
      Object.keys(props).forEach((k) => props[k] === undefined && delete props[k])

      if (DRY_RUN) {
        console.log(`   • (dry-run) would create ${email || user.uid}`)
        credentials.push({ uid: user.uid, email, password: newPassword })
        continue
      }

      try {
        await destAuth.createUser(props)
        credentials.push({ uid: user.uid, email, password: newPassword })
        console.log(`   ✅ ${email || user.uid}`)
      } catch (err) {
        if (err?.code === "auth/uid-already-exists" || err?.code === "auth/email-already-exists") {
          await destAuth.updateUser(user.uid, { password: newPassword }).catch(() => {})
          credentials.push({ uid: user.uid, email, password: newPassword })
          console.log(`   ♻️  ${email || user.uid} (already existed → password reset)`)
        } else {
          console.log(`   ❌ ${email || user.uid}: ${err?.message || err}`)
        }
      }
    }
    nextPageToken = page.pageToken
  } while (nextPageToken)

  // Write the new credentials so you can redistribute them securely.
  const outPath = join(__dirname, "new-project-credentials.txt")
  const lines = [
    "NEW PROJECT — User Credentials (passwords were regenerated during migration)",
    `Generated: ${new Date().toISOString()}`,
    "KEEP THIS FILE PRIVATE. Distribute passwords only over secure channels, then delete it.",
    "─".repeat(80),
    "",
    ...credentials.map((c) => `${c.email || "(no email)"}  |  uid=${c.uid}  |  password=${c.password}`),
  ]
  if (!DRY_RUN) writeFileSync(outPath, lines.join("\n"), "utf8")
  console.log(`\n✅ Auth done: ${credentials.length} users migrated.`)
  if (ACTIVE_SINCE_DAYS) console.log(`   (${skippedInactive} inactive users skipped)`)
  if (!DRY_RUN) console.log(`📄 New passwords written to: ${outPath}`)
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function run() {
  console.log("🚚 Firebase project migration")
  console.log("─".repeat(60))
  if (DRY_RUN) console.log("DRY RUN — nothing will be written to the destination.\n")

  const sourceSA = loadServiceAccount(
    "SOURCE_SERVICE_ACCOUNT",
    join(__dirname, "source-service-account.json"),
  )
  const destSA = loadServiceAccount(
    "DEST_SERVICE_ACCOUNT",
    join(__dirname, "dest-service-account.json"),
  )

  if (sourceSA.project_id === destSA.project_id) {
    throw new Error(
      `Source and destination are the SAME project (${sourceSA.project_id}). ` +
        `You must point dest-service-account.json at a different project.`,
    )
  }

  console.log(`Source (OLD): ${sourceSA.project_id}`)
  console.log(`Dest   (NEW): ${destSA.project_id}`)

  const sourceApp = initApp(sourceSA, "source")
  const destApp = initApp(destSA, "dest")

  if (!NO_FIRESTORE) {
    await migrateFirestore(sourceApp.firestore(), destApp.firestore())
  }
  if (!NO_AUTH) {
    await migrateAuth(sourceApp.auth(), destApp.auth())
  }

  console.log("\n🎉 Migration complete.")
  console.log("Next: deploy strict firestore.rules to the NEW project, update your env vars,")
  console.log("lock Authorized Domains, and delete/disable the OLD project.")
  process.exit(0)
}

run().catch((err) => {
  console.error("\n💥 Migration failed:", err?.message || err)
  process.exit(1)
})

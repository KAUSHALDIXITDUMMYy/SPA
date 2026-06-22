#!/usr/bin/env node
/**
 * One-time copy: legacy Firestore collections → live (sm_*_v7) collections.
 * Run after deploying app code that reads live paths.
 *
 *   node scripts/migrate-to-live-collections.mjs
 *
 * Does NOT delete legacy (decoy) collections — clone sites may still read those.
 */
import { initializeApp } from "firebase/app"
import { getFirestore, collection, getDocs, doc, setDoc, getDoc } from "firebase/firestore"
import { readFileSync, existsSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))

const firebaseConfig = {
  apiKey: "AIzaSyDnSdq0hxP0xmrZT-QuBM8Gfh2jeKj0QT0",
  authDomain: "sportsmagician-audio.firebaseapp.com",
  projectId: "sportsmagician-audio",
  storageBucket: "sportsmagician-audio.firebasestorage.app",
  messagingSenderId: "527934608433",
  appId: "1:527934608433:web:95d450cb32e2f1513fb110",
}

const PAIRS = [
  { from: "dailySchedule", to: "sm_sched_v7" },
  { from: "streamSessions", to: "sm_streams_v7", mapDoc: mapStreamDoc },
  { from: "scheduledCalls", to: "sm_calls_v7" },
  { from: "streamPermissions", to: "sm_perms_v7" },
  { from: "streamAssignments", to: "sm_assign_v7" },
]

function mapStreamDoc(data) {
  const { roomId, ...rest } = data
  return {
    ...rest,
    ...(roomId != null ? { channelKey: roomId } : {}),
  }
}

async function copyCollection(db, from, to, mapDoc = (d) => d) {
  const snap = await getDocs(collection(db, from))
  let count = 0
  for (const d of snap.docs) {
    await setDoc(doc(db, to, d.id), mapDoc(d.data()))
    count++
  }
  console.log(`  ${from} → ${to}: ${count} docs`)
}

async function main() {
  const saPath = join(__dirname, "service-account.json")
  if (!existsSync(saPath)) {
    console.error("Need scripts/service-account.json or run from machine with Firestore admin access.")
    process.exit(1)
  }

  const app = initializeApp(firebaseConfig)
  const db = getFirestore(app)

  console.log("Migrating legacy → live collections...\n")
  for (const { from, to, mapDoc } of PAIRS) {
    await copyCollection(db, from, to, mapDoc ?? ((d) => d))
  }

  const schedLive = await getDoc(doc(db, "sm_sched_v7", "current"))
  console.log(schedLive.exists() ? "\nDone. Live schedule doc exists." : "\nWarning: sm_sched_v7/current missing — set real schedule in admin.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

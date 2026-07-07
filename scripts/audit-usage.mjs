#!/usr/bin/env node
/** Read-only DB audit: collection sizes + growth hot-spots that drive Firestore billing. */
import admin from "firebase-admin";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function init() {
  const saPath = join(__dirname, "service-account.json");
  if (!existsSync(saPath)) throw new Error("Missing scripts/service-account.json");
  const sa = JSON.parse(readFileSync(saPath, "utf8"));
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
  }
  return { db: admin.firestore(), projectId: sa.project_id };
}

async function count(db, name) {
  try {
    const agg = await db.collection(name).count().get();
    return agg.data().count;
  } catch (e) {
    return `err: ${e.message}`;
  }
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function run() {
  const { db, projectId } = init();
  console.log(`\n=== FIRESTORE USAGE AUDIT — project ${projectId} ===`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  const collections = [
    "users",
    "streamSessions",
    "streamPermissions",
    "streamAssignments",
    "streamAnalytics",
    "activeViewers",
    "chatMessages",
    "scheduledCalls",
    "adminBroadcasts",
    "contactMessages",
    "reports",
    "blockEvents",
    "accessLogs",
    "dailySchedules",
    "notifications",
  ];

  console.log("--- Collection document counts ---");
  const sizes = {};
  for (const c of collections) {
    const n = await count(db, c);
    sizes[c] = n;
    console.log(`${c.padEnd(22)} : ${n}`);
  }

  // Active vs total sessions
  const activeSessions = await db.collection("streamSessions").where("isActive", "==", true).count().get().then(s => s.data().count).catch(() => "err");
  console.log(`\nstreamSessions ACTIVE  : ${activeSessions}`);

  // activeViewers still marked active (stale rows accumulate reads on every analytics poll)
  const liveViewers = await db.collection("activeViewers").where("isActive", "==", true).count().get().then(s => s.data().count).catch(() => "err");
  console.log(`activeViewers isActive : ${liveViewers}`);

  // streamAnalytics age buckets — is cleanup running?
  console.log("\n--- streamAnalytics age (billing hot-spot) ---");
  for (const d of [1, 7, 30, 90]) {
    const n = await db.collection("streamAnalytics").where("timestamp", ">=", daysAgo(d)).count().get().then(s => s.data().count).catch(e => `err ${e.message}`);
    console.log(`last ${String(d).padStart(3)} days      : ${n}`);
  }
  const older90 = await db.collection("streamAnalytics").where("timestamp", "<", daysAgo(90)).count().get().then(s => s.data().count).catch(e => `err ${e.message}`);
  console.log(`older than 90 days : ${older90}`);

  // chatMessages age
  console.log("\n--- chatMessages age ---");
  for (const d of [1, 7, 30]) {
    const n = await db.collection("chatMessages").where("createdAt", ">=", daysAgo(d)).count().get().then(s => s.data().count).catch(e => `err`);
    console.log(`last ${String(d).padStart(3)} days      : ${n}`);
  }

  console.log("\n=== DONE ===");
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

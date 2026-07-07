#!/usr/bin/env node
/**
 * Cleans the two collections driving the read bill:
 *   1) activeViewers still flagged isActive:true whose stream is NOT active  -> flip to inactive
 *   2) streamAnalytics older than N days                                     -> delete
 *
 * DRY RUN by default. Pass --apply to write changes.
 *   node scripts/cleanup-firestore-bloat.mjs            (dry run)
 *   node scripts/cleanup-firestore-bloat.mjs --apply    (make changes)
 *   node scripts/cleanup-firestore-bloat.mjs --apply --days=30
 */
import admin from "firebase-admin";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes("--apply");
const daysArg = process.argv.find((a) => a.startsWith("--days="));
const KEEP_DAYS = daysArg ? Number(daysArg.split("=")[1]) : 30;

function init() {
  const saPath = join(__dirname, "service-account.json");
  if (!existsSync(saPath)) throw new Error("Missing scripts/service-account.json");
  const sa = JSON.parse(readFileSync(saPath, "utf8"));
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
  }
  return { db: admin.firestore(), projectId: sa.project_id };
}

async function commitInChunks(db, refs, mutate) {
  let done = 0;
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch();
    refs.slice(i, i + 400).forEach((ref) => mutate(batch, ref));
    await batch.commit();
    done += Math.min(400, refs.length - i);
    process.stdout.write(`\r  committed ${done}/${refs.length}`);
  }
  if (refs.length) process.stdout.write("\n");
}

async function run() {
  const { db, projectId } = init();
  console.log(`\n=== CLEANUP (${APPLY ? "APPLY" : "DRY RUN"}) — project ${projectId} ===\n`);

  // ---- 1) Stale activeViewers ----
  const activeSessionsSnap = await db.collection("streamSessions").where("isActive", "==", true).get();
  const activeSessionIds = new Set(activeSessionsSnap.docs.map((d) => d.id));
  console.log(`Active stream sessions: ${activeSessionIds.size}`);

  const viewersSnap = await db.collection("activeViewers").where("isActive", "==", true).get();
  const staleViewers = viewersSnap.docs.filter((d) => !activeSessionIds.has(d.data().streamSessionId));
  console.log(`activeViewers isActive=true: ${viewersSnap.size}`);
  console.log(`  -> stale (session not active): ${staleViewers.length}`);
  console.log(`  -> kept (session live):        ${viewersSnap.size - staleViewers.length}`);

  if (APPLY && staleViewers.length) {
    await commitInChunks(db, staleViewers.map((d) => d.ref), (batch, ref) =>
      batch.update(ref, { isActive: false, lastSeen: new Date() }),
    );
  }

  // ---- 2) Old streamAnalytics ----
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
  const oldSnap = await db.collection("streamAnalytics").where("timestamp", "<", cutoff).get();
  console.log(`\nstreamAnalytics older than ${KEEP_DAYS} days: ${oldSnap.size}`);

  if (APPLY && oldSnap.size) {
    await commitInChunks(db, oldSnap.docs.map((d) => d.ref), (batch, ref) => batch.delete(ref));
  }

  console.log(`\n=== ${APPLY ? "DONE — changes applied" : "DRY RUN — no changes written"} ===`);
  if (!APPLY) console.log("Re-run with --apply to perform the cleanup.\n");
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

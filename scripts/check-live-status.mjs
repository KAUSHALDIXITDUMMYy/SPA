#!/usr/bin/env node
/** Read-only live status: active streams, scheduled rooms, Agora readiness signals. */
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

function toDate(v) {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmt(d) {
  return d ? d.toISOString().replace("T", " ").slice(0, 19) + " UTC" : "—";
}

async function run() {
  const { db, projectId } = init();
  const now = new Date();
  const today = dateKey(now);

  console.log(`\n=== LIVE STATUS CHECK ===`);
  console.log(`Project : ${projectId}`);
  console.log(`Now     : ${fmt(now)}`);
  console.log(`Today   : ${today}\n`);

  const activeSnap = await db.collection("streamSessions").where("isActive", "==", true).get();
  const active = activeSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const broadcasting = active.filter((s) => s.awaitingBroadcast !== true);
  const awaiting = active.filter((s) => s.awaitingBroadcast === true);

  console.log(`--- ACTIVE STREAM SESSIONS (${active.length}) ---`);
  if (broadcasting.length === 0) {
    console.log("  No caller is LIVE right now (publisher joined + transmitting).");
  }
  for (const s of broadcasting) {
    console.log(`  LIVE  ${s.title || "(no title)"}`);
    console.log(`        publisher: ${s.publisherName} (${s.publisherId})`);
    console.log(`        roomId   : ${s.roomId}`);
    console.log(`        session  : ${s.id}`);
    console.log(`        scheduled: ${s.scheduledCallId || "ad-hoc"}`);
    console.log(`        created  : ${fmt(toDate(s.createdAt))}`);
    console.log("");
  }

  if (awaiting.length > 0) {
    console.log(`--- WAITING FOR PUBLISHER (${awaiting.length}) ---`);
    for (const s of awaiting) {
      console.log(`  WAIT  ${s.title || "(no title)"} — room ${s.roomId}`);
      console.log(`        publisher: ${s.publisherName} (${s.publisherId})`);
      console.log(`        scheduledCallId: ${s.scheduledCallId || "?"}`);
      console.log("");
    }
  }

  const schedSnap = await db.collection("scheduledCalls").where("dateKey", "==", today).get();
  const calls = schedSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => toDate(a.startsAt) - toDate(b.startsAt));

  console.log(`--- TODAY'S SCHEDULED CALLS (${calls.length}) ---`);
  if (calls.length === 0) {
    console.log("  No scheduled calls for today.");
  }
  for (const c of calls) {
    const starts = toDate(c.startsAt);
    const ends = toDate(c.endsAt);
    const inWindow = starts && ends && now >= starts && now <= ends;
    const transmitting = broadcasting.some(
      (s) => s.roomId === c.roomId && s.publisherId === c.publisherId,
    );
    const placeholder = awaiting.find((s) => s.scheduledCallId === c.id);

    let status = "outside window";
    if (transmitting) status = "LIVE — publisher broadcasting";
    else if (placeholder) status = inWindow ? "IN WINDOW — waiting for publisher to go live" : "placeholder exists, outside window";
    else if (inWindow) status = "IN WINDOW — no active session row (check admin schedule)";
    else if (starts && now < starts) status = "upcoming";
    else status = "ended / not started";

    console.log(`  ${c.title}`);
    console.log(`    time     : ${fmt(starts)} → ${fmt(ends)}`);
    console.log(`    publisher: ${c.publisherName} (${c.publisherId})`);
    console.log(`    roomId   : ${c.roomId}`);
    console.log(`    status   : ${status}`);
    console.log("");
  }

  // Recent ended (last 6h) for context
  const recentSnap = await db
    .collection("streamSessions")
    .where("isActive", "==", false)
    .limit(40)
    .get();
  const recent = recentSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => {
      const ended = toDate(s.endedAt) || toDate(s.createdAt);
      return ended && now - ended < 6 * 60 * 60 * 1000;
    })
    .sort((a, b) => (toDate(b.endedAt) || 0) - (toDate(a.endedAt) || 0))
    .slice(0, 5);

  if (recent.length) {
    console.log(`--- RECENTLY ENDED (last 6h, up to 5) ---`);
    for (const s of recent) {
      console.log(`  ${s.title || s.roomId} ended ${fmt(toDate(s.endedAt))}`);
    }
    console.log("");
  }

  console.log("=== SCHEDULED ROOM FLOW (expected) ===");
  console.log("1. Admin creates schedule → placeholder session (awaitingBroadcast=true)");
  console.log("2. Publisher picks room → Go live → awaitingBroadcast=false + Agora join");
  console.log("3. Subscriber sees LIVE badge → Listen → Agora audience + audio");
  console.log("");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Reset specific 2phills subscriber passwords (local admin task).
 * Usage: node scripts/reset-2phills-passwords.mjs
 */
import admin from "firebase-admin";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TARGET_EMAILS = [
  "2phills-anthony1@sportsmagician.com",
  "2phills-anthony2@sportsmagician.com",
  "2phills-billy1@sportsmagician.com",
  "2phills-billy2@sportsmagician.com",
  "2phills-jimmy1@sportsmagician.com",
  "2phills-jimmy2@sportsmagician.com",
  "2phills-sal1@sportsmagician.com",
  "2phills-sal2@sportsmagician.com",
];

const NEW_PASSWORD = "11111111";
const OUTPUT_FILE = join(__dirname, "2phills-password-reset-result.txt");

function initAdmin() {
  const saPath = join(__dirname, "service-account.json");
  if (!existsSync(saPath)) {
    throw new Error("Missing scripts/service-account.json");
  }
  const serviceAccount = JSON.parse(readFileSync(saPath, "utf8"));
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
  }
  return { auth: admin.auth(), db: admin.firestore(), projectId: serviceAccount.project_id };
}

async function findUserDoc(db, email) {
  const normalized = email.trim().toLowerCase();
  const snap = await db.collection("users").where("email", "==", normalized).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, data: doc.data() };
}

async function resetOne(auth, db, email) {
  const normalized = email.trim().toLowerCase();
  const userDoc = await findUserDoc(db, normalized);

  if (!userDoc) {
    return { email: normalized, status: "failed", error: "No Firestore user doc found" };
  }

  const updates = {
    mustChangePassword: false,
    pendingPassword: admin.firestore.FieldValue.delete(),
  };

  if (userDoc.data.isPending) {
    // Fully activate pending users (Firestore-only row → real Firebase Auth account).
    try {
      const created = await auth.createUser({ email: normalized, password: NEW_PASSWORD })
      await db.collection("users").doc(userDoc.id).update({
        uid: created.uid,
        mustChangePassword: false,
        pendingPassword: NEW_PASSWORD,
      })
      return {
        email: normalized,
        status: "updated",
        method: "pending-activated",
        userId: userDoc.id,
        authUid: created.uid,
      }
    } catch (error) {
      if (error?.code === "auth/email-already-exists") {
        const existing = await auth.getUserByEmail(normalized)
        await auth.updateUser(existing.uid, { password: NEW_PASSWORD })
        await db.collection("users").doc(userDoc.id).update({
          uid: existing.uid,
          mustChangePassword: false,
          pendingPassword: NEW_PASSWORD,
        })
        return {
          email: normalized,
          status: "updated",
          method: "pending-auth-synced",
          userId: userDoc.id,
          authUid: existing.uid,
        }
      }
      return {
        email: normalized,
        status: "failed",
        error: error?.message || String(error),
        userId: userDoc.id,
      }
    }
  }

  try {
    const authUser = await auth.getUserByEmail(normalized);
    await auth.updateUser(authUser.uid, { password: NEW_PASSWORD });
    await db.collection("users").doc(userDoc.id).update(updates);
    return {
      email: normalized,
      status: "updated",
      method: "firebase-auth",
      userId: userDoc.id,
      authUid: authUser.uid,
    };
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      await db.collection("users").doc(userDoc.id).update({
        ...updates,
        pendingPassword: NEW_PASSWORD,
      });
      return {
        email: normalized,
        status: "updated",
        method: "firestore-no-auth-user",
        userId: userDoc.id,
      };
    }
    return {
      email: normalized,
      status: "failed",
      error: error?.message || String(error),
      userId: userDoc.id,
    };
  }
}

async function run() {
  const { auth, db, projectId } = initAdmin();
  console.log(`Project: ${projectId}`);
  console.log(`Resetting ${TARGET_EMAILS.length} accounts to password: ${NEW_PASSWORD}\n`);

  const results = [];
  for (const email of TARGET_EMAILS) {
    process.stdout.write(`${email} ... `);
    const result = await resetOne(auth, db, email);
    results.push(result);
    if (result.status === "updated") {
      console.log(`OK (${result.method})`);
    } else {
      console.log(`FAILED — ${result.error}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  const ok = results.filter((r) => r.status === "updated");
  const failed = results.filter((r) => r.status === "failed");

  const lines = [
    `2phills password reset — ${new Date().toISOString()}`,
    `Project: ${projectId}`,
    `Password: ${NEW_PASSWORD}`,
    "",
    `Updated: ${ok.length}`,
    `Failed: ${failed.length}`,
    "",
    ...ok.map((r) => `OK  ${r.email} (${r.method})`),
    ...failed.map((r) => `FAIL ${r.email} — ${r.error}`),
  ];
  writeFileSync(OUTPUT_FILE, lines.join("\n"), "utf8");

  console.log(`\nResults saved to ${OUTPUT_FILE}`);
  if (failed.length > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

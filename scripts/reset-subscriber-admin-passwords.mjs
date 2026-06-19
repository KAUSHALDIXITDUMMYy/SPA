import { initializeApp as initializeClientApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, doc, updateDoc } from "firebase/firestore";
import admin from "firebase-admin";
import { writeFileSync } from "fs";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const firebaseConfig = {
  apiKey: "AIzaSyDnSdq0hxP0xmrZT-QuBM8Gfh2jeKj0QT0",
  authDomain: "sportsmagician-audio.firebaseapp.com",
  projectId: "sportsmagician-audio",
  storageBucket: "sportsmagician-audio.firebasestorage.app",
  messagingSenderId: "527934608433",
  appId: "1:527934608433:web:95d450cb32e2f1513fb110",
  measurementId: "G-CMEYMHRY34",
};

const ROLES_TO_RESET = new Set(["subscriber", "admin"]);
const OUTPUT_FILE = join(__dirname, "subscriber-admin-credentials.txt");

function passwordFromEmail(email) {
  const normalized = (email || "").trim().toLowerCase();
  const localPart = normalized.split("@")[0] || "user";
  return `${localPart}@123455`;
}

function initAdminAuth() {
  if (admin.apps.length) {
    return admin.auth();
  }

  const candidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT,
    process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8")
      : null,
    existsSync(join(__dirname, "service-account.json"))
      ? readFileSync(join(__dirname, "service-account.json"), "utf8")
      : null,
    existsSync(join(__dirname, "..", "service-account.json"))
      ? readFileSync(join(__dirname, "..", "service-account.json"), "utf8")
      : null,
  ].filter(Boolean);

  for (const raw of candidates) {
    try {
      const serviceAccount = JSON.parse(raw);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id || firebaseConfig.projectId,
      });
      return admin.auth();
    } catch {
      // try next candidate
    }
  }

  return null;
}

async function verifyAdminAuth(auth) {
  if (!auth) return null;
  try {
    await auth.listUsers(1);
    return auth;
  } catch {
    return null;
  }
}

async function fetchTargetUsers(db) {
  const usersRef = collection(db, "users");
  const [subscriberSnap, adminSnap] = await Promise.all([
    getDocs(query(usersRef, where("role", "==", "subscriber"))),
    getDocs(query(usersRef, where("role", "==", "admin"))),
  ]);

  const byId = new Map();

  for (const snap of [subscriberSnap, adminSnap]) {
    for (const userDoc of snap.docs) {
      const data = userDoc.data();
      byId.set(userDoc.id, {
        id: userDoc.id,
        uid: data.uid || userDoc.id,
        email: (data.email || "").trim().toLowerCase(),
        displayName: data.displayName || "",
        role: data.role,
        isPending: data.isPending === true,
      });
    }
  }

  return [...byId.values()]
    .filter((user) => ROLES_TO_RESET.has(user.role) && user.email.includes("@"))
    .sort((a, b) => {
      const roleOrder = a.role === b.role ? 0 : a.role === "admin" ? -1 : 1;
      if (roleOrder !== 0) return roleOrder;
      return a.email.localeCompare(b.email);
    });
}

async function resetPasswordForUser(auth, db, user, password) {
  const userRef = doc(db, "users", user.id);

  if (user.isPending) {
    await updateDoc(userRef, { pendingPassword: password });
    return { method: "firestore-pending", status: "updated" };
  }

  if (auth) {
    try {
      const authUser = await auth.getUserByEmail(user.email);
      await auth.updateUser(authUser.uid, { password });
      return { method: "firebase-auth", status: "updated" };
    } catch (error) {
      if (error?.code === "auth/user-not-found") {
        await updateDoc(userRef, { pendingPassword: password });
        return { method: "firestore-no-auth-user", status: "updated" };
      }

      const credentialError =
        error?.message?.includes("OAuth2 access token") ||
        error?.message?.includes("default credentials");

      if (!credentialError) {
        return { method: "failed", status: "failed", error: error?.message || String(error) };
      }
    }
  }

  await updateDoc(userRef, { pendingPassword: password });
  return {
    method: auth ? "firestore-fallback" : "firestore-only",
    status: "updated",
    note: auth
      ? "Firebase Auth update failed; stored pendingPassword in Firestore"
      : "No Firebase Admin credentials; stored pendingPassword in Firestore",
  };
}

function formatOutput(results) {
  const now = new Date();
  const divider = "═".repeat(88);
  const thin = "─".repeat(88);
  const updated = results.filter((r) => r.status === "updated");
  const failed = results.filter((r) => r.status === "failed");

  const lines = [
    "Sportsmagician Audio – Subscriber & Admin Credentials",
    `Generated: ${now.toLocaleString()} (${now.toISOString()})`,
    "",
    "Password rule: [email-local-part]@123455",
    "Example: jane@sportsmagician.com → jane@123455",
    "",
    "Roles included : subscriber, admin",
    "Roles excluded : publisher",
    "",
    divider,
    "",
    `SUMMARY`,
    thin,
    `  Total users processed : ${results.length}`,
    `  Successfully updated  : ${updated.length}`,
    `  Failed                : ${failed.length}`,
    "",
    divider,
    "",
  ];

  const admins = updated.filter((r) => r.role === "admin");
  const subscribers = updated.filter((r) => r.role === "subscriber");

  if (admins.length > 0) {
    lines.push("ADMINS");
    lines.push(thin);
    admins.forEach((r, index) => {
      lines.push(`  ${index + 1}. ${r.displayName || r.email}`);
      lines.push(`     Email    : ${r.email}`);
      lines.push(`     Password : ${r.password}`);
      lines.push(`     User ID  : ${r.id}`);
      lines.push(`     Method   : ${r.method}`);
      lines.push("");
    });
  }

  if (subscribers.length > 0) {
    lines.push("SUBSCRIBERS");
    lines.push(thin);
    subscribers.forEach((r, index) => {
      lines.push(`  ${index + 1}. ${r.displayName || r.email}`);
      lines.push(`     Email    : ${r.email}`);
      lines.push(`     Password : ${r.password}`);
      lines.push(`     User ID  : ${r.id}`);
      lines.push(`     Method   : ${r.method}`);
      lines.push("");
    });
  }

  if (failed.length > 0) {
    lines.push("FAILED");
    lines.push(thin);
    failed.forEach((r, index) => {
      lines.push(`  ${index + 1}. ${r.email}`);
      lines.push(`     Error: ${r.error || "Unknown error"}`);
      lines.push("");
    });
  }

  lines.push(divider);
  lines.push("Keep this file private. Share credentials only through secure channels.");
  lines.push(divider);

  return lines.join("\n");
}

async function run() {
  console.log("🔐 Resetting subscriber & admin passwords...\n");
  console.log("─".repeat(60));

  const clientApp = initializeClientApp(firebaseConfig);
  const db = getFirestore(clientApp);
  const auth = await verifyAdminAuth(initAdminAuth());

  if (!auth) {
    console.log("⚠️  Firebase Admin SDK credentials not found.");
    console.log("   Place service-account.json in scripts/ or set FIREBASE_SERVICE_ACCOUNT.");
    console.log("   Continuing with Firestore pendingPassword updates for all users.\n");
  } else {
    console.log("✅ Firebase Admin SDK ready — Auth passwords will be updated directly.\n");
  }

  const users = await fetchTargetUsers(db);
  console.log(`Found ${users.length} users (subscriber + admin, publishers skipped)\n`);

  const results = [];

  for (const user of users) {
    const password = passwordFromEmail(user.email);
    process.stdout.write(`Updating ${user.role.padEnd(10)} ${user.email} ... `);

    try {
      const outcome = await resetPasswordForUser(auth, db, user, password);
      const row = {
        ...user,
        password,
        ...outcome,
      };
      results.push(row);

      if (outcome.status === "updated") {
        console.log(`✅ ${outcome.method}`);
      } else {
        console.log(`❌ ${outcome.error}`);
      }
    } catch (error) {
      const row = {
        ...user,
        password,
        method: "failed",
        status: "failed",
        error: error?.message || String(error),
      };
      results.push(row);
      console.log(`❌ ${row.error}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  const output = formatOutput(results);
  writeFileSync(OUTPUT_FILE, output, "utf8");

  console.log("\n" + "─".repeat(60));
  console.log(`\n📄 Credentials saved to:\n   ${OUTPUT_FILE}\n`);

  const failedCount = results.filter((r) => r.status === "failed").length;
  if (failedCount > 0) {
    process.exit(1);
  }

  process.exit(0);
}

run().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

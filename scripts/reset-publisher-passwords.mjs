/**
 * Reset Sports Magician publisher passwords (except pub* accounts).
 * New password: <local-part>@123455
 *
 * Usage: node scripts/reset-publisher-passwords.mjs
 */
import { initializeApp as initializeClientApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
} from "firebase/firestore";
import admin from "firebase-admin";
import { readFileSync, writeFileSync, existsSync } from "fs";
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

const SM_CREDENTIALS = join(__dirname, "sportsmagician-credentials.txt");
const PUBLISHERS_CREDENTIALS = join(__dirname, "sportsmagician-publishers-credentials.txt");
const PASSWORD_SUFFIX = "@123455";

function passwordFromEmail(email) {
  const normalized = (email || "").trim().toLowerCase();
  const localPart = normalized.split("@")[0] || "user";
  return `${localPart}${PASSWORD_SUFFIX}`;
}

function shouldSkipPublisher(email) {
  const localPart = (email || "").trim().toLowerCase().split("@")[0] || "";
  return localPart.startsWith("pub");
}

function initAdminAuth() {
  if (admin.apps.length) return admin.auth();

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
      return { method: "failed", status: "failed", error: error?.message || String(error) };
    }
  }

  await updateDoc(userRef, { pendingPassword: password });
  return { method: "firestore-only", status: "updated" };
}

function parseCredentialLines(path) {
  return readFileSync(path, "utf8").split(/\r?\n/);
}

function updatePasswordInLine(line, email, newPassword) {
  const normalized = line.split("|")[0].trim().toLowerCase();
  if (normalized !== email.toLowerCase()) return line;
  if (line.includes("uid=")) {
    const uidMatch = line.match(/uid=([^\s|]+)/);
    const uid = uidMatch ? uidMatch[1] : "";
    return `${email}  |  uid=${uid}  |  password=${newPassword}`;
  }
  return `${email}  |  password=${newPassword}`;
}

function writePublishersFile(publishers) {
  const lines = [
    "SPORTS MAGICIAN — Publisher logins only",
    `Generated: ${new Date().toISOString()}`,
    "Password rule: <username>@123455 (pub* accounts unchanged)",
    "KEEP THIS FILE PRIVATE. Distribute passwords only over secure channels, then delete it.",
    "─".repeat(80),
    "",
    ...publishers.map((p) => `${p.email}  |  password=${p.password}`),
    "",
    `Total publishers: ${publishers.length}`,
    `Reset this run: ${publishers.filter((p) => p.reset).length}`,
    `Skipped (pub*): ${publishers.filter((p) => p.skipped).length}`,
  ];
  writeFileSync(PUBLISHERS_CREDENTIALS, lines.join("\n"));
}

async function main() {
  console.log("Resetting SM publisher passwords (skipping pub* accounts)...\n");

  const clientApp = initializeClientApp(firebaseConfig);
  const db = getFirestore(clientApp);
  const auth = initAdminAuth();

  if (!auth) {
    console.error("No Firebase Admin credentials found.");
    process.exit(1);
  }

  const snap = await getDocs(query(collection(db, "users"), where("role", "==", "publisher")));
  const publishers = [];

  for (const userDoc of snap.docs) {
    const data = userDoc.data();
    const email = (data.email || "").trim().toLowerCase();
    if (!email.includes("@")) continue;
    if (data.tenant === "kevionics" || email.endsWith("@kevionics.com")) continue;

    const skipped = shouldSkipPublisher(email);
    const password = skipped ? null : passwordFromEmail(email);

    publishers.push({
      id: userDoc.id,
      uid: data.uid || userDoc.id,
      email,
      displayName: data.displayName || "",
      isPending: data.isPending === true,
      skipped,
      reset: false,
      password: password || "(unchanged)",
    });
  }

  publishers.sort((a, b) => a.email.localeCompare(b.email));

  const resetResults = [];
  for (const user of publishers) {
    if (user.skipped) {
      console.log(`SKIP  ${user.email}`);
      continue;
    }

    const password = passwordFromEmail(user.email);
    const outcome = await resetPasswordForUser(auth, db, user, password);
    user.password = password;
    user.reset = outcome.status === "updated";
    resetResults.push({ ...user, ...outcome });
    console.log(
      `${outcome.status === "updated" ? "OK" : "FAIL"}  ${user.email}  →  ${password}  (${outcome.method})`
    );
  }

  // Update main SM credentials file
  const smLines = parseCredentialLines(SM_CREDENTIALS);
  const passwordByEmail = new Map(
    publishers.filter((p) => p.reset).map((p) => [p.email, p.password])
  );
  const updatedSmLines = smLines.map((line) => {
    if (!line.includes("|")) return line;
    const email = line.split("|")[0].trim().toLowerCase();
    const newPassword = passwordByEmail.get(email);
    if (!newPassword) return line;
    return updatePasswordInLine(line, email, newPassword);
  });
  writeFileSync(SM_CREDENTIALS, updatedSmLines.join("\n"));

  // Rebuild publishers file with passwords from credentials for skipped pub* accounts
  const credLines = parseCredentialLines(SM_CREDENTIALS);
  const credByEmail = new Map();
  for (const line of credLines) {
    if (!line.includes("|")) continue;
    const email = line.split("|")[0].trim().toLowerCase();
    const pw = (line.match(/password=(.+)$/) || [])[1]?.trim();
    if (pw) credByEmail.set(email, pw);
  }

  for (const p of publishers) {
    if (p.skipped) {
      p.password = credByEmail.get(p.email) || p.password;
    }
  }

  writePublishersFile(publishers);

  const failed = resetResults.filter((r) => r.status !== "updated");
  console.log(`\nDone. Reset: ${resetResults.filter((r) => r.status === "updated").length}`);
  console.log(`Skipped (pub*): ${publishers.filter((p) => p.skipped).length}`);
  if (failed.length) {
    console.log(`Failed: ${failed.length}`);
    failed.forEach((f) => console.log(`  ${f.email}: ${f.error}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

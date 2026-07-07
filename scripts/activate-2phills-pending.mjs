/**
 * Diagnose and fully activate pending 2phills accounts.
 */
import admin from "firebase-admin";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const EMAILS = [
  "2phills-anthony2@sportsmagician.com",
  "2phills-jimmy1@sportsmagician.com",
];
const PASSWORD = "11111111";

function initAdmin() {
  const saPath = join(__dirname, "service-account.json");
  const serviceAccount = JSON.parse(readFileSync(saPath, "utf8"));
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
  }
  return { auth: admin.auth(), db: admin.firestore() };
}

async function diagnose(auth, db, email) {
  const lower = email.toLowerCase();
  const snap = await db.collection("users").where("email", "==", lower).get();
  let authUser = null;
  try {
    authUser = await auth.getUserByEmail(lower);
  } catch (e) {
    if (e?.code !== "auth/user-not-found") throw e;
  }
  return {
    email: lower,
    firestoreDocs: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    authUid: authUser?.uid ?? null,
    authDisabled: authUser?.disabled ?? null,
  };
}

async function activatePending(auth, db, email) {
  const lower = email.toLowerCase();
  const snap = await db
    .collection("users")
    .where("email", "==", lower)
    .where("isPending", "==", true)
    .limit(1)
    .get();

  if (snap.empty) {
    // Not pending — ensure auth password is correct
    try {
      const authUser = await auth.getUserByEmail(lower);
      await auth.updateUser(authUser.uid, { password: PASSWORD, disabled: false });
      const userSnap = await db.collection("users").where("email", "==", lower).limit(1).get();
      if (!userSnap.empty) {
        await userSnap.docs[0].ref.update({
          mustChangePassword: false,
          pendingPassword: admin.firestore.FieldValue.delete(),
          isPending: false,
        });
      }
      return { email: lower, status: "auth-password-updated", uid: authUser.uid };
    } catch (e) {
      if (e?.code === "auth/user-not-found") {
        return { email: lower, status: "failed", error: "No pending doc and no auth user" };
      }
      throw e;
    }
  }

  const pendingDoc = snap.docs[0];
  const pendingData = pendingDoc.data();
  const oldPendingId = pendingDoc.id;

  let newAuthUid;
  try {
    const created = await auth.createUser({ email: lower, password: PASSWORD });
    newAuthUid = created.uid;
  } catch (e) {
    if (e?.code === "auth/email-already-exists") {
      const existing = await auth.getUserByEmail(lower);
      newAuthUid = existing.uid;
      await auth.updateUser(newAuthUid, { password: PASSWORD, disabled: false });
    } else {
      return { email: lower, status: "failed", error: e?.message || String(e) };
    }
  }

  const repoint = async (coll, field, extra = {}) => {
    const rows = await db.collection(coll).where(field, "==", oldPendingId).get();
    await Promise.all(rows.docs.map((d) => d.ref.update({ [field]: newAuthUid, ...extra })));
  };

  await Promise.all([
    repoint("streamPermissions", "subscriberId"),
    repoint("zoomPublisherAssignments", "subscriberId"),
    repoint("streamAssignments", "subscriberId"),
    repoint("zoomCallAssignments", "subscriberId"),
    repoint("streamPermissions", "publisherId"),
    repoint("scheduledCalls", "publisherId", {
      publisherName: pendingData.displayName || lower.split("@")[0],
      updatedAt: new Date(),
    }),
    repoint("streamSessions", "publisherId", {
      publisherName: pendingData.displayName || lower.split("@")[0],
    }),
    repoint("zoomCalls", "publisherId"),
  ]);

  const userProfile = {
    uid: newAuthUid,
    email: lower,
    role: pendingData.role || "subscriber",
    tenant: pendingData.tenant ?? "default",
    displayName: pendingData.displayName || lower.split("@")[0],
    createdAt: pendingData.createdAt ?? new Date(),
    isActive: pendingData.isActive ?? true,
    allowChat: pendingData.allowChat ?? false,
    mustChangePassword: false,
    isPending: false,
    pendingPassword: admin.firestore.FieldValue.delete(),
  };

  await db.collection("users").doc(newAuthUid).set(userProfile);
  if (oldPendingId !== newAuthUid) {
    await db.collection("users").doc(oldPendingId).delete();
  }

  return {
    email: lower,
    status: "activated",
    oldPendingId,
    newAuthUid,
  };
}

async function run() {
  const { auth, db } = initAdmin();

  console.log("=== DIAGNOSE ===\n");
  for (const email of EMAILS) {
    const info = await diagnose(auth, db, email);
    console.log(JSON.stringify(info, null, 2));
    console.log("");
  }

  console.log("=== ACTIVATE ===\n");
  for (const email of EMAILS) {
    const result = await activatePending(auth, db, email);
    console.log(result);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, setDoc, doc, orderBy } from "firebase/firestore";
import { writeFileSync } from "fs";
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
  measurementId: "G-CMEYMHRY34"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const publisherNames = [
  "Quinn",
  "Kyle",
  "Justis",
  "Arthur",
  "Brian",
  "Ethan",
  "Jack",
  "Kris",
  "Bob",
  "Rodrick",
];

const password = "11111111";
const role = "publisher";
const emailDomain = "sportsmagician.com";

const toEmailBase = (name) => name.toLowerCase().replace(/\s+/g, "");

const getExistingPublishers = async () => {
  const usersRef = collection(db, "users");
  const q = query(usersRef, where("role", "==", "publisher"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
};

const createUser = async (email, password, role, displayName) => {
  const usersRef = collection(db, "users");
  const q = query(usersRef, where("email", "==", email.toLowerCase()));
  const existingUsers = await getDocs(q);

  if (!existingUsers.empty) {
    return { success: false, message: "A user with this email already exists", existingId: existingUsers.docs[0].id };
  }

  const pendingUserId = `pending_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const userProfile = {
    uid: pendingUserId,
    email: email.toLowerCase(),
    role,
    displayName: displayName,
    createdAt: new Date(),
    isActive: true,
    isPending: true,
    pendingPassword: password,
  };

  await setDoc(doc(db, "users", pendingUserId), userProfile);

  return {
    success: true,
    id: pendingUserId,
    email: email.toLowerCase(),
    displayName,
    role,
  };
};

const run = async () => {
  console.log("🚀 Checking/creating publisher accounts for Sportsmagician Audio...\n");
  console.log("─".repeat(60));

  const existingPublishers = await getExistingPublishers();
  const results = [];

  for (const name of publisherNames) {
    const emailBase = toEmailBase(name);
    const email = `${emailBase}@${emailDomain}`;

    const existingByEmail = existingPublishers.find(
      (u) => (u.email || "").toLowerCase() === email.toLowerCase()
    );
    const existingByDisplayName = existingPublishers.find(
      (u) => (u.displayName || "").trim().toLowerCase() === name.trim().toLowerCase()
    );
    const existing = existingByEmail || existingByDisplayName;

    if (existing) {
      console.log(`✅ Already exists: ${name}`);
      console.log(`   ID:       ${existing.id}`);
      console.log(`   Email:    ${existing.email || email}`);
      console.log(`   Password: ${password}`);
      console.log("");
      results.push({
        displayName: name,
        id: existing.id,
        email: existing.email || email,
        password,
        created: false,
      });
      continue;
    }

    try {
      const result = await createUser(email, password, role, name);

      if (result.success) {
        console.log(`✅ Created: ${name}`);
        console.log(`   ID:       ${result.id}`);
        console.log(`   Email:    ${result.email}`);
        console.log(`   Password: ${password}`);
        console.log("");
        results.push({
          displayName: name,
          id: result.id,
          email: result.email,
          password,
          created: true,
        });
      } else {
        console.log(`❌ Failed: ${name} - ${result.message}`);
        if (result.existingId) {
          results.push({
            displayName: name,
            id: result.existingId,
            email,
            password,
            created: false,
          });
        }
      }
    } catch (error) {
      console.log(`❌ Error: ${name} - ${error.message}\n`);
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  // Write IDs and passwords to txt file
  const outPath = join(__dirname, "publisher-ids-and-passwords.txt");
  const lines = [
    "Sportsmagician Audio – Publisher IDs and Passwords",
    "Generated: " + new Date().toISOString(),
    "",
    "Format: Display Name | ID | Email | Password",
    "─".repeat(80),
    "",
  ];

  results.forEach((r) => {
    lines.push(`Display Name: ${r.displayName}`);
    lines.push(`ID:          ${r.id}`);
    lines.push(`Email:       ${r.email}`);
    lines.push(`Password:    ${r.password}`);
    lines.push("");
  });

  lines.push("─".repeat(80));
  lines.push("All publishers use password: " + password);
  lines.push("Login email: [name]@" + emailDomain);

  writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log("─".repeat(60));
  console.log(`\n📄 Written to: ${outPath}\n`);

  process.exit(0);
};

run().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

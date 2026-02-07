import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, setDoc, doc } from "firebase/firestore";

// Use sportsmagician-audio config from the project
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

// List of subscriber names (Jack Westin -> jackwestin)
const subscribers = [
  "Cian",
  "Louis",
  "Karl",
  "Zach",
  "Greg",
  "Mgd",
  "Ok",
  "Jack Westin",
  "Nick"
];

const password = "11111111";
const role = "subscriber";

// Convert display name to email base (e.g. "Jack Westin" -> "jackwestin")
const toEmailBase = (name) => name.toLowerCase().replace(/\s+/g, "");

const createUser = async (email, password, role, displayName) => {
  try {
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("email", "==", email));
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
  } catch (error) {
    return { success: false, message: error.message };
  }
};

const createSubscribers = async () => {
  console.log("🚀 Creating subscriber accounts for Sportsmagician Audio...\n");
  console.log("─".repeat(60));

  const results = [];

  for (const name of subscribers) {
    const emailBase = toEmailBase(name);
    const email = `${emailBase}@sportsmagician.com`;

    try {
      const result = await createUser(email, password, role, name);

      if (result.success) {
        console.log(`✅ Created: ${name}`);
        console.log(`   ID:       ${result.id}`);
        console.log(`   Email:    ${result.email}`);
        console.log(`   Password: ${password}`);
        console.log(`   Role:     ${result.role}`);
        console.log(`   Name:     ${result.displayName}`);
        console.log("");
        results.push({ ...result, password });
      } else {
        console.log(`❌ Failed: ${name}`);
        console.log(`   Reason:   ${result.message}`);
        if (result.existingId) {
          console.log(`   Existing ID: ${result.existingId}`);
        }
        console.log("");
        results.push({ success: false, name, message: result.message });
      }
    } catch (error) {
      console.log(`❌ Error: ${name} - ${error.message}\n`);
      results.push({ success: false, name, message: error.message });
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("─".repeat(60));
  console.log("\n📋 Summary – IDs created:\n");

  results.forEach((r) => {
    if (r.success) {
      console.log(`  ${r.displayName.padEnd(14)} | ID: ${r.id} | ${r.email}`);
    }
  });

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  console.log("\n📊 Totals:");
  console.log(`   ✅ Created: ${successCount}`);
  console.log(`   ❌ Failed:  ${failCount}`);
  console.log(`\n   Login: [name]@sportsmagician.com`);
  console.log(`   Password: ${password}`);
  console.log(`   Role: ${role}`);

  process.exit(0);
};

createSubscribers().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

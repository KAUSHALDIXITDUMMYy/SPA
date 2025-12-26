import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, query, where, getDocs, setDoc, doc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBuF_wNnUKrV5eMMPsuzf1ffJ7vNbmwokc",
  authDomain: "zommer-dc7b6.firebaseapp.com",
  projectId: "zommer-dc7b6",
  storageBucket: "zommer-dc7b6.firebasestorage.app",
  messagingSenderId: "403698753122",
  appId: "1:403698753122:web:269b03d233b61ec2567b3b",
  measurementId: "G-WH3CN290YB",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// List of subscriber usernames
const subscribers = [
  "2phills",
  "jerry",
  "Mike",
  "Sam",
  "josh",
  "Leo",
  "Tony",
  "Nate",
  "Joey",
  "Zieg",
  "CHAD"
];

// Password for all users
const password = "11111111";

const createUser = async (email, password, role, displayName) => {
  try {
    // Check if user already exists in Firestore
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("email", "==", email));
    const existingUsers = await getDocs(q);
    
    if (!existingUsers.empty) {
      return { success: false, message: "A user with this email already exists" };
    }

    // Generate a unique ID for the pending user
    const pendingUserId = `pending_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Create user profile in Firestore with pending status
    const userProfile = {
      uid: pendingUserId, // Temporary ID until they log in
      email: email.toLowerCase(),
      role,
      displayName: displayName || email.split("@")[0],
      createdAt: new Date(),
      isActive: true,
      isPending: true, // Flag indicating they need to log in to activate
      pendingPassword: password, // Store password temporarily (will be removed on first login)
    };

    await setDoc(doc(db, "users", pendingUserId), userProfile);

    return { 
      success: true,
      message: "User created successfully. They can now log in with their credentials."
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

// Main function to create all subscribers
const createSubscribers = async () => {
  console.log("🚀 Starting to create subscriber accounts...\n");
  
  let successCount = 0;
  let errorCount = 0;

  for (const username of subscribers) {
    // Special case: Sam should use sam2 email
    const emailBase = username === "Sam" ? "sam2" : username;
    const email = `${emailBase}@sportsmagician.com`;
    
    try {
      console.log(`Creating account for ${username}...`);
      
      const result = await createUser(email, password, "subscriber", username);
      
      if (result.success) {
        console.log(`✅ Account created: ${email}`);
        console.log(`   - Password: ${password}`);
        console.log(`   - Role: subscriber`);
        console.log(`   - Display Name: ${username}\n`);
        successCount++;
      } else {
        console.log(`❌ Failed to create account for ${username}: ${result.message}\n`);
        errorCount++;
      }
    } catch (error) {
      console.log(`❌ Error creating account for ${username}: ${error.message}\n`);
      errorCount++;
    }
    
    // Small delay to avoid overwhelming the database
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log("\n📊 Summary:");
  console.log(`✅ Successfully created: ${successCount} accounts`);
  console.log(`❌ Failed to create: ${errorCount} accounts`);
  console.log(`\nAll accounts can now log in at the subscriber page with:\n`);
  console.log(`   Email: [username]@sportsmagician.com`);
  console.log(`   Password: ${password}`);
  
  process.exit(0);
};

// Run the script
createSubscribers().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});


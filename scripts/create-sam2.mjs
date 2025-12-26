import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, setDoc, doc } from "firebase/firestore";

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

const email = "sam2@sportsmagician.com";
const password = "11111111";
const displayName = "Sam";

const createUser = async () => {
  try {
    console.log(`Creating account for ${displayName}...`);
    
    // Check if user already exists
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("email", "==", email));
    const existingUsers = await getDocs(q);
    
    if (!existingUsers.empty) {
      console.log(`⚠️  A user with this email already exists`);
      process.exit(0);
    }

    // Generate a unique ID for the pending user
    const pendingUserId = `pending_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Create user profile in Firestore with pending status
    const userProfile = {
      uid: pendingUserId,
      email: email.toLowerCase(),
      role: "subscriber",
      displayName: displayName,
      createdAt: new Date(),
      isActive: true,
      isPending: true,
      pendingPassword: password,
    };

    await setDoc(doc(db, "users", pendingUserId), userProfile);

    console.log(`✅ Account created: ${email}`);
    console.log(`   - Password: ${password}`);
    console.log(`   - Role: subscriber`);
    console.log(`   - Display Name: ${displayName}`);
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
  
  process.exit(0);
};

createUser().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});









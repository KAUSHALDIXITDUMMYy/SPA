import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, deleteDoc, doc } from "firebase/firestore";

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

// List of subscriber usernames to delete
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

const deleteUsers = async () => {
  console.log("🗑️  Starting to delete subscriber accounts...\n");
  
  let deletedCount = 0;
  let notFoundCount = 0;

  for (const username of subscribers) {
    const email = `${username}@gmail.com`;
    
    try {
      // Find user by email
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", email.toLowerCase()));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        await deleteDoc(doc(db, "users", userDoc.id));
        console.log(`✅ Deleted account: ${email}`);
        deletedCount++;
      } else {
        console.log(`⚠️  Account not found: ${email}`);
        notFoundCount++;
      }
    } catch (error) {
      console.log(`❌ Error deleting account for ${email}: ${error.message}`);
    }
    
    // Small delay to avoid overwhelming the database
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  console.log("\n📊 Summary:");
  console.log(`✅ Successfully deleted: ${deletedCount} accounts`);
  console.log(`⚠️  Not found: ${notFoundCount} accounts`);
  
  process.exit(0);
};

// Run the script
deleteUsers().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});









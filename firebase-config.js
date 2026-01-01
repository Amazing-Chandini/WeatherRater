// Firebase Configuration
//
// TO ENABLE CLOUD STORAGE:
//
// 1. Go to https://firebase.google.com/
// 2. Click "Get Started" and sign in with Google
// 3. Create a new project (it's FREE!)
// 4. Enable Firestore Database (in Build menu)
// 5. Set Firestore rules to allow read/write:
//
//    rules_version = '2';
//    service cloud.firestore {
//      match /databases/{database}/documents {
//        match /{document=**} {
//          allow read, write: if true;
//        }
//      }
//    }
//
// 6. Get your config from Project Settings > General > Your apps
// 7. Uncomment and replace the config below with your actual values
// 8. Save this file and refresh the page!
//
// Your ratings will then sync across all devices!


const firebaseConfig = {
  apiKey: "AIzaSyBPGDTVLfDyc6QFpWmXJdl_dUh97BUWCB0",
  authDomain: "weatherrater-d9623.firebaseapp.com",
  projectId: "weatherrater-d9623",
  storageBucket: "weatherrater-d9623.firebasestorage.app",
  messagingSenderId: "846363240490",
  appId: "1:846363240490:web:9924824c64ab33daccfb53"
};


// OPTIONAL: For production, you can also set this in index.html before the Firebase script loads

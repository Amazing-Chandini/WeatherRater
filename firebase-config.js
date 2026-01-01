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

/*
window.customFirebaseConfig = {
    apiKey: "YOUR-API-KEY-HERE",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef123456"
};
*/

// OPTIONAL: For production, you can also set this in index.html before the Firebase script loads

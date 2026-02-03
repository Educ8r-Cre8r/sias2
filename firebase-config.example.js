// Firebase Configuration Example
// Copy this file to firebase-config.js and add your actual API keys

const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

// Initialize Firebase with error handling
let db;
try {
  if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    console.log('Firebase initialized successfully');
  } else {
    console.warn('Firebase SDK not loaded - ratings/views will not be available');
  }
} catch (error) {
  console.error('Firebase initialization error:', error.message);
  console.warn('Site will function without ratings/views');
}

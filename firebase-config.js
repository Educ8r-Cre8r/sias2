// Firebase Configuration
// Import Firebase modules from CDN (we'll use the CDN version for simplicity)

const firebaseConfig = {
  apiKey: "AIzaSyAB15zfLw4O8pUg-NY81lk8UDP24_P_4Eg",
  authDomain: "science-in-a-snapshot-cce9d.firebaseapp.com",
  projectId: "science-in-a-snapshot-cce9d",
  storageBucket: "science-in-a-snapshot-cce9d.firebasestorage.app",
  messagingSenderId: "583048081127",
  appId: "1:583048081127:web:42bfcea2e8937bced77c42",
  measurementId: "G-VGHEPPWXN2"
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

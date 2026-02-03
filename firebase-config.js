// Firebase Configuration
// Import Firebase modules from CDN (we'll use the CDN version for simplicity)

const firebaseConfig = {
  apiKey: "AIzaSyBFn1uuftmVEO3Nx7CFhjtW5RQbifJLcdQ",
  authDomain: "sias-8178a.firebaseapp.com",
  projectId: "sias-8178a",
  storageBucket: "sias-8178a.firebasestorage.app",
  messagingSenderId: "15542054986",
  appId: "1:15542054986:web:51ec1962f5934e8734f6b3",
  measurementId: "G-RSYL6TD80M"
};

// Initialize Firebase with error handling
let db;
let firebaseInitialized = false;
const firebaseReadyPromise = new Promise((resolve) => {
  window.firebaseReadyResolve = resolve;
});

// Wait for Firebase SDK to load
window.addEventListener('load', function() {
  initializeFirebase();
});

function initializeFirebase() {
  try {
    if (typeof firebase === 'undefined') {
      console.error('Firebase SDK not loaded. Check:');
      console.error('1. Internet connection');
      console.error('2. Firebase CDN scripts in index.html');
      console.error('3. Browser console for network errors');
      window.firebaseReadyResolve(false);
      return;
    }

    // Check if already initialized
    if (firebase.apps.length > 0) {
      console.log('Firebase already initialized');
      db = firebase.firestore();
      firebaseInitialized = true;
      window.firebaseReadyResolve(true);
      return;
    }

    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();

    // Test connection with a simple operation
    db.collection('_test').doc('_connection').get()
      .then(() => {
        console.log('✅ Firebase connected successfully');
        firebaseInitialized = true;
        window.firebaseReadyResolve(true);
      })
      .catch((error) => {
        console.error('❌ Firebase connection test failed:', error);
        console.error('This may be a Firestore security rules issue.');
        console.error('Visit: https://console.firebase.google.com/project/sias-8178a/firestore/rules');
        console.error('Ensure rules allow read/write access.');

        // Still mark as initialized so we can attempt operations
        firebaseInitialized = true;
        window.firebaseReadyResolve(false);
      });

  } catch (error) {
    console.error('Firebase initialization error:', error);
    console.error('Error details:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    window.firebaseReadyResolve(false);
  }
}

// Expose initialization status
window.isFirebaseReady = function() {
  return firebaseInitialized && typeof db !== 'undefined' && db !== null;
};

// Expose promise for async waiting
window.waitForFirebase = function() {
  return firebaseReadyPromise;
};

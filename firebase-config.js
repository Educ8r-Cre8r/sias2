// Firebase Configuration
// Import Firebase modules from CDN (we'll use the CDN version for simplicity)
//
// NOTE: This API key is intentionally public and safe to commit to GitHub.
// Firebase client API keys are designed to be included in public code.
// Security is enforced through Firestore security rules, not by hiding the API key.
// See: https://firebase.google.com/docs/projects/api-keys

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
let auth;
let currentUser = null;
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
    auth = firebase.auth();

    // Sign in anonymously
    auth.signInAnonymously()
      .then(() => {
        console.log('✅ Signed in anonymously');

        // Listen for auth state changes
        auth.onAuthStateChanged((user) => {
          if (user) {
            currentUser = user;
            console.log('✅ User authenticated:', user.isAnonymous ? 'Anonymous' : user.email);
            console.log('   User ID:', user.uid);

            // Mark Firebase as ready after authentication
            if (!firebaseInitialized) {
              firebaseInitialized = true;
              window.firebaseReadyResolve(true);
            }
          } else {
            console.log('❌ No user signed in');
            currentUser = null;
          }
        });
      })
      .catch((error) => {
        console.error('❌ Anonymous sign-in failed:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);

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

// Get current user ID
window.getCurrentUserId = function() {
  return currentUser ? currentUser.uid : null;
};

// Check if user is authenticated
window.isUserAuthenticated = function() {
  return currentUser !== null;
};

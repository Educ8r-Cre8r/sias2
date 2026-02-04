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

            // Update UI based on user type
            updateAuthUI(user);

            // Mark Firebase as ready after authentication
            if (!firebaseInitialized) {
              firebaseInitialized = true;
              window.firebaseReadyResolve(true);
            }
          } else {
            console.log('❌ No user signed in');
            currentUser = null;
            updateAuthUI(null);
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

/**
 * Update Auth UI based on user state
 */
function updateAuthUI(user) {
  const authAnonymous = document.getElementById('auth-anonymous');
  const authSignedIn = document.getElementById('auth-signed-in');
  const userPhoto = document.getElementById('user-photo');
  const userName = document.getElementById('user-name');

  if (!authAnonymous || !authSignedIn) return;

  if (!user) {
    // No user - hide everything
    authAnonymous.style.display = 'none';
    authSignedIn.style.display = 'none';
  } else if (user.isAnonymous) {
    // Anonymous user - show sign in button
    authAnonymous.style.display = 'block';
    authSignedIn.style.display = 'none';
  } else {
    // Signed in with Google - show profile
    authAnonymous.style.display = 'none';
    authSignedIn.style.display = 'block';

    // Update profile info
    if (userPhoto && user.photoURL) {
      userPhoto.src = user.photoURL;
      userPhoto.alt = user.displayName || 'User profile photo';
    }
    if (userName) {
      userName.textContent = user.displayName || user.email || 'User';
    }
  }
}

/**
 * Sign in with Google
 */
async function signInWithGoogle() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();

    // Check if user is currently anonymous
    const wasAnonymous = currentUser && currentUser.isAnonymous;

    if (wasAnonymous) {
      // Link anonymous account to Google account
      console.log('Linking anonymous account to Google...');

      const result = await currentUser.linkWithPopup(provider);
      console.log('✅ Anonymous account linked to Google:', result.user.email);
      alert(`Welcome! Your anonymous ratings have been saved to your Google account (${result.user.email}).`);

    } else {
      // Regular sign in
      console.log('Signing in with Google...');

      const result = await firebase.auth().signInWithPopup(provider);
      console.log('✅ Signed in with Google:', result.user.email);
      alert(`Welcome back, ${result.user.displayName}!`);
    }

  } catch (error) {
    console.error('❌ Google sign-in error:', error);

    if (error.code === 'auth/popup-closed-by-user') {
      // User closed the popup - no action needed
      console.log('User closed sign-in popup');
    } else if (error.code === 'auth/credential-already-in-use') {
      // This Google account is already linked to a different anonymous account
      alert('This Google account is already in use. Signing you in...');

      // Sign in with the credential
      const credential = error.credential;
      await firebase.auth().signInWithCredential(credential);
    } else {
      alert('Sign-in failed: ' + error.message);
    }
  }
}

/**
 * Sign out
 */
async function signOut() {
  try {
    // Confirm sign out
    const confirmed = confirm('Are you sure you want to sign out? You will be signed in anonymously after sign out.');

    if (!confirmed) return;

    await firebase.auth().signOut();
    console.log('✅ Signed out');

    // Sign back in anonymously
    await firebase.auth().signInAnonymously();
    console.log('✅ Signed in anonymously');

  } catch (error) {
    console.error('❌ Sign out error:', error);
    alert('Sign out failed: ' + error.message);
  }
}

// Expose functions globally
window.signInWithGoogle = signInWithGoogle;
window.signOut = signOut;

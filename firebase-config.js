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

    // Set up auth state listener FIRST (before any sign-in attempts)
    // This will detect if user is already signed in from previous session
    auth.onAuthStateChanged((user) => {
      if (user) {
        currentUser = user;
        console.log('✅ User authenticated:', user.isAnonymous ? 'Anonymous' : user.email);
        console.log('   User ID:', user.uid);
        console.log('   Session persisted:', !user.isAnonymous ? 'Google account' : 'Anonymous');

        // Update UI based on user type
        updateAuthUI(user);

        // Mark Firebase as ready after authentication
        if (!firebaseInitialized) {
          firebaseInitialized = true;
          window.firebaseReadyResolve(true);
        }
      } else {
        // No user signed in - sign in anonymously
        console.log('⚠️ No user session found, signing in anonymously...');
        currentUser = null;
        updateAuthUI(null);

        auth.signInAnonymously()
          .then(() => {
            console.log('✅ Signed in anonymously (new session)');
          })
          .catch((error) => {
            console.error('❌ Anonymous sign-in failed:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);

            // Still mark as initialized so we can attempt operations
            if (!firebaseInitialized) {
              firebaseInitialized = true;
              window.firebaseReadyResolve(false);
            }
          });
      }
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
  // Use requestAnimationFrame to ensure DOM is ready
  requestAnimationFrame(() => {
    const authAnonymous = document.getElementById('auth-anonymous');
    const authSignedIn = document.getElementById('auth-signed-in');

    if (!authAnonymous || !authSignedIn) {
      console.warn('Auth UI elements not found, will retry...');
      // Retry after a short delay if elements aren't ready
      setTimeout(() => updateAuthUI(user), 100);
      return;
    }

    // Show/hide My Collection button based on auth status
    const collectionBtn = document.getElementById('my-collection-btn');

    if (!user) {
      // No user - hide everything
      authAnonymous.style.display = 'none';
      authSignedIn.style.display = 'none';
      if (collectionBtn) collectionBtn.style.display = 'none';
    } else if (user.isAnonymous) {
      // Anonymous user - show sign in button
      authAnonymous.style.display = 'block';
      authSignedIn.style.display = 'none';
      if (collectionBtn) collectionBtn.style.display = 'none';
      console.log('📱 UI: Showing sign-in button (anonymous user)');
    } else {
      // Signed in with Google - show avatar
      authAnonymous.style.display = 'none';
      authSignedIn.style.display = 'block';

      // Get user info from provider data (more reliable for linked accounts)
      const googleProvider = user.providerData && user.providerData.find(p => p.providerId === 'google.com');
      const displayName = googleProvider?.displayName || user.displayName || user.email || 'User';
      const photoURL = googleProvider?.photoURL || user.photoURL || null;
      const initials = getInitials(displayName);

      // Update avatar initials (both small and large)
      const userInitials = document.getElementById('user-initials');
      const userInitialsLarge = document.getElementById('user-initials-large');
      if (userInitials) userInitials.textContent = initials;
      if (userInitialsLarge) userInitialsLarge.textContent = initials;

      // Update menu info
      const userNameMenu = document.getElementById('user-name-menu');
      const userEmailMenu = document.getElementById('user-email-menu');
      if (userNameMenu) userNameMenu.textContent = displayName;
      if (userEmailMenu) userEmailMenu.textContent = googleProvider?.email || user.email || '';

      // If user has a photo URL, add it as background (but keep initials as fallback)
      if (photoURL) {
        const userAvatar = document.getElementById('user-avatar');
        const userAvatarLarge = document.getElementById('user-avatar-large');

        if (userAvatar && !userAvatar.querySelector('img')) {
          const img = document.createElement('img');
          img.src = photoURL;
          img.className = 'user-avatar-bg';
          img.alt = displayName;
          // Hide initials when photo loads
          img.onload = () => {
            if (userInitials) userInitials.style.display = 'none';
          };
          // Show initials if photo fails to load
          img.onerror = () => {
            img.remove();
            if (userInitials) userInitials.style.display = 'block';
          };
          userAvatar.appendChild(img);
        }

        if (userAvatarLarge && !userAvatarLarge.querySelector('img')) {
          const img = document.createElement('img');
          img.src = photoURL;
          img.className = 'user-avatar-large-bg';
          img.alt = displayName;
          img.onload = () => {
            if (userInitialsLarge) userInitialsLarge.style.display = 'none';
          };
          img.onerror = () => {
            img.remove();
            if (userInitialsLarge) userInitialsLarge.style.display = 'block';
          };
          userAvatarLarge.appendChild(img);
        }
      }

      console.log('📱 UI: Showing user avatar:', displayName, initials);

      // Show My Collection button with personalized label and load favorites
      if (collectionBtn) {
        collectionBtn.style.display = 'inline-flex';
        const firstName = displayName.split(/\s+/)[0];
        const collectionLabel = collectionBtn.querySelector('.collection-label');
        if (collectionLabel) {
          collectionLabel.textContent = `${firstName}'s Collection`;
        }
      }
      if (typeof loadUserFavorites === 'function') {
        loadUserFavorites();
      } else {
        // favorites.js may not be loaded yet — retry after a short delay
        setTimeout(() => {
          if (typeof loadUserFavorites === 'function') {
            loadUserFavorites();
          }
        }, 500);
      }
    }
  });
}

/**
 * Get initials from display name
 */
function getInitials(name) {
  if (!name) return '?';

  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    // Single name: take first 2 characters
    return parts[0].substring(0, 2).toUpperCase();
  } else {
    // Multiple names: take first letter of first two words
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
}

/**
 * Toggle user menu dropdown
 */
function toggleUserMenu() {
  const userMenu = document.getElementById('user-menu');
  if (!userMenu) return;

  if (userMenu.style.display === 'none' || !userMenu.style.display) {
    userMenu.style.display = 'block';
    // Close menu when clicking outside
    setTimeout(() => {
      document.addEventListener('click', closeUserMenuOnClickOutside);
    }, 0);
  } else {
    userMenu.style.display = 'none';
    document.removeEventListener('click', closeUserMenuOnClickOutside);
  }
}

/**
 * Close user menu when clicking outside
 */
function closeUserMenuOnClickOutside(event) {
  const userMenu = document.getElementById('user-menu');
  const userAvatarBtn = document.getElementById('user-avatar-btn');

  if (userMenu && userAvatarBtn &&
      !userMenu.contains(event.target) &&
      !userAvatarBtn.contains(event.target)) {
    userMenu.style.display = 'none';
    document.removeEventListener('click', closeUserMenuOnClickOutside);
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
window.toggleUserMenu = toggleUserMenu;

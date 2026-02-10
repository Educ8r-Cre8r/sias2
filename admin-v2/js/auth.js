/**
 * SIAS Admin Dashboard — Authentication
 * Restricts access to authorized admin email only.
 */

const ADMIN_EMAIL = 'mr.alexdjones@gmail.com';

const firebaseConfig = {
    apiKey: "AIzaSyBFn1uuftmVEO3Nx7CFhjtW5RQbifJLcdQ",
    authDomain: "sias-8178a.firebaseapp.com",
    projectId: "sias-8178a",
    storageBucket: "sias-8178a.firebasestorage.app",
    messagingSenderId: "15542054986",
    appId: "1:15542054986:web:51ec1962f5934e8734f6b3"
};

let db, auth, functions, storage, adminUser = null;

function initFirebase() {
    if (firebase.apps.length > 0) {
        db = firebase.firestore();
        auth = firebase.auth();
        functions = firebase.functions();
        storage = firebase.storage();
        return;
    }

    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();
    functions = firebase.functions();
    storage = firebase.storage();

    auth.onAuthStateChanged(handleAuthState);
}

function handleAuthState(user) {
    const authScreen = document.getElementById('auth-screen');
    const dashboard = document.getElementById('dashboard');
    const authError = document.getElementById('auth-error');
    const authLoading = document.getElementById('auth-loading');

    if (authLoading) authLoading.classList.add('hidden');

    if (user && user.email === ADMIN_EMAIL) {
        // Authorized admin
        adminUser = user;
        authScreen.classList.add('hidden');
        dashboard.classList.remove('hidden');

        const avatar = document.getElementById('user-avatar');
        const userInitials = document.getElementById('user-initials');
        if (avatar) {
            avatar.title = user.email;
            const googleProvider = user.providerData && user.providerData.find(p => p.providerId === 'google.com');
            const photoURL = googleProvider?.photoURL || user.photoURL || null;
            const initial = (googleProvider?.displayName || user.displayName || user.email || 'A').charAt(0).toUpperCase();
            if (userInitials) userInitials.textContent = initial;

            if (photoURL) {
                // Remove existing image if any
                const existingImg = avatar.querySelector('img');
                if (existingImg) existingImg.remove();

                const img = document.createElement('img');
                img.src = photoURL;
                img.className = 'user-avatar-img';
                img.alt = 'Admin';
                img.onload = function() {
                    if (userInitials) userInitials.style.display = 'none';
                };
                img.onerror = function() {
                    img.remove();
                    if (userInitials) userInitials.style.display = '';
                };
                avatar.appendChild(img);
            }
        }

        // Initialize dashboard
        if (typeof initDashboard === 'function') {
            initDashboard();
        }
    } else if (user && user.email !== ADMIN_EMAIL) {
        // Signed in but not authorized
        adminUser = null;
        authScreen.classList.remove('hidden');
        dashboard.classList.add('hidden');

        if (authError) {
            authError.textContent = `Access denied. ${user.email} is not an authorized admin.`;
            authError.classList.remove('hidden');
        }

        // Sign them out
        auth.signOut();
    } else {
        // Not signed in
        adminUser = null;
        authScreen.classList.remove('hidden');
        dashboard.classList.add('hidden');
        if (authError) authError.classList.add('hidden');
    }
}

async function adminSignIn() {
    const authError = document.getElementById('auth-error');
    const authLoading = document.getElementById('auth-loading');
    const signInBtn = document.getElementById('google-sign-in-btn');

    if (authError) authError.classList.add('hidden');
    if (authLoading) authLoading.classList.remove('hidden');
    if (signInBtn) signInBtn.disabled = true;

    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await auth.signInWithPopup(provider);
    } catch (error) {
        if (authLoading) authLoading.classList.add('hidden');
        if (signInBtn) signInBtn.disabled = false;

        if (error.code !== 'auth/popup-closed-by-user') {
            if (authError) {
                authError.textContent = 'Sign-in failed: ' + error.message;
                authError.classList.remove('hidden');
            }
        }
    }
}

async function adminSignOut() {
    try {
        await auth.signOut();
    } catch (error) {
        showToast('Sign out failed: ' + error.message, 'error');
    }
}

/**
 * Get the current user's ID token for Cloud Function calls
 */
async function getAdminIdToken() {
    if (!adminUser) throw new Error('Not authenticated');
    return adminUser.getIdToken();
}

// Initialize Firebase on load
window.addEventListener('load', initFirebase);

// Expose globally
window.adminSignIn = adminSignIn;
window.adminSignOut = adminSignOut;
window.getAdminIdToken = getAdminIdToken;

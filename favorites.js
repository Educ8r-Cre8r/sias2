/**
 * Favorites / My Collection System
 * Allows signed-in (Google) users to favorite photos and view their collection
 */

// In-memory set of favorited photo IDs for the current user
let userFavorites = new Set();
let favoritesLoaded = false;

/**
 * Load all favorites for the current user from Firestore
 * Called once on auth state change (Google sign-in)
 */
async function loadUserFavorites() {
  const userId = window.getCurrentUserId ? window.getCurrentUserId() : null;
  if (!userId || !isGoogleUser()) {
    userFavorites = new Set();
    favoritesLoaded = false;
    updateMyCollectionBadge();
    return;
  }

  if (typeof window.waitForFirebase === 'function') {
    await window.waitForFirebase();
  }

  if (typeof db === 'undefined' || !db) {
    console.warn('[Favorites] Firebase not available');
    return;
  }

  try {
    const snapshot = await db.collection('favorites')
      .where('userId', '==', userId)
      .get();

    userFavorites = new Set();
    snapshot.forEach(doc => {
      const data = doc.data();
      userFavorites.add(Number(data.photoId));
    });

    favoritesLoaded = true;
    console.log(`[Favorites] Loaded ${userFavorites.size} favorites for user`);
    updateMyCollectionBadge();
  } catch (error) {
    console.error('[Favorites] Error loading favorites:', error);
  }
}

/**
 * Check if a photo is favorited by the current user
 */
function isPhotoFavorited(photoId) {
  return userFavorites.has(Number(photoId));
}

/**
 * Toggle favorite status for a photo
 */
async function toggleFavorite(photoId) {
  // Require Google sign-in
  if (!isGoogleUser()) {
    promptSignInForFavorites();
    return;
  }

  const userId = window.getCurrentUserId();
  if (!userId) return;

  if (typeof db === 'undefined' || !db) {
    console.warn('[Favorites] Firebase not available');
    return;
  }

  const numericId = Number(photoId);
  const docId = `${userId}-${numericId}`;

  try {
    if (userFavorites.has(numericId)) {
      // Remove favorite (optimistic)
      userFavorites.delete(numericId);
      updateFavoriteUI(photoId, false);
      updateMyCollectionBadge();

      await db.collection('favorites').doc(docId).delete();
      console.log(`[Favorites] Removed photo ${photoId} from favorites`);
    } else {
      // Add favorite (optimistic)
      userFavorites.add(numericId);
      updateFavoriteUI(photoId, true);
      updateMyCollectionBadge();

      await db.collection('favorites').doc(docId).set({
        userId: userId,
        photoId: String(numericId),
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
      console.log(`[Favorites] Added photo ${photoId} to favorites`);
    }

    // If My Collection filter is active, re-render gallery
    if (state.collectionFilter) {
      renderGallery();
    }
  } catch (error) {
    console.error('[Favorites] Error toggling favorite:', error);
    // Rollback optimistic update
    if (userFavorites.has(numericId)) {
      userFavorites.delete(numericId);
    } else {
      userFavorites.add(numericId);
    }
    updateFavoriteUI(photoId, userFavorites.has(numericId));
    updateMyCollectionBadge();
  }
}

/**
 * Check if current user is signed in with Google (non-anonymous)
 */
function isGoogleUser() {
  if (!currentUser) return false;
  return !currentUser.isAnonymous;
}

/**
 * Prompt anonymous users to sign in for favorites
 */
function promptSignInForFavorites() {
  const shouldSignIn = confirm(
    'Sign in with Google to save photos to your collection.\n\nWould you like to sign in now?'
  );
  if (shouldSignIn && typeof signInWithGoogle === 'function') {
    signInWithGoogle();
  }
}

/**
 * Update the favorite button UI in the modal
 */
function updateFavoriteUI(photoId, isFavorited) {
  const btn = document.getElementById('modal-favorite-btn');
  if (!btn) return;

  if (isFavorited) {
    btn.classList.add('favorited');
    btn.setAttribute('aria-label', 'Remove from My Collection');
    btn.title = 'Remove from My Collection';
  } else {
    btn.classList.remove('favorited');
    btn.setAttribute('aria-label', 'Add to My Collection');
    btn.title = 'Add to My Collection';
  }
}

/**
 * Update the My Collection button badge count
 */
function updateMyCollectionBadge() {
  const badge = document.getElementById('collection-badge');
  if (badge) {
    badge.textContent = userFavorites.size;
    badge.style.display = userFavorites.size > 0 ? 'inline-flex' : 'none';
  }
}

/**
 * Toggle My Collection filter on/off
 */
function toggleCollectionFilter() {
  if (!isGoogleUser()) {
    promptSignInForFavorites();
    return;
  }

  const btn = document.getElementById('my-collection-btn');
  if (!btn) return;

  if (state.collectionFilter) {
    // Deactivate collection filter
    state.collectionFilter = false;
    btn.classList.remove('active');
    btn.setAttribute('aria-pressed', 'false');
  } else {
    // Activate collection filter
    state.collectionFilter = true;
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');

    // Clear other filters when showing collection
    state.currentCategory = 'all';
    state.searchQuery = '';
    state.ngssFilter = null;

    // Reset category button states (exclude collection button)
    document.querySelectorAll('.filter-btn:not(.collection-filter-btn)').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    const allBtn = document.querySelector('.filter-btn[data-category="all"]');
    if (allBtn) {
      allBtn.classList.add('active');
      allBtn.setAttribute('aria-pressed', 'true');
    }

    // Clear search input
    const searchInput = document.getElementById('gallery-search');
    if (searchInput) searchInput.value = '';

    // Clear NGSS filter UI
    const activeFilter = document.getElementById('ngss-active-filter');
    if (activeFilter) activeFilter.style.display = 'none';
    const ngssInput = document.getElementById('ngss-search');
    if (ngssInput) ngssInput.value = '';
    const clearBtn = document.getElementById('ngss-clear-btn');
    if (clearBtn) clearBtn.style.display = 'none';
  }

  state.visibleCount = IMAGES_PER_PAGE;
  updateURL();
  renderGallery();
}

/**
 * Clear the collection filter (called when other filters are activated)
 */
function clearCollectionFilter() {
  state.collectionFilter = false;
  const btn = document.getElementById('my-collection-btn');
  if (btn) {
    btn.classList.remove('active');
    btn.setAttribute('aria-pressed', 'false');
  }
}

// Expose functions globally
window.toggleFavorite = toggleFavorite;
window.isPhotoFavorited = isPhotoFavorited;
window.loadUserFavorites = loadUserFavorites;
window.toggleCollectionFilter = toggleCollectionFilter;
window.clearCollectionFilter = clearCollectionFilter;
window.updateMyCollectionBadge = updateMyCollectionBadge;
window.updateFavoriteUI = updateFavoriteUI;
window.isGoogleUser = isGoogleUser;

console.log('[Favorites] Favorites system initialized');

/**
 * Ratings and Views System
 * Handles star ratings and view counting for photos
 * Now uses Firebase Authentication to track user ratings properly
 */

// Cache of user ratings loaded from Firestore
let userRatingsCache = {};

/**
 * Record a view for a photo
 */
async function recordPhotoView(photoId) {
  // Wait for Firebase to initialize
  if (typeof window.waitForFirebase === 'function') {
    await window.waitForFirebase();
  }

  // Check if Firebase is available
  if (typeof db === 'undefined' || !db) {
    console.warn('Firebase not available - views will not be recorded');
    return;
  }

  try {
    // Ensure photoId is a string
    const id = String(photoId);
    const viewRef = db.collection('views').doc(id);

    // Get current view count
    const doc = await viewRef.get();

    if (doc.exists) {
      // Increment existing count
      await viewRef.update({
        count: firebase.firestore.FieldValue.increment(1),
        lastViewed: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else {
      // Create new view record
      await viewRef.set({
        photoId: photoId,
        count: 1,
        firstViewed: firebase.firestore.FieldValue.serverTimestamp(),
        lastViewed: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    console.log(`View recorded for photo: ${photoId}`);
  } catch (error) {
    console.error('Error recording view:', error);
  }
}

/**
 * Check if current user has already rated a photo
 */
async function hasUserRated(photoId) {
  const userId = window.getCurrentUserId ? window.getCurrentUserId() : null;
  if (!userId) return false;

  // Check cache first
  const cacheKey = `${userId}-${photoId}`;
  if (userRatingsCache[cacheKey] !== undefined) {
    return userRatingsCache[cacheKey];
  }

  // Check Firestore
  try {
    const userRatingDoc = await db.collection('userRatings').doc(cacheKey).get();
    const hasRated = userRatingDoc.exists;
    userRatingsCache[cacheKey] = hasRated ? userRatingDoc.data().stars : false;
    return hasRated;
  } catch (error) {
    console.error('Error checking user rating:', error);
    return false;
  }
}

/**
 * Get user's rating for a specific photo
 */
async function getUserRating(photoId) {
  const userId = window.getCurrentUserId ? window.getCurrentUserId() : null;
  if (!userId) return null;

  const cacheKey = `${userId}-${photoId}`;

  // Return from cache if available
  if (userRatingsCache[cacheKey]) {
    return userRatingsCache[cacheKey];
  }

  // Fetch from Firestore
  try {
    const userRatingDoc = await db.collection('userRatings').doc(cacheKey).get();
    if (userRatingDoc.exists) {
      const stars = userRatingDoc.data().stars;
      userRatingsCache[cacheKey] = stars;
      return stars;
    }
  } catch (error) {
    console.error('Error getting user rating:', error);
  }

  return null;
}

/**
 * Submit a rating for a photo
 */
async function submitRating(photoId, stars) {
  if (stars < 1 || stars > 5) {
    console.error('Invalid rating: must be 1-5 stars');
    return;
  }

  // Wait for Firebase to initialize
  if (typeof window.waitForFirebase === 'function') {
    await window.waitForFirebase();
  }

  // Check if Firebase is available
  if (typeof db === 'undefined' || !db) {
    const errorMsg = 'Ratings system is currently unavailable.\n\nPossible causes:\n' +
      '1. Firestore security rules may be too restrictive\n' +
      '2. Network connectivity issue\n' +
      '3. Firebase not properly initialized\n\n' +
      'Please check the browser console (F12) for detailed error information.';
    alert(errorMsg);

    console.error('=== FIREBASE NOT AVAILABLE ===');
    console.error('db is undefined. Check firebase-config.js initialization.');
    console.error('Open browser DevTools > Console for detailed diagnostics.');
    return;
  }

  // Get current user ID
  const userId = window.getCurrentUserId ? window.getCurrentUserId() : null;
  if (!userId) {
    alert('You must be signed in to rate photos. Please refresh the page and try again.');
    console.error('No user ID available. User not authenticated.');
    return;
  }

  try {
    const id = String(photoId);

    // Check if user has already rated this photo
    const userRatingId = `${userId}-${id}`;
    const existingRatingDoc = await db.collection('userRatings').doc(userRatingId).get();

    if (existingRatingDoc.exists) {
      alert('You have already rated this photo!');
      console.log('User has already rated photo:', id);
      return;
    }

    // Record the user's individual rating in userRatings collection
    await db.collection('userRatings').doc(userRatingId).set({
      userId: userId,
      photoId: id,
      stars: stars,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Update the aggregate ratings for the photo
    const ratingRef = db.collection('ratings').doc(id);
    const doc = await ratingRef.get();

    if (doc.exists) {
      const data = doc.data();
      const totalRatings = data.totalRatings || 0;
      const totalStars = data.totalStars || 0;

      // Update with new rating
      await ratingRef.update({
        totalRatings: totalRatings + 1,
        totalStars: totalStars + stars,
        averageRating: (totalStars + stars) / (totalRatings + 1),
        lastRated: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else {
      // Create new rating record
      await ratingRef.set({
        photoId: id,
        totalRatings: 1,
        totalStars: stars,
        averageRating: stars,
        firstRated: firebase.firestore.FieldValue.serverTimestamp(),
        lastRated: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    // Update cache
    userRatingsCache[userRatingId] = stars;

    console.log(`✅ Rating submitted for photo ${id}: ${stars} stars`);

    // Update UI
    await updateRatingDisplay(photoId);

  } catch (error) {
    console.error('❌ Error submitting rating:', error);

    // Provide specific error feedback
    if (error.code === 'permission-denied') {
      alert('You have already rated this photo!');
    } else {
      alert('Failed to submit rating: ' + error.message);
    }
  }
}

/**
 * Get ratings for a photo
 */
async function getRatings(photoId) {
  // Wait for Firebase to initialize
  if (typeof window.waitForFirebase === 'function') {
    await window.waitForFirebase();
  }

  // Check if Firebase is available
  if (typeof db === 'undefined' || !db) {
    const id = String(photoId);
    return {
      photoId: id,
      totalRatings: 0,
      totalStars: 0,
      averageRating: 0
    };
  }

  try {
    const id = String(photoId);
    const doc = await db.collection('ratings').doc(id).get();

    if (doc.exists) {
      return doc.data();
    } else {
      return {
        photoId: id,
        totalRatings: 0,
        totalStars: 0,
        averageRating: 0
      };
    }
  } catch (error) {
    console.error('Error getting ratings:', error);
    return null;
  }
}

/**
 * Get view count for a photo
 */
async function getViews(photoId) {
  // Wait for Firebase to initialize
  if (typeof window.waitForFirebase === 'function') {
    await window.waitForFirebase();
  }

  // Check if Firebase is available
  if (typeof db === 'undefined' || !db) {
    return 0;
  }

  try {
    const id = String(photoId);
    const doc = await db.collection('views').doc(id).get();

    if (doc.exists) {
      return doc.data().count || 0;
    } else {
      return 0;
    }
  } catch (error) {
    console.error('Error getting views:', error);
    return 0;
  }
}

/**
 * Update the rating display in the UI
 */
async function updateRatingDisplay(photoId) {
  const ratings = await getRatings(photoId);
  const views = await getViews(photoId);

  // Update in modal if it's open
  const modalTitle = document.getElementById('modal-title');
  if (modalTitle && modalTitle.textContent) {
    const currentPhoto = state.galleryData.images.find(img => img.title === modalTitle.textContent);
    if (currentPhoto && currentPhoto.id === photoId) {
      updateModalStats(ratings, views);
    }
  }

  // Update in gallery card
  updateGalleryCardStats(photoId, ratings, views);
}

/**
 * Update stats in the modal
 */
function updateModalStats(ratings, views) {
  const statsContainer = document.querySelector('.modal-stats');
  if (!statsContainer) return;

  const avgRating = ratings.averageRating || 0;
  const totalRatings = ratings.totalRatings || 0;

  // Update stars display
  const starsDisplay = statsContainer.querySelector('.stars-display');
  if (starsDisplay) {
    starsDisplay.innerHTML = generateStarsHTML(avgRating, totalRatings);
  }

  // Update views
  const viewsDisplay = statsContainer.querySelector('.views-count');
  if (viewsDisplay) {
    viewsDisplay.textContent = formatViews(views);
  }
}

/**
 * Update stats in gallery card
 */
function updateGalleryCardStats(photoId, ratings, views) {
  const card = document.querySelector(`[data-photo-id="${photoId}"]`);
  if (!card) return;

  const statsContainer = card.querySelector('.card-stats');
  if (!statsContainer) return;

  const avgRating = ratings.averageRating || 0;

  // Update rating badge value
  const ratingValue = statsContainer.querySelector('.rating-value');
  if (ratingValue) {
    ratingValue.textContent = avgRating.toFixed(1);
  }

  // Update views badge value
  const viewsDisplay = statsContainer.querySelector('.views-count');
  if (viewsDisplay) {
    viewsDisplay.textContent = formatViewsShort(views);
  }
}

/**
 * Generate HTML for star rating display
 */
function generateStarsHTML(averageRating, totalRatings) {
  const fullStars = Math.floor(averageRating);
  const hasHalfStar = averageRating % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  let html = '<div class="stars">';

  // Full stars
  for (let i = 0; i < fullStars; i++) {
    html += '<span class="star full">★</span>';
  }

  // Half star
  if (hasHalfStar) {
    html += '<span class="star half">★</span>';
  }

  // Empty stars
  for (let i = 0; i < emptyStars; i++) {
    html += '<span class="star empty">☆</span>';
  }

  html += '</div>';
  html += `<span class="rating-text">${averageRating.toFixed(1)} (${totalRatings})</span>`;

  return html;
}

/**
 * Generate HTML for interactive star rating (for user to click)
 */
async function generateInteractiveStarsHTML(photoId) {
  const id = String(photoId);

  // Check if user has already rated this photo
  const userRating = await getUserRating(id);

  if (userRating) {
    return `<div class="rating-submitted">You rated this ${userRating} stars</div>`;
  }

  let html = '<div class="interactive-stars" data-photo-id="' + id + '">';
  html += '<p>Rate this photo:</p>';

  for (let i = 1; i <= 5; i++) {
    html += `<span class="star-btn" data-stars="${i}" onclick="submitRating(${id}, ${i})">☆</span>`;
  }

  html += '</div>';

  return html;
}

/**
 * Format view count for display (full label)
 */
function formatViews(count) {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M Views';
  } else if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'K Views';
  } else {
    return count + (count === 1 ? ' View' : ' Views');
  }
}

/**
 * Format view count for badge display (compact)
 */
function formatViewsShort(count) {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M';
  } else if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'k';
  } else {
    return String(count);
  }
}

/**
 * Load all ratings and views for gallery
 */
async function loadAllStats() {
  if (!state.galleryData || !state.galleryData.images) return;

  for (const image of state.galleryData.images) {
    const ratings = await getRatings(image.id);
    const views = await getViews(image.id);
    updateGalleryCardStats(image.id, ratings, views);
  }
}

// Make functions available globally
window.recordPhotoView = recordPhotoView;
window.submitRating = submitRating;
window.getRatings = getRatings;
window.getViews = getViews;
window.updateRatingDisplay = updateRatingDisplay;
window.generateInteractiveStarsHTML = generateInteractiveStarsHTML;
window.loadAllStats = loadAllStats;

console.log('Ratings system initialized');

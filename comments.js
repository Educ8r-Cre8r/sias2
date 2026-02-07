/**
 * Comments System
 * Handles comment submission, display, and counting for photos
 * Requires Google authentication (anonymous users cannot comment)
 */

/**
 * Get all comments for a photo
 */
async function getComments(imageId) {
  if (typeof window.waitForFirebase === 'function') {
    await window.waitForFirebase();
  }

  if (typeof db === 'undefined' || !db) {
    return [];
  }

  try {
    const id = String(imageId);
    const snapshot = await db.collection('comments')
      .where('imageId', '==', id)
      .orderBy('timestamp', 'desc')
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error getting comments:', error);
    return [];
  }
}

/**
 * Get comment count for a photo (used by gallery cards)
 */
async function getCommentCount(imageId) {
  if (typeof window.waitForFirebase === 'function') {
    await window.waitForFirebase();
  }

  if (typeof db === 'undefined' || !db) {
    return 0;
  }

  try {
    const id = String(imageId);
    const snapshot = await db.collection('comments')
      .where('imageId', '==', id)
      .get();

    return snapshot.size;
  } catch (error) {
    console.error('Error getting comment count:', error);
    return 0;
  }
}

/**
 * Submit a comment for a photo (requires Google auth)
 */
async function submitComment(imageId, text) {
  if (typeof window.waitForFirebase === 'function') {
    await window.waitForFirebase();
  }

  if (typeof db === 'undefined' || !db) {
    alert('Comments system is currently unavailable. Please try again later.');
    return false;
  }

  // Require Google authentication
  const userId = window.getCurrentUserId ? window.getCurrentUserId() : null;
  if (!userId || !currentUser || currentUser.isAnonymous) {
    alert('Please sign in with Google to leave a comment.');
    return false;
  }

  // Validate text
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    alert('Please enter a comment.');
    return false;
  }
  if (trimmed.length > 500) {
    alert('Comments must be 500 characters or fewer.');
    return false;
  }

  try {
    const id = String(imageId);
    const docId = `${userId}_${id}`;

    // Check if user already commented
    const existing = await db.collection('comments').doc(docId).get();
    if (existing.exists) {
      alert('You have already commented on this photo.');
      return false;
    }

    // Get display name and photo from provider data (more reliable than top-level fields)
    const user = firebase.auth().currentUser || currentUser;
    const googleProvider = user.providerData && user.providerData.find(p => p.providerId === 'google.com');
    const displayName = googleProvider?.displayName || user.displayName || user.email || 'User';
    const photoURL = googleProvider?.photoURL || user.photoURL || null;

    // Write comment
    await db.collection('comments').doc(docId).set({
      userId: userId,
      imageId: id,
      displayName: displayName,
      photoURL: photoURL,
      text: trimmed,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      approved: true
    });

    console.log(`Comment submitted for photo ${id}`);

    // Refresh comments in modal
    await loadComments(imageId);

    // Update gallery card count
    updateCardCommentCount(imageId);

    return true;
  } catch (error) {
    console.error('Error submitting comment:', error);
    if (error.code === 'permission-denied') {
      alert('Permission denied. Please sign in with Google and try again.');
    } else {
      alert('Failed to submit comment. Please try again.');
    }
    return false;
  }
}

/**
 * Delete own comment for a photo
 */
async function deleteComment(imageId) {
  const userId = window.getCurrentUserId ? window.getCurrentUserId() : null;
  if (!userId) return;

  const confirmed = confirm('Are you sure you want to delete your comment?');
  if (!confirmed) return;

  try {
    const id = String(imageId);
    const docId = `${userId}_${id}`;

    await db.collection('comments').doc(docId).delete();
    console.log(`Comment deleted for photo ${id}`);

    // Refresh comments in modal
    await loadComments(imageId);

    // Update gallery card count
    updateCardCommentCount(imageId);
  } catch (error) {
    console.error('Error deleting comment:', error);
    alert('Failed to delete comment. Please try again.');
  }
}

/**
 * Generate the comment section HTML for the modal
 */
function generateCommentSectionHTML(imageId) {
  const userId = window.getCurrentUserId ? window.getCurrentUserId() : null;
  const isGoogleUser = currentUser && !currentUser.isAnonymous;

  let formHTML;
  if (isGoogleUser) {
    formHTML = `
      <div class="comment-form">
        <textarea
          id="comment-textarea"
          placeholder="Share your thoughts on this photo..."
          maxlength="500"
          rows="3"
        ></textarea>
        <div class="comment-form-footer">
          <span class="comment-char-count">0 / 500</span>
          <button class="comment-submit-btn" id="comment-submit-btn">Submit Comment</button>
        </div>
      </div>
    `;
  } else {
    formHTML = `
      <div class="comment-signin-prompt">
        <p><a href="javascript:void(0);" onclick="signInWithGoogle()">Sign in with Google</a> to leave a comment.</p>
      </div>
    `;
  }

  return `
    <div class="comment-section">
      <h3 class="comment-section-header">
        Comments <span id="comment-count-display"></span>
      </h3>
      ${formHTML}
      <div id="comment-list" class="comment-list"></div>
    </div>
  `;
}

/**
 * Load and render comments in the modal
 */
async function loadComments(imageId) {
  const commentList = document.getElementById('comment-list');
  const countDisplay = document.getElementById('comment-count-display');
  if (!commentList) return;

  const comments = await getComments(imageId);

  // Update count display
  if (countDisplay) {
    countDisplay.textContent = comments.length > 0 ? `(${comments.length})` : '';
  }

  if (comments.length === 0) {
    commentList.innerHTML = '<p class="comment-empty">No comments yet. Be the first to share your thoughts!</p>';
    return;
  }

  const currentUserId = window.getCurrentUserId ? window.getCurrentUserId() : null;

  commentList.innerHTML = comments.map(comment => {
    const initials = getCommentInitials(comment.displayName);
    const timeStr = formatRelativeTime(comment.timestamp);
    const isOwn = currentUserId && comment.userId === currentUserId;

    let avatarHTML;
    if (comment.photoURL) {
      avatarHTML = `<div class="comment-avatar"><img src="${comment.photoURL}" alt="${comment.displayName}" onerror="this.parentElement.innerHTML='<span>${initials}</span>'"></div>`;
    } else {
      avatarHTML = `<div class="comment-avatar"><span>${initials}</span></div>`;
    }

    return `
      <div class="comment-item">
        ${avatarHTML}
        <div class="comment-content">
          <div class="comment-meta">
            <span class="comment-author">${escapeHTML(comment.displayName)}</span>
            <span class="comment-time">${timeStr}</span>
          </div>
          <p class="comment-text">${escapeHTML(comment.text)}</p>
          ${isOwn ? `<button class="comment-delete-btn" onclick="deleteComment(${imageId})">Delete</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Set up event listeners for the comment form
 */
function setupCommentListeners(imageId) {
  const textarea = document.getElementById('comment-textarea');
  const submitBtn = document.getElementById('comment-submit-btn');
  const charCount = document.querySelector('.comment-char-count');

  if (textarea && charCount) {
    textarea.addEventListener('input', () => {
      charCount.textContent = `${textarea.value.length} / 500`;
    });
  }

  if (submitBtn && textarea) {
    submitBtn.addEventListener('click', async () => {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      const success = await submitComment(imageId, textarea.value);

      if (success) {
        textarea.value = '';
        if (charCount) charCount.textContent = '0 / 500';
      }

      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Comment';
    });
  }
}

/**
 * Update comment count on a gallery card
 */
async function updateCardCommentCount(imageId) {
  const id = String(imageId);
  const count = await getCommentCount(imageId);
  const el = document.querySelector(`[data-comment-photo-id="${id}"]`);
  if (el) {
    el.textContent = String(count);
  }
}

/**
 * Load comment counts for all visible gallery cards
 */
async function loadAllCommentCounts() {
  if (!state || !state.galleryData || !state.galleryData.images) return;

  for (const image of state.galleryData.images) {
    updateCardCommentCount(image.id);
  }
}

/**
 * Format a Firestore timestamp as relative time
 */
function formatRelativeTime(timestamp) {
  if (!timestamp || !timestamp.toDate) return '';

  const now = new Date();
  const date = timestamp.toDate();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Get initials from a display name
 */
function getCommentInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Make functions available globally
window.getComments = getComments;
window.getCommentCount = getCommentCount;
window.submitComment = submitComment;
window.deleteComment = deleteComment;
window.generateCommentSectionHTML = generateCommentSectionHTML;
window.loadComments = loadComments;
window.setupCommentListeners = setupCommentListeners;
window.loadAllCommentCounts = loadAllCommentCounts;

console.log('Comments system initialized');

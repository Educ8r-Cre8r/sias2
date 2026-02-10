/**
 * SIAS Admin Dashboard — Comment Moderation
 * Lists all comments with admin delete capability.
 */

let commentsLoaded = false;
let allComments = [];

/**
 * Load all comments from Firestore
 */
async function loadComments() {
    if (commentsLoaded) return;
    commentsLoaded = true;

    const container = document.getElementById('comments-list');
    if (!container) return;
    container.innerHTML = '<p class="text-muted">Loading comments...</p>';

    try {
        const snapshot = await db.collection('comments')
            .orderBy('timestamp', 'desc')
            .limit(200)
            .get();

        allComments = [];
        snapshot.forEach(doc => {
            allComments.push({ id: doc.id, ...doc.data() });
        });

        // Stats
        const uniqueUsers = new Set(allComments.map(c => c.userId)).size;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayCount = allComments.filter(c => {
            const ts = c.timestamp?.toDate ? c.timestamp.toDate() : new Date(c.timestamp || 0);
            return ts >= today;
        }).length;

        document.getElementById('comments-total-count').textContent = allComments.length;
        document.getElementById('comments-unique-users').textContent = uniqueUsers;
        document.getElementById('comments-today-count').textContent = todayCount;

        renderCommentsList(allComments);
    } catch (error) {
        console.error('Load comments error:', error);
        container.innerHTML = '<p class="text-muted">Failed to load comments: ' + escapeHtml(error.message) + '</p>';
    }
}

/**
 * Render the comments list with optional search filter
 */
function renderCommentsList(comments) {
    const container = document.getElementById('comments-list');
    if (!container) return;

    const searchTerm = (document.getElementById('comment-search')?.value || '').toLowerCase();
    let filtered = comments;
    if (searchTerm) {
        filtered = comments.filter(c =>
            (c.text || '').toLowerCase().includes(searchTerm) ||
            (c.displayName || '').toLowerCase().includes(searchTerm)
        );
    }

    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No comments found.</p></div>';
        return;
    }

    const images = metadataManager.getImages();
    const imageMap = {};
    images.forEach(img => { imageMap[String(img.id)] = img; });

    container.innerHTML = filtered.map(c => {
        const img = imageMap[String(c.imageId)];
        const title = img ? escapeHtml(img.title || img.filename) : 'Image #' + escapeHtml(String(c.imageId));
        const ts = c.timestamp?.toDate ? c.timestamp.toDate() : new Date(c.timestamp || 0);
        const timeStr = timeAgo(ts.toISOString());
        const fullTime = ts.toLocaleString();

        const avatarHtml = c.photoURL
            ? `<img src="${c.photoURL}" alt="" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; flex-shrink: 0;">`
            : `<div style="width: 36px; height: 36px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; font-size: 0.85rem;">${(c.displayName || '?')[0].toUpperCase()}</div>`;

        return `
            <div class="comment-mod-item">
                ${avatarHtml}
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
                        <strong style="font-size: 0.9rem;">${escapeHtml(c.displayName || 'Anonymous')}</strong>
                        <span style="font-size: 0.75rem; color: var(--text-muted);" title="${fullTime}">${timeStr}</span>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 6px;">
                        on <strong>${title}</strong>
                    </div>
                    <div style="font-size: 0.9rem; color: var(--text-primary); line-height: 1.5;">
                        ${escapeHtml(c.text || '')}
                    </div>
                </div>
                <button class="btn btn-small btn-outline" style="color: var(--danger); border-color: var(--danger); flex-shrink: 0; align-self: flex-start;"
                        onclick="showDeleteCommentModal('${c.id}')">
                    Delete
                </button>
            </div>
        `;
    }).join('');
}

/**
 * Filter comments based on search input
 */
function filterComments() {
    renderCommentsList(allComments);
}

/**
 * Show delete comment confirmation modal
 */
function showDeleteCommentModal(commentId) {
    const comment = allComments.find(c => c.id === commentId);
    if (!comment) return;

    const modal = document.getElementById('delete-comment-modal');
    const body = document.getElementById('delete-comment-modal-body');

    body.innerHTML = `
        <div style="background: var(--bg-primary); border-radius: var(--radius-sm); padding: 14px; margin: 16px 0;">
            <strong>${escapeHtml(comment.displayName || 'Anonymous')}</strong>
            <p style="margin-top: 8px; color: var(--text-primary);">"${escapeHtml(comment.text || '')}"</p>
        </div>
        <p style="color: var(--danger); font-weight: 600;">This will permanently delete this comment.</p>
        <div class="delete-actions" style="margin-top: 16px;">
            <button class="btn btn-secondary" onclick="closeDeleteCommentModal()">Cancel</button>
            <button class="btn btn-danger" onclick="confirmDeleteComment('${commentId}')">Delete Comment</button>
        </div>
    `;
    modal.classList.remove('hidden');
}

/**
 * Confirm and execute comment deletion
 */
async function confirmDeleteComment(commentId) {
    try {
        await db.collection('comments').doc(commentId).delete();
        showToast('Comment deleted', 'success');
        closeDeleteCommentModal();

        allComments = allComments.filter(c => c.id !== commentId);
        renderCommentsList(allComments);
        document.getElementById('comments-total-count').textContent = allComments.length;
    } catch (error) {
        console.error('Delete comment error:', error);
        showToast('Failed to delete comment: ' + error.message, 'error');
    }
}

/**
 * Close the delete comment modal
 */
function closeDeleteCommentModal() {
    document.getElementById('delete-comment-modal').classList.add('hidden');
}

/**
 * Force refresh comments
 */
function refreshComments() {
    commentsLoaded = false;
    loadComments();
}

// Expose globally
window.loadComments = loadComments;
window.filterComments = filterComments;
window.showDeleteCommentModal = showDeleteCommentModal;
window.confirmDeleteComment = confirmDeleteComment;
window.closeDeleteCommentModal = closeDeleteCommentModal;
window.refreshComments = refreshComments;

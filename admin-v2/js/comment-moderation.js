/**
 * SIAS Admin Dashboard — Comment Moderation
 * Lists all comments with admin approve/reject/delete capability.
 * Includes trusted user management and flagged/rejected status filtering.
 */

let commentsLoaded = false;
let allComments = [];
let commentFilter = 'all'; // 'all', 'pending', 'approved', 'flagged', 'rejected'
let trustedUserIds = new Set();

/**
 * Load all comments from Firestore + trusted users list
 */
async function loadComments() {
    if (commentsLoaded) return;
    commentsLoaded = true;

    const container = document.getElementById('comments-list');
    if (!container) return;
    container.innerHTML = '<p class="text-muted">Loading comments...</p>';

    try {
        // Load comments and trusted users in parallel
        const [commentsSnap, trustedSnap] = await Promise.all([
            db.collection('comments')
                .orderBy('timestamp', 'desc')
                .limit(200)
                .get(),
            db.collection('trustedUsers').get()
        ]);

        allComments = [];
        commentsSnap.forEach(doc => {
            allComments.push({ id: doc.id, ...doc.data() });
        });

        trustedUserIds = new Set();
        trustedSnap.forEach(doc => {
            trustedUserIds.add(doc.id);
        });

        updateCommentStats();
        renderCommentsList(allComments);
    } catch (error) {
        console.error('Load comments error:', error);
        container.innerHTML = '<p class="text-muted">Failed to load comments: ' + escapeHtml(error.message) + '</p>';
    }
}

/**
 * Update comment stats display
 */
function updateCommentStats() {
    const uniqueUsers = new Set(allComments.map(c => c.userId)).size;
    const pendingCount = allComments.filter(c => c.status === 'pending' || (!c.status && !c.approved)).length;
    const flaggedCount = allComments.filter(c => c.status === 'flagged').length;

    document.getElementById('comments-total-count').textContent = allComments.length;
    document.getElementById('comments-unique-users').textContent = uniqueUsers;
    document.getElementById('comments-pending-count').textContent = pendingCount + flaggedCount;

    // Update pending badge on tab button (include flagged in count)
    const tabBtn = document.querySelector('[data-tab="comments"]');
    if (tabBtn) {
        let badge = tabBtn.querySelector('.pending-badge');
        const actionNeeded = pendingCount + flaggedCount;
        if (actionNeeded > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'pending-badge';
                tabBtn.appendChild(badge);
            }
            badge.textContent = actionNeeded;
        } else if (badge) {
            badge.remove();
        }
    }
}

/**
 * Set comment filter and re-render
 */
function setCommentFilter(filter) {
    commentFilter = filter;
    document.querySelectorAll('#comment-filter-pills .pill').forEach(p => {
        p.classList.toggle('active', p.dataset.filter === filter);
    });
    renderCommentsList(allComments);
}

/**
 * Render the comments list with search and status filter
 */
function renderCommentsList(comments) {
    const container = document.getElementById('comments-list');
    if (!container) return;

    const searchTerm = (document.getElementById('comment-search')?.value || '').toLowerCase();
    let filtered = comments;

    // Apply status filter
    if (commentFilter === 'pending') {
        filtered = filtered.filter(c => c.status === 'pending' || (!c.status && !c.approved));
    } else if (commentFilter === 'approved') {
        filtered = filtered.filter(c => c.status === 'approved' || c.approved === true);
    } else if (commentFilter === 'flagged') {
        filtered = filtered.filter(c => c.status === 'flagged');
    } else if (commentFilter === 'rejected') {
        filtered = filtered.filter(c => c.status === 'rejected');
    }

    // Apply search
    if (searchTerm) {
        filtered = filtered.filter(c =>
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

        const isPending = c.status === 'pending' || (!c.status && !c.approved);
        const isFlagged = c.status === 'flagged';
        const isRejected = c.status === 'rejected';
        const isApproved = c.status === 'approved' || c.approved === true;
        const isTrusted = trustedUserIds.has(c.userId);

        // Status badge
        let statusBadge = '';
        if (isRejected) {
            statusBadge = '<span class="badge badge-danger" style="font-size: 0.7rem; margin-left: 6px;">Rejected</span>';
        } else if (isFlagged) {
            statusBadge = '<span class="badge badge-warning" style="font-size: 0.7rem; margin-left: 6px;">Flagged</span>';
        } else if (isPending) {
            statusBadge = '<span class="badge badge-pending" style="font-size: 0.7rem; margin-left: 6px;">Pending</span>';
        } else {
            statusBadge = '<span class="badge badge-success" style="font-size: 0.7rem; margin-left: 6px;">Approved</span>';
        }

        // Trusted user badge
        const trustedBadge = isTrusted
            ? '<span class="badge" style="font-size: 0.65rem; margin-left: 4px; background: #d1e7dd; color: #0f5132;">Trusted</span>'
            : '';

        // Flag/reject reason
        let reasonNote = '';
        if (isFlagged && c.flagReason) {
            reasonNote = `<div style="font-size: 0.75rem; color: var(--warning); margin-top: 4px;">⚠️ ${escapeHtml(c.flagReason)}</div>`;
        } else if (isRejected && c.rejectReason) {
            reasonNote = `<div style="font-size: 0.75rem; color: var(--danger); margin-top: 4px;">🚫 ${escapeHtml(c.rejectReason)}</div>`;
        } else if (isApproved && c.autoApproveReason) {
            reasonNote = `<div style="font-size: 0.75rem; color: var(--success); margin-top: 4px;">✅ ${escapeHtml(c.autoApproveReason)}</div>`;
        }

        const avatarHtml = c.photoURL
            ? `<img src="${c.photoURL}" alt="" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; flex-shrink: 0;">`
            : `<div style="width: 36px; height: 36px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; font-size: 0.85rem;">${(c.displayName || '?')[0].toUpperCase()}</div>`;

        // Action buttons
        const approveBtn = (isPending || isFlagged)
            ? `<button class="btn btn-small btn-primary" style="flex-shrink: 0; align-self: flex-start;" onclick="approveComment('${c.id}')">Approve</button>`
            : '';

        const trustBtn = !isTrusted
            ? `<button class="btn btn-small btn-outline" style="flex-shrink: 0; align-self: flex-start; font-size: 0.75rem;" onclick="trustUser('${escapeHtml(c.userId)}', '${escapeHtml(c.displayName || '')}')">Trust User</button>`
            : '';

        // Background styling for different statuses
        let bgStyle = '';
        if (isFlagged) {
            bgStyle = 'background: #fff3cd; margin: 0 -16px; padding-left: 16px; padding-right: 16px; border-radius: var(--radius-sm);';
        } else if (isRejected) {
            bgStyle = 'background: #f8d7da; margin: 0 -16px; padding-left: 16px; padding-right: 16px; border-radius: var(--radius-sm);';
        } else if (isPending) {
            bgStyle = 'background: var(--warning-light); margin: 0 -16px; padding-left: 16px; padding-right: 16px; border-radius: var(--radius-sm);';
        }

        return `
            <div class="comment-mod-item" style="${bgStyle}">
                ${avatarHtml}
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
                        <div><strong style="font-size: 0.9rem;">${escapeHtml(c.displayName || 'Anonymous')}</strong>${trustedBadge}${statusBadge}</div>
                        <span style="font-size: 0.75rem; color: var(--text-muted);" title="${fullTime}">${timeStr}</span>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 6px;">
                        on <strong>${title}</strong>
                    </div>
                    <div style="font-size: 0.9rem; color: var(--text-primary); line-height: 1.5;">
                        ${escapeHtml(c.text || '')}
                    </div>
                    ${reasonNote}
                </div>
                <div style="display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; align-self: flex-start;">
                    ${approveBtn}
                    ${trustBtn}
                    <button class="btn btn-small btn-outline" style="color: var(--danger); border-color: var(--danger);"
                            onclick="showDeleteCommentModal('${c.id}')">
                        Delete
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Approve a pending or flagged comment
 */
async function approveComment(commentId) {
    try {
        await db.collection('comments').doc(commentId).update({
            status: 'approved',
            approvedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Comment approved', 'success');

        // Update local data
        const comment = allComments.find(c => c.id === commentId);
        if (comment) {
            comment.status = 'approved';
            comment.approved = true;
        }
        updateCommentStats();
        renderCommentsList(allComments);
    } catch (error) {
        console.error('Approve comment error:', error);
        showToast('Failed to approve: ' + error.message, 'error');
    }
}

/**
 * Trust a user — future comments will be auto-approved
 */
async function trustUser(userId, displayName) {
    try {
        await db.collection('trustedUsers').doc(userId).set({
            userId,
            displayName: displayName || '',
            trustedAt: firebase.firestore.FieldValue.serverTimestamp(),
            addedBy: 'admin',
        });
        trustedUserIds.add(userId);
        showToast(`${displayName || 'User'} is now trusted`, 'success');
        renderCommentsList(allComments);
    } catch (error) {
        console.error('Trust user error:', error);
        showToast('Failed to trust user: ' + error.message, 'error');
    }
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
        updateCommentStats();
        renderCommentsList(allComments);
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
window.setCommentFilter = setCommentFilter;
window.approveComment = approveComment;
window.trustUser = trustUser;
window.showDeleteCommentModal = showDeleteCommentModal;
window.confirmDeleteComment = confirmDeleteComment;
window.closeDeleteCommentModal = closeDeleteCommentModal;
window.refreshComments = refreshComments;

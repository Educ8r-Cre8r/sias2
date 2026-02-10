/**
 * SIAS Admin Dashboard — Processing Queue Monitor
 * Real-time Firestore listener on imageQueue collection.
 */

let queueUnsubscribe = null;

/**
 * Start real-time queue monitoring
 */
function startQueueMonitor() {
    if (queueUnsubscribe) queueUnsubscribe();

    try {
        queueUnsubscribe = db.collection('imageQueue')
            .orderBy('createdAt', 'desc')
            .limit(50)
            .onSnapshot(
                snapshot => {
                    const items = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }));
                    renderQueueList(items);
                    renderRecentActivity(items.slice(0, 10));
                    updateQueueBadge(items);
                    if (typeof renderSystemHealth === 'function') renderSystemHealth(items);
                },
                error => {
                    console.error('Queue monitor error:', error);
                    const queueList = document.getElementById('queue-list');
                    if (queueList) {
                        queueList.innerHTML = '<p class="text-muted">Unable to connect to queue. Check Firestore rules.</p>';
                    }
                }
            );
    } catch (error) {
        console.error('Failed to start queue monitor:', error);
    }
}

/**
 * Render the queue list in the Processing Queue tab
 */
function renderQueueList(items) {
    const container = document.getElementById('queue-list');
    if (!container) return;

    if (items.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No items in the processing queue.</p>
                <p style="font-size: 0.85rem; margin-top: 8px;">Upload an image to Firebase Storage to start processing.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = items.map(item => {
        const status = item.status || 'unknown';
        const createdAt = item.createdAt ? formatTimestamp(item.createdAt) : '';
        const completedAt = item.completedAt ? formatTimestamp(item.completedAt) : '';

        let detail = '';
        if (status === 'completed' && completedAt) {
            detail = 'Completed ' + completedAt;
        } else if (status === 'processing' && item.startedAt) {
            detail = 'Started ' + formatTimestamp(item.startedAt);
        } else if (status === 'failed') {
            detail = item.error ? 'Error: ' + item.error : 'Failed after ' + (item.attempts || 0) + ' attempts';
        } else if (createdAt) {
            detail = 'Queued ' + createdAt;
        }

        return `
            <div class="queue-item status-${status}">
                <div class="queue-item-info">
                    <div class="queue-item-filename">${escapeHtml(item.filename || item.filePath || 'Unknown')}</div>
                    <div class="queue-item-detail">${escapeHtml(item.category || '')} ${detail ? '&middot; ' + detail : ''}</div>
                </div>
                <span class="badge badge-${status}">${status}</span>
                ${status === 'failed' ? `<button class="btn btn-small btn-outline" onclick="retryQueueItem('${item.id}')" style="margin-left: 8px; font-size: 0.75rem;">Retry</button>` : ''}
            </div>
        `;
    }).join('');
}

/**
 * Render recent activity in Overview tab
 */
function renderRecentActivity(items) {
    const container = document.getElementById('recent-queue-list');
    if (!container) return;

    if (items.length === 0) {
        container.innerHTML = '<p class="text-muted">No recent queue activity.</p>';
        return;
    }

    container.innerHTML = items.map(item => {
        const status = item.status || 'unknown';
        const name = item.filename || item.filePath || 'Unknown image';
        const time = item.completedAt ? formatTimestamp(item.completedAt)
            : item.createdAt ? formatTimestamp(item.createdAt) : '';

        return `
            <div class="activity-item">
                <div class="activity-dot ${status}"></div>
                <div class="activity-text">${escapeHtml(name)} &mdash; <strong>${status}</strong></div>
                <div class="activity-time">${time}</div>
            </div>
        `;
    }).join('');
}

/**
 * Update the queue status badge
 */
function updateQueueBadge(items) {
    const badge = document.getElementById('queue-status-badge');
    if (!badge) return;

    const pending = items.filter(i => i.status === 'pending').length;
    const processing = items.filter(i => i.status === 'processing').length;
    const failed = items.filter(i => i.status === 'failed').length;

    if (processing > 0) {
        badge.textContent = processing + ' processing';
        badge.className = 'badge badge-processing';
    } else if (pending > 0) {
        badge.textContent = pending + ' pending';
        badge.className = 'badge badge-pending';
    } else if (failed > 0) {
        badge.textContent = failed + ' failed';
        badge.className = 'badge badge-danger';
    } else {
        badge.textContent = items.length + ' total';
        badge.className = 'badge badge-neutral';
    }
}

/**
 * Format a Firestore timestamp for display
 */
function formatTimestamp(ts) {
    if (!ts) return '';
    // Handle Firestore Timestamp objects and ISO strings
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return diffMins + 'm ago';
    if (diffMins < 1440) return Math.floor(diffMins / 60) + 'h ago';

    return date.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
}

/**
 * Clear completed items from the queue
 */
async function clearCompletedQueue() {
    try {
        const clearFn = firebase.functions().httpsCallable('adminClearCompletedQueue');
        const result = await clearFn();
        showToast(`Cleared ${result.data.count || 0} completed items`, 'success');
    } catch (error) {
        console.error('Clear queue error:', error);
        showToast('Failed to clear queue: ' + error.message, 'error');
    }
}

/**
 * Retry a failed queue item by resetting status to pending
 */
async function retryQueueItem(docId) {
    try {
        await db.collection('imageQueue').doc(docId).update({
            status: 'pending',
            error: firebase.firestore.FieldValue.delete(),
            retriedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Queue item reset to pending', 'success');
    } catch (error) {
        console.error('Retry error:', error);
        showToast('Retry failed: ' + error.message, 'error');
    }
}

// Expose globally
window.startQueueMonitor = startQueueMonitor;
window.clearCompletedQueue = clearCompletedQueue;
window.retryQueueItem = retryQueueItem;

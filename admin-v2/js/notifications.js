/**
 * SIAS Admin Dashboard — Notification Center
 * Real-time alerts from Firestore changes, persisted via localStorage.
 * Notifications survive page refreshes until explicitly dismissed.
 */

// ── State ─────────────────────────────────────────────────────────────
let notifications = [];
let commentsUnsubscribe = null;
let notificationPanelOpen = false;
let initialQueueSnapshotProcessed = false;
let initialCommentsSnapshotProcessed = false;
let knownQueueState = new Map();   // docId → status
let knownCommentIds = new Set();

const STORAGE_KEY_NOTIFICATIONS = 'sias-notifications';
const STORAGE_KEY_DISMISSED = 'sias-notifications-dismissed';
const STORAGE_KEY_LAST_SEEN = 'sias-notifications-last-seen';
const MAX_NOTIFICATIONS = 50;
const NOTIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Notification persistence ──────────────────────────────────────────
function saveNotifications() {
    try {
        const serializable = notifications.map(n => ({
            ...n,
            timestamp: n.timestamp.toISOString()
        }));
        localStorage.setItem(STORAGE_KEY_NOTIFICATIONS, JSON.stringify(serializable));
    } catch {}
}

function loadNotifications() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_NOTIFICATIONS);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        const now = Date.now();
        const dismissed = loadDismissed();
        // Restore, prune old and dismissed
        return parsed
            .map(n => ({ ...n, timestamp: new Date(n.timestamp) }))
            .filter(n => (now - n.timestamp.getTime()) < NOTIFICATION_TTL_MS && !dismissed[n.id]);
    } catch {
        return [];
    }
}

// ── Dismissed persistence ─────────────────────────────────────────────
function loadDismissed() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_DISMISSED);
        if (!raw) return {};
        const map = JSON.parse(raw);
        const now = Date.now();
        const pruned = {};
        for (const [id, ts] of Object.entries(map)) {
            if (now - ts < NOTIFICATION_TTL_MS) pruned[id] = ts;
        }
        if (Object.keys(pruned).length !== Object.keys(map).length) {
            localStorage.setItem(STORAGE_KEY_DISMISSED, JSON.stringify(pruned));
        }
        return pruned;
    } catch {
        return {};
    }
}

function saveDismissed(map) {
    try { localStorage.setItem(STORAGE_KEY_DISMISSED, JSON.stringify(map)); } catch {}
}

function isDismissed(id) {
    const map = loadDismissed();
    return !!map[id];
}

function getLastSeen() {
    try {
        const ts = localStorage.getItem(STORAGE_KEY_LAST_SEEN);
        return ts ? new Date(ts) : new Date(0);
    } catch { return new Date(0); }
}

function setLastSeen() {
    try { localStorage.setItem(STORAGE_KEY_LAST_SEEN, new Date().toISOString()); } catch {}
}

// ── Core notification management ──────────────────────────────────────
function addNotification({ id, type, title, message, actionTab, fireToast }) {
    if (isDismissed(id)) return;
    if (notifications.some(n => n.id === id)) return;

    const notif = {
        id,
        type,
        title,
        message,
        timestamp: new Date(),
        read: false,
        actionTab: actionTab || null
    };

    notifications.unshift(notif);
    if (notifications.length > MAX_NOTIFICATIONS) {
        notifications = notifications.slice(0, MAX_NOTIFICATIONS);
    }

    saveNotifications();
    updateNotificationBadge();
    if (notificationPanelOpen) renderNotificationPanel();

    // Fire toast for high-priority alerts
    if (fireToast && typeof showToast === 'function') {
        const toastType = type === 'queue-failed' ? 'error' : 'info';
        showToast(title + ': ' + message, toastType, 5000);
    }
}

function dismissNotification(id) {
    const map = loadDismissed();
    map[id] = Date.now();
    saveDismissed(map);

    notifications = notifications.filter(n => n.id !== id);
    saveNotifications();
    updateNotificationBadge();
    renderNotificationPanel();
}

function dismissAllNotifications() {
    const map = loadDismissed();
    for (const n of notifications) {
        map[n.id] = Date.now();
    }
    saveDismissed(map);
    notifications = [];
    saveNotifications();
    updateNotificationBadge();
    renderNotificationPanel();
}

// ── Badge ─────────────────────────────────────────────────────────────
function updateNotificationBadge() {
    const badge = document.getElementById('notification-badge');
    const btn = document.querySelector('.notification-bell-btn');
    if (!badge) return;

    const lastSeen = getLastSeen();
    const unreadCount = notifications.filter(n => n.timestamp > lastSeen).length;

    if (unreadCount > 0) {
        badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        badge.classList.remove('hidden');
        if (btn) btn.classList.add('has-notifications');
    } else {
        badge.classList.add('hidden');
        if (btn) btn.classList.remove('has-notifications');
    }
}

// ── Panel toggle ──────────────────────────────────────────────────────
function toggleNotificationPanel() {
    const panel = document.getElementById('notification-panel');
    if (!panel) return;

    notificationPanelOpen = !notificationPanelOpen;

    if (notificationPanelOpen) {
        panel.classList.remove('hidden');
        setLastSeen();
        notifications.forEach(n => { n.read = true; });
        saveNotifications();
        updateNotificationBadge();
        renderNotificationPanel();
    } else {
        panel.classList.add('hidden');
    }
}

// Click-outside handler
function handleClickOutside(e) {
    if (!notificationPanelOpen) return;
    const wrapper = document.querySelector('.notification-bell-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
        notificationPanelOpen = false;
        const panel = document.getElementById('notification-panel');
        if (panel) panel.classList.add('hidden');
    }
}

// ── Panel rendering ───────────────────────────────────────────────────
function getNotificationIcon(type) {
    switch (type) {
        case 'queue-completed': return { emoji: '✅', cls: 'icon-success' };
        case 'queue-failed':    return { emoji: '❌', cls: 'icon-danger' };
        case 'comment-pending': return { emoji: '💬', cls: 'icon-warning' };
        case 'activity-spike':  return { emoji: '📈', cls: 'icon-info' };
        default:                return { emoji: '🔔', cls: 'icon-info' };
    }
}

function renderNotificationPanel() {
    const container = document.getElementById('notification-list');
    if (!container) return;

    if (notifications.length === 0) {
        container.innerHTML = `
            <div class="notification-empty">
                <span style="font-size: 1.5rem;">🔔</span>
                <p>No notifications</p>
            </div>
        `;
        return;
    }

    container.innerHTML = notifications.map(n => {
        const icon = getNotificationIcon(n.type);
        const ts = typeof timeAgo === 'function' ? timeAgo(n.timestamp.toISOString()) : '';
        const actionHtml = n.actionTab
            ? `<span class="notification-action" onclick="event.stopPropagation(); notificationNavigate('${n.actionTab}', '${n.id}')">View →</span>`
            : '';

        return `
            <div class="notification-item" onclick="notificationNavigate('${n.actionTab || ''}', '${n.id}')">
                <div class="notification-icon ${icon.cls}">${icon.emoji}</div>
                <div class="notification-body">
                    <div class="notification-title">${escapeHtml(n.title)}</div>
                    <div class="notification-message">${escapeHtml(n.message)}</div>
                    <div class="notification-time">${ts}</div>
                    ${actionHtml}
                </div>
                <button class="notification-dismiss" onclick="event.stopPropagation(); dismissNotification('${n.id}')" title="Dismiss">&times;</button>
            </div>
        `;
    }).join('');
}

function notificationNavigate(tabName, notifId) {
    if (tabName && typeof switchTab === 'function') {
        switchTab(tabName);
    }
    // Close panel
    notificationPanelOpen = false;
    const panel = document.getElementById('notification-panel');
    if (panel) panel.classList.add('hidden');
}

// ── Queue notification detector ───────────────────────────────────────
function checkQueueNotifications(items) {
    if (!initialQueueSnapshotProcessed) {
        // First snapshot: record baseline
        for (const item of items) {
            knownQueueState.set(item.id, item.status);
        }
        initialQueueSnapshotProcessed = true;
        return;
    }

    const images = typeof metadataManager !== 'undefined' ? metadataManager.getImages() : [];
    const imageMap = {};
    images.forEach(img => { imageMap[String(img.id)] = img; });

    for (const item of items) {
        const prevStatus = knownQueueState.get(item.id);
        const filename = item.filename || item.filePath || 'Unknown image';

        if (item.status === 'completed' && prevStatus !== 'completed') {
            addNotification({
                id: 'queue-completed-' + item.id,
                type: 'queue-completed',
                title: 'Processing Complete',
                message: '"' + filename + '" processed successfully',
                actionTab: 'queue',
                fireToast: false
            });
        }

        if (item.status === 'failed' && prevStatus !== 'failed') {
            const errorMsg = item.error || 'after ' + (item.attempts || 0) + ' attempts';
            addNotification({
                id: 'queue-failed-' + item.id,
                type: 'queue-failed',
                title: 'Processing Failed',
                message: '"' + filename + '" failed: ' + errorMsg,
                actionTab: 'queue',
                fireToast: true
            });
        }

        knownQueueState.set(item.id, item.status);
    }
}

// ── Comment notification listener ─────────────────────────────────────
function startCommentListener() {
    if (commentsUnsubscribe) commentsUnsubscribe();

    try {
        commentsUnsubscribe = db.collection('comments')
            .where('status', '==', 'pending')
            .orderBy('timestamp', 'desc')
            .limit(20)
            .onSnapshot(
                snapshot => {
                    if (!initialCommentsSnapshotProcessed) {
                        // First snapshot: record baseline
                        snapshot.docs.forEach(doc => knownCommentIds.add(doc.id));
                        initialCommentsSnapshotProcessed = true;
                        if (snapshot.docs.length > 0) {
                            updatePendingCommentsBadge(snapshot.docs.length);
                        }
                        return;
                    }

                    const images = typeof metadataManager !== 'undefined' ? metadataManager.getImages() : [];
                    const imageMap = {};
                    images.forEach(img => { imageMap[String(img.id)] = img; });

                    snapshot.docs.forEach(doc => {
                        if (!knownCommentIds.has(doc.id)) {
                            const d = doc.data();
                            const img = imageMap[String(d.imageId)];
                            const imageTitle = img ? (img.title || img.filename) : 'Image #' + d.imageId;
                            const userName = d.displayName || 'A user';

                            addNotification({
                                id: 'comment-pending-' + doc.id,
                                type: 'comment-pending',
                                title: 'New Comment',
                                message: userName + ' commented on "' + imageTitle + '"',
                                actionTab: 'comments',
                                fireToast: true
                            });
                            knownCommentIds.add(doc.id);
                        }
                    });

                    // Remove IDs no longer in pending (approved/deleted)
                    const currentIds = new Set(snapshot.docs.map(d => d.id));
                    for (const id of knownCommentIds) {
                        if (!currentIds.has(id)) knownCommentIds.delete(id);
                    }

                    updatePendingCommentsBadge(snapshot.docs.length);
                },
                error => {
                    console.error('Comment notification listener error:', error);
                }
            );
    } catch (error) {
        console.error('Failed to start comment listener:', error);
    }
}

function updatePendingCommentsBadge(count) {
    const commentsTab = document.querySelector('.tab-btn[data-tab="comments"]');
    if (!commentsTab) return;

    let badge = commentsTab.querySelector('.pending-badge');
    if (count > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'pending-badge';
            commentsTab.appendChild(badge);
        }
        badge.textContent = count;
    } else if (badge) {
        badge.remove();
    }
}

// ── Activity spike detector ───────────────────────────────────────────
async function checkActivitySpike() {
    try {
        const viewsSnap = await db.collection('views').get();
        if (viewsSnap.empty) return;

        const now = Date.now();
        const oneHourAgo = now - 60 * 60 * 1000;
        let recentlyActive = 0;
        let totalDocs = 0;

        viewsSnap.forEach(doc => {
            totalDocs++;
            const d = doc.data();
            const lastViewed = d.lastViewed?.toDate ? d.lastViewed.toDate().getTime()
                             : d.lastViewed ? new Date(d.lastViewed).getTime() : 0;
            if (lastViewed > oneHourAgo) recentlyActive++;
        });

        // Spike: more than 20% of images viewed in the last hour, minimum 5
        const threshold = Math.max(5, Math.round(totalDocs * 0.2));
        if (recentlyActive >= threshold) {
            const hourKey = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
            addNotification({
                id: 'activity-spike-' + hourKey,
                type: 'activity-spike',
                title: 'Activity Spike',
                message: recentlyActive + ' images viewed in the last hour (threshold: ' + threshold + ')',
                actionTab: 'analytics',
                fireToast: false
            });
        }
    } catch (error) {
        console.error('Activity spike check error:', error);
    }
}

// ── Init ──────────────────────────────────────────────────────────────
function initNotifications() {
    // Load persisted notifications from localStorage
    notifications = loadNotifications();

    // Load and prune dismissed map
    loadDismissed();

    // Start real-time listener for pending comments
    startCommentListener();

    // Check for activity spikes
    checkActivitySpike();

    // Render badge with any persisted notifications
    updateNotificationBadge();

    // Click-outside to close panel
    document.addEventListener('click', handleClickOutside);
}

// ── Cleanup ───────────────────────────────────────────────────────────
function destroyNotifications() {
    if (commentsUnsubscribe) {
        commentsUnsubscribe();
        commentsUnsubscribe = null;
    }
    document.removeEventListener('click', handleClickOutside);
    notifications = [];
    knownQueueState.clear();
    knownCommentIds.clear();
    initialQueueSnapshotProcessed = false;
    initialCommentsSnapshotProcessed = false;
}

// ── Expose globally ───────────────────────────────────────────────────
window.initNotifications = initNotifications;
window.destroyNotifications = destroyNotifications;
window.checkQueueNotifications = checkQueueNotifications;
window.toggleNotificationPanel = toggleNotificationPanel;
window.dismissNotification = dismissNotification;
window.dismissAllNotifications = dismissAllNotifications;
window.notificationNavigate = notificationNavigate;

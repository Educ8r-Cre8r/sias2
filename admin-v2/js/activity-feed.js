/**
 * SIAS Admin Dashboard — Activity Feed
 * Recent comments, ratings, and views from Firestore.
 */

let activityLoaded = false;

async function loadActivityFeed() {
    if (activityLoaded) return;
    activityLoaded = true;

    const container = document.getElementById('activity-feed-list');
    if (!container) return;

    container.innerHTML = '<p class="text-muted" style="text-align:center; padding: 24px;">Loading activity...</p>';

    try {
        const activities = [];

        // Fetch recent comments (most useful — has user info + timestamp)
        const commentsSnap = await db.collection('comments')
            .orderBy('timestamp', 'desc')
            .limit(30)
            .get();

        commentsSnap.forEach(doc => {
            const d = doc.data();
            activities.push({
                type: 'comment',
                imageId: d.imageId,
                user: d.displayName || 'Anonymous',
                text: d.text || '',
                timestamp: d.timestamp,
                icon: '💬'
            });
        });

        // Fetch all ratings docs
        const ratingsSnap = await db.collection('ratings').get();
        ratingsSnap.forEach(doc => {
            const d = doc.data();
            if (d.lastRated) {
                activities.push({
                    type: 'rating',
                    imageId: doc.id,
                    totalRatings: d.totalRatings || 0,
                    averageRating: d.averageRating || 0,
                    timestamp: d.lastRated,
                    icon: '⭐'
                });
            }
        });

        // Fetch all views docs
        const viewsSnap = await db.collection('views').get();
        viewsSnap.forEach(doc => {
            const d = doc.data();
            if (d.lastViewed) {
                activities.push({
                    type: 'view',
                    imageId: doc.id,
                    count: d.count || 0,
                    timestamp: d.lastViewed,
                    icon: '👁'
                });
            }
        });

        // Sort all by timestamp descending
        activities.sort((a, b) => {
            const tA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
            const tB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);
            return tB - tA;
        });

        renderActivityFeed(activities.slice(0, 50), container);
    } catch (error) {
        console.error('Activity feed error:', error);
        container.innerHTML = '<p class="text-muted">Failed to load activity feed. ' + escapeHtml(error.message) + '</p>';
    }
}

function renderActivityFeed(activities, container) {
    if (activities.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No recent activity found.</p></div>';
        return;
    }

    const images = metadataManager.getImages();
    const imageMap = {};
    images.forEach(img => { imageMap[String(img.id)] = img; });

    container.innerHTML = activities.map(a => {
        const img = imageMap[String(a.imageId)];
        const title = img ? escapeHtml(img.title || img.filename) : `Image #${escapeHtml(String(a.imageId))}`;
        const ts = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
        const timeStr = timeAgo(ts.toISOString());

        let detail = '';
        if (a.type === 'comment') {
            const preview = a.text.length > 80 ? a.text.substring(0, 80) + '...' : a.text;
            detail = `<strong>${escapeHtml(a.user)}</strong> commented on <strong>${title}</strong>: "${escapeHtml(preview)}"`;
        } else if (a.type === 'rating') {
            detail = `<strong>${title}</strong> — ${a.totalRatings} rating${a.totalRatings !== 1 ? 's' : ''}, avg ${a.averageRating.toFixed(1)}★`;
        } else if (a.type === 'view') {
            detail = `<strong>${title}</strong> — ${a.count.toLocaleString()} total view${a.count !== 1 ? 's' : ''}`;
        }

        return `
            <div class="activity-feed-item">
                <span class="activity-feed-icon">${a.icon}</span>
                <div class="activity-feed-content">
                    <div class="activity-feed-detail">${detail}</div>
                    <div class="activity-feed-time">${timeStr}</div>
                </div>
            </div>
        `;
    }).join('');
}

function refreshActivityFeed() {
    activityLoaded = false;
    loadActivityFeed();
}

// Expose globally
window.loadActivityFeed = loadActivityFeed;
window.refreshActivityFeed = refreshActivityFeed;

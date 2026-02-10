/**
 * SIAS Admin Dashboard — App Controller
 * Tab switching, initialization, shared utilities.
 */

let dashboardInitialized = false;

/**
 * Initialize the dashboard after auth succeeds
 */
async function initDashboard() {
    if (dashboardInitialized) return;
    dashboardInitialized = true;

    // Load metadata first — everything depends on it
    await metadataManager.load();

    // Initialize all tabs
    renderOverview();
    renderImagesGrid();
    renderCostAnalytics();
    renderContentAudit();

    // Load NGSS coverage (part of Content Audit tab)
    if (typeof loadNgssCoverage === 'function') loadNgssCoverage();

    // Start real-time queue monitor
    startQueueMonitor();

    // Load engagement stats for overview
    loadOverviewEngagement();
}

/**
 * Switch visible tab
 */
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === 'tab-' + tabName);
    });

    // Lazy-load data for tabs that query Firestore
    if (tabName === 'activity' && typeof loadActivityFeed === 'function') loadActivityFeed();
    if (tabName === 'analytics' && typeof loadAnalytics === 'function') loadAnalytics();
    if (tabName === 'comments' && typeof loadComments === 'function') loadComments();
}

/**
 * Render overview stats
 */
function renderOverview() {
    const data = metadataManager.getData();
    if (!data) return;

    const images = data.images;
    const lifeSci = images.filter(i => i.category === 'life-science');
    const earthSci = images.filter(i => i.category === 'earth-space-science');
    const physSci = images.filter(i => i.category === 'physical-science');
    const withCost = images.filter(i => i.processingCost !== undefined && i.processingCost !== null);

    const totalCost = withCost.reduce((sum, i) => sum + (i.processingCost || 0), 0);
    const avgCost = withCost.length > 0 ? totalCost / withCost.length : 0;

    document.getElementById('stat-total').textContent = images.length;
    document.getElementById('stat-life').textContent = lifeSci.length;
    document.getElementById('stat-earth').textContent = earthSci.length;
    document.getElementById('stat-physical').textContent = physSci.length;
    document.getElementById('stat-total-cost').textContent = totalCost > 0 ? '$' + totalCost.toFixed(2) : '--';
    document.getElementById('stat-avg-cost').textContent = avgCost > 0 ? '$' + avgCost.toFixed(4) : '--';
}

/**
 * Show a toast notification
 */
function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(40px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * Format an ISO date string for display
 */
function formatDate(isoString) {
    if (!isoString) return '\u2014';
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    });
}

/**
 * Format a relative timestamp
 */
function timeAgo(isoString) {
    if (!isoString) return '';
    const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
}

/**
 * Get category badge class
 */
function getCategoryBadgeClass(category) {
    switch (category) {
        case 'life-science': return 'badge-life';
        case 'earth-space-science': return 'badge-earth';
        case 'physical-science': return 'badge-physical';
        default: return 'badge-neutral';
    }
}

/**
 * Get category display name
 */
function getCategoryName(category) {
    switch (category) {
        case 'life-science': return 'Life Science';
        case 'earth-space-science': return 'Earth & Space';
        case 'physical-science': return 'Physical Science';
        default: return category;
    }
}

/**
 * Compute all associated file paths for an image
 */
function computeAssociatedFiles(image) {
    const { filename, category } = image;
    const nameNoExt = filename.replace(/\.[^.]+$/, '');
    const grades = ['kindergarten', 'first-grade', 'second-grade', 'third-grade', 'fourth-grade', 'fifth-grade'];

    return {
        images: [
            `images/${category}/${filename}`,
            `images/${category}/thumbs/${filename}`,
            `images/${category}/webp/${nameNoExt}.webp`,
            `images/${category}/placeholders/${filename}`,
        ],
        content: [
            `content/${category}/${nameNoExt}.json`,
            ...grades.map(g => `content/${category}/${nameNoExt}-${g}.json`),
            `content/${category}/${nameNoExt}-edp.json`,
        ],
        hotspots: [
            `hotspots/${category}/${nameNoExt}.json`,
        ],
        pdfs: [
            ...grades.map(g => `pdfs/${category}/${nameNoExt}-${g}.pdf`),
            `pdfs/${category}/${nameNoExt}-edp.pdf`,
        ]
    };
}

/**
 * Count total files from associated files object
 */
function countAssociatedFiles(filesObj) {
    return filesObj.images.length + filesObj.content.length + filesObj.hotspots.length + filesObj.pdfs.length;
}

/**
 * Load engagement stats for the Overview tab
 */
async function loadOverviewEngagement() {
    try {
        const [viewsSnap, ratingsSnap, commentsSnap] = await Promise.all([
            db.collection('views').get(),
            db.collection('ratings').get(),
            db.collection('comments').orderBy('timestamp', 'desc').limit(5).get()
        ]);

        // Total views
        let totalViews = 0;
        viewsSnap.forEach(doc => { totalViews += (doc.data().count || 0); });
        document.getElementById('stat-total-views').textContent = totalViews.toLocaleString();

        // Total ratings + avg
        let totalRatings = 0, totalStars = 0;
        ratingsSnap.forEach(doc => {
            const d = doc.data();
            totalRatings += (d.totalRatings || 0);
            totalStars += (d.averageRating || 0) * (d.totalRatings || 0);
        });
        document.getElementById('stat-total-ratings').textContent = totalRatings.toLocaleString();
        const avgRating = totalRatings > 0 ? (totalStars / totalRatings) : 0;
        document.getElementById('stat-avg-rating-overview').textContent = avgRating > 0 ? avgRating.toFixed(1) + '\u2605' : '--';

        // Total comments
        document.getElementById('stat-total-comments').textContent = commentsSnap.size.toString();

        // Render recent comments
        renderRecentComments(commentsSnap);

        // "New this week" badge
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const newThisWeek = metadataManager.getImages().filter(img => {
            if (!img.processedAt) return false;
            return new Date(img.processedAt) >= oneWeekAgo;
        }).length;

        if (newThisWeek > 0 && !document.getElementById('new-this-week-badge')) {
            const totalEl = document.getElementById('stat-total');
            if (totalEl) {
                const badge = document.createElement('span');
                badge.id = 'new-this-week-badge';
                badge.className = 'badge badge-success';
                badge.style.cssText = 'font-size: 0.65rem; margin-left: 6px; vertical-align: super;';
                badge.textContent = '+' + newThisWeek + ' this week';
                totalEl.appendChild(badge);
            }
        }
    } catch (error) {
        console.error('Overview engagement error:', error);
    }
}

/**
 * Render recent comments preview in Overview
 */
function renderRecentComments(snapshot) {
    const container = document.getElementById('recent-comments-list');
    if (!container) return;

    if (snapshot.empty) {
        container.innerHTML = '<p class="text-muted">No comments yet.</p>';
        return;
    }

    const images = metadataManager.getImages();
    const imageMap = {};
    images.forEach(img => { imageMap[String(img.id)] = img; });

    let html = '';
    snapshot.forEach(doc => {
        const d = doc.data();
        const img = imageMap[String(d.imageId)];
        const title = img ? escapeHtml(img.title || img.filename) : 'Image #' + d.imageId;
        const ts = d.timestamp?.toDate ? d.timestamp.toDate() : new Date(d.timestamp || 0);
        const preview = (d.text || '').length > 60 ? d.text.substring(0, 60) + '...' : (d.text || '');
        html += `
            <div style="display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border-light);">
                <span style="font-size: 1.1rem;">💬</span>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 0.85rem;"><strong>${escapeHtml(d.displayName || 'User')}</strong> on ${title}</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">"${escapeHtml(preview)}" · ${timeAgo(ts.toISOString())}</div>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

/**
 * Render system health indicators in Overview
 */
function renderSystemHealth(queueItems) {
    const container = document.getElementById('system-health-content');
    if (!container) return;

    const failed = queueItems.filter(i => i.status === 'failed').length;
    const processing = queueItems.filter(i => i.status === 'processing').length;
    const pending = queueItems.filter(i => i.status === 'pending').length;

    const completed = queueItems.filter(i => i.status === 'completed' && i.completedAt);
    let lastProcessed = 'None';
    if (completed.length > 0) {
        const sorted = completed.sort((a, b) => {
            const tA = a.completedAt?.toDate ? a.completedAt.toDate() : new Date(0);
            const tB = b.completedAt?.toDate ? b.completedAt.toDate() : new Date(0);
            return tB - tA;
        });
        const ts = sorted[0].completedAt?.toDate ? sorted[0].completedAt.toDate() : null;
        if (ts) lastProcessed = timeAgo(ts.toISOString());
    }

    const healthColor = failed > 0 ? 'var(--danger)' : processing > 0 ? 'var(--info)' : 'var(--success)';
    const healthStatus = failed > 0 ? 'Attention Needed' : processing > 0 ? 'Processing' : 'All Clear';

    container.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
            <div style="width: 12px; height: 12px; border-radius: 50%; background: ${healthColor};"></div>
            <strong style="font-size: 1rem;">${healthStatus}</strong>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.85rem;">
            <div>Pending: <strong>${pending}</strong></div>
            <div>Processing: <strong>${processing}</strong></div>
            <div style="${failed > 0 ? 'color: var(--danger); font-weight: 600;' : ''}">Failed: <strong>${failed}</strong></div>
            <div>Last processed: <strong>${lastProcessed}</strong></div>
        </div>
    `;
}

// Expose globally
window.initDashboard = initDashboard;
window.switchTab = switchTab;
window.renderSystemHealth = renderSystemHealth;
window.showToast = showToast;
window.formatDate = formatDate;
window.timeAgo = timeAgo;
window.getCategoryBadgeClass = getCategoryBadgeClass;
window.getCategoryName = getCategoryName;
window.computeAssociatedFiles = computeAssociatedFiles;
window.countAssociatedFiles = countAssociatedFiles;

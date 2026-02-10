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

// Expose globally
window.initDashboard = initDashboard;
window.switchTab = switchTab;
window.showToast = showToast;
window.formatDate = formatDate;
window.timeAgo = timeAgo;
window.getCategoryBadgeClass = getCategoryBadgeClass;
window.getCategoryName = getCategoryName;
window.computeAssociatedFiles = computeAssociatedFiles;
window.countAssociatedFiles = countAssociatedFiles;

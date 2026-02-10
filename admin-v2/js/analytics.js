/**
 * SIAS Admin Dashboard — User Analytics
 * View counts, ratings distribution, most/least popular images.
 */

let analyticsLoaded = false;

async function loadAnalytics() {
    if (analyticsLoaded) return;
    analyticsLoaded = true;

    // Show loading
    ['analytics-total-views', 'analytics-total-ratings', 'analytics-avg-rating', 'analytics-most-viewed']
        .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '...'; });

    try {
        const images = metadataManager.getImages();

        // Batch read all views and ratings
        const [viewsSnap, ratingsSnap] = await Promise.all([
            db.collection('views').get(),
            db.collection('ratings').get()
        ]);

        const viewsMap = {};
        viewsSnap.forEach(doc => { viewsMap[doc.id] = doc.data(); });

        const ratingsMap = {};
        ratingsSnap.forEach(doc => { ratingsMap[doc.id] = doc.data(); });

        // Enrich images with engagement data
        let totalViews = 0, totalRatings = 0, totalStars = 0;
        const enriched = images.map(img => {
            const v = viewsMap[String(img.id)] || {};
            const r = ratingsMap[String(img.id)] || {};
            const views = v.count || 0;
            const ratingCount = r.totalRatings || 0;
            const avgRating = r.averageRating || 0;
            totalViews += views;
            totalRatings += ratingCount;
            totalStars += avgRating * ratingCount;
            return { ...img, views, ratingCount, avgRating };
        });

        const overallAvgRating = totalRatings > 0 ? (totalStars / totalRatings) : 0;

        // Find most viewed
        const sortedByViews = [...enriched].sort((a, b) => b.views - a.views);
        const mostViewed = sortedByViews[0];

        // Render summary stats
        document.getElementById('analytics-total-views').textContent = totalViews.toLocaleString();
        document.getElementById('analytics-total-ratings').textContent = totalRatings.toLocaleString();
        document.getElementById('analytics-avg-rating').textContent = overallAvgRating > 0 ? overallAvgRating.toFixed(1) + '★' : '--';
        document.getElementById('analytics-most-viewed').textContent = mostViewed ? (mostViewed.views.toLocaleString() + ' views') : '--';
        document.getElementById('analytics-most-viewed').title = mostViewed ? (mostViewed.title || mostViewed.filename) : '';

        // Render category breakdown bars
        renderCategoryEngagementBars(enriched);

        // Render most viewed table
        renderRankedTable('most-viewed-body', sortedByViews.slice(0, 10), 'views');

        // Render highest rated table (min 2 ratings)
        const withRatings = enriched.filter(e => e.ratingCount >= 2);
        const sortedByRating = [...withRatings].sort((a, b) => b.avgRating - a.avgRating || b.ratingCount - a.ratingCount);
        renderRankedTable('highest-rated-body', sortedByRating.slice(0, 10), 'rating');

    } catch (error) {
        console.error('Analytics error:', error);
        showToast('Failed to load analytics: ' + error.message, 'error');
    }
}

function renderCategoryEngagementBars(enriched) {
    const container = document.getElementById('analytics-category-bars');
    if (!container) return;

    const categories = ['life-science', 'earth-space-science', 'physical-science'];
    const catData = categories.map(cat => {
        const catImages = enriched.filter(e => e.category === cat);
        const views = catImages.reduce((s, e) => s + e.views, 0);
        const ratings = catImages.reduce((s, e) => s + e.ratingCount, 0);
        return { category: cat, count: catImages.length, views, ratings };
    });

    const maxViews = Math.max(...catData.map(c => c.views), 1);

    container.innerHTML = catData.map(c => {
        const pct = Math.round((c.views / maxViews) * 100);
        return `
            <div class="cost-bar-row">
                <div class="cost-bar-label">
                    <span class="badge ${getCategoryBadgeClass(c.category)}">${getCategoryName(c.category)}</span>
                    <span class="cost-bar-info">${c.count} images</span>
                </div>
                <div class="cost-bar-track">
                    <div class="cost-bar-fill" style="width: ${pct}%"></div>
                </div>
                <div class="cost-bar-value">${c.views.toLocaleString()} views · ${c.ratings} ratings</div>
            </div>
        `;
    }).join('');
}

function renderRankedTable(tbodyId, items, mode) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-muted">No data available</td></tr>';
        return;
    }

    tbody.innerHTML = items.map((item, i) => {
        const title = escapeHtml(item.title || item.filename);
        const catBadge = `<span class="badge ${getCategoryBadgeClass(item.category)}">${getCategoryName(item.category)}</span>`;

        if (mode === 'views') {
            return `<tr>
                <td>${i + 1}</td>
                <td>${title}</td>
                <td>${catBadge}</td>
                <td><strong>${item.views.toLocaleString()}</strong></td>
                <td>${item.avgRating > 0 ? item.avgRating.toFixed(1) + '★' : '—'}</td>
            </tr>`;
        } else {
            return `<tr>
                <td>${i + 1}</td>
                <td>${title}</td>
                <td>${catBadge}</td>
                <td><strong>${item.avgRating.toFixed(1)}★</strong></td>
                <td>${item.ratingCount}</td>
            </tr>`;
        }
    }).join('');
}

function refreshAnalytics() {
    analyticsLoaded = false;
    loadAnalytics();
}

// Expose globally
window.loadAnalytics = loadAnalytics;
window.refreshAnalytics = refreshAnalytics;

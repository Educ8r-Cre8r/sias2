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
            getCachedCollection('views'),
            getCachedCollection('ratings')
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

        // Load engagement trend chart
        loadTimeSeries('week');

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
    trendChartInstance = null;
    loadAnalytics();
}

// ========== Engagement Trends (Time-Series) ==========

let trendChartInstance = null;

async function loadTimeSeries(period = 'week') {
    // Update active pill
    document.querySelectorAll('#trend-period-pills .pill').forEach(p => {
        p.classList.toggle('active', p.dataset.period === period);
    });

    const container = document.getElementById('trend-chart-container');
    if (!container) return;

    try {
        const fn = firebase.functions().httpsCallable('adminGetTimeSeries');
        const result = await fn({ period });
        const stats = result.data.data || [];

        if (stats.length === 0) {
            container.innerHTML = '<p class="text-muted" style="text-align:center; padding: 40px 0;">No time-series data available yet. Data will appear after the daily aggregation runs.</p>';
            return;
        }

        // Restore canvas if replaced by message
        if (!document.getElementById('trend-chart')) {
            container.innerHTML = '<canvas id="trend-chart"></canvas>';
        }

        const labels = stats.map(s => {
            const d = new Date(s.date + 'T12:00:00');
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });
        const viewsData = stats.map(s => s.totalViews || 0);
        const ratingsData = stats.map(s => s.newRatings || 0);
        const commentsData = stats.map(s => s.newComments || 0);

        if (trendChartInstance) {
            trendChartInstance.destroy();
        }

        const ctx = document.getElementById('trend-chart').getContext('2d');
        trendChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Views',
                        data: viewsData,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59,130,246,0.1)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 3,
                    },
                    {
                        label: 'Ratings',
                        data: ratingsData,
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245,158,11,0.1)',
                        fill: false,
                        tension: 0.3,
                        pointRadius: 3,
                    },
                    {
                        label: 'Comments',
                        data: commentsData,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16,185,129,0.1)',
                        fill: false,
                        tension: 0.3,
                        pointRadius: 3,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } },
                    tooltip: { callbacks: { title: (items) => items[0]?.label || '' } }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true, ticks: { precision: 0 } }
                }
            }
        });
    } catch (error) {
        console.error('Time-series load error:', error);
        container.innerHTML = '<p class="text-muted" style="text-align:center; padding: 40px 0;">Failed to load trend data.</p>';
    }
}

// Expose globally
window.loadAnalytics = loadAnalytics;
window.refreshAnalytics = refreshAnalytics;
window.loadTimeSeries = loadTimeSeries;

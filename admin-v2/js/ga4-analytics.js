/**
 * SIAS Admin Dashboard — GA4 Site Traffic
 * Fetches Google Analytics 4 data via Cloud Function proxy.
 */

let ga4Loaded = false;
let ga4SessionsChart = null;
let ga4DevicesChart = null;
let ga4CurrentPeriod = '30';

/**
 * Main entry point — called by switchTab('traffic')
 */
async function loadGA4Analytics(period) {
    if (ga4Loaded && !period) return;

    const dateRange = period || ga4CurrentPeriod;
    ga4CurrentPeriod = dateRange;
    ga4Loaded = true;

    // Update period pills
    document.querySelectorAll('#ga4-period-pills .pill').forEach(p => {
        p.classList.toggle('active', p.dataset.period === dateRange);
    });

    // Show loading state on first load
    if (!period) {
        ['ga4-active-users', 'ga4-total-users', 'ga4-sessions', 'ga4-page-views', 'ga4-bounce-rate', 'ga4-avg-duration']
            .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '...'; });
    }

    try {
        const getGA4Report = firebase.functions().httpsCallable('adminGetGA4Report');

        // Single call fetches all reports server-side to avoid rate limits
        const result = await getGA4Report({ dateRange });
        const d = result.data;

        renderGA4Stats(d.realtime, d.overview);
        renderGA4SessionsChart(d.sessions);
        renderGA4TopPages(d.topPages);
        renderGA4Sources(d.sources);
        renderGA4DevicesChart(d.devices);
        renderGA4Geography(d.geography);

    } catch (error) {
        console.error('GA4 load error:', error);
        showToast('Failed to load GA4 data: ' + error.message, 'error');
    }
}

/**
 * Period pill click handler — forces reload with new date range
 */
function loadGA4Data(period) {
    ga4Loaded = false;
    loadGA4Analytics(period);
}

/**
 * Render the summary stat cards
 */
function renderGA4Stats(realtime, overview) {
    document.getElementById('ga4-active-users').textContent = realtime.activeUsers || '0';
    document.getElementById('ga4-total-users').textContent = (overview.totalUsers || 0).toLocaleString();
    document.getElementById('ga4-sessions').textContent = (overview.sessions || 0).toLocaleString();
    document.getElementById('ga4-page-views').textContent = (overview.pageViews || 0).toLocaleString();
    document.getElementById('ga4-bounce-rate').textContent = (overview.bounceRate || 0) + '%';

    const dur = overview.avgDuration || 0;
    const mins = Math.floor(dur / 60);
    const secs = dur % 60;
    document.getElementById('ga4-avg-duration').textContent = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

/**
 * Render sessions + users line chart
 */
function renderGA4SessionsChart(sessionsData) {
    const container = document.getElementById('ga4-chart-container');
    if (!container) return;

    if (!sessionsData || sessionsData.length === 0) {
        container.innerHTML = '<p class="text-muted" style="text-align:center; padding: 40px 0;">No session data available yet. Data appears 24–48 hours after installing the tracking snippet.</p>';
        return;
    }

    if (!document.getElementById('ga4-sessions-chart')) {
        container.innerHTML = '<canvas id="ga4-sessions-chart"></canvas>';
    }

    const labels = sessionsData.map(s => {
        const y = s.date.substring(0, 4);
        const m = s.date.substring(4, 6);
        const d = s.date.substring(6, 8);
        const dt = new Date(y, m - 1, d);
        return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    if (ga4SessionsChart) ga4SessionsChart.destroy();

    const ctx = document.getElementById('ga4-sessions-chart').getContext('2d');
    ga4SessionsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Sessions',
                    data: sessionsData.map(s => s.sessions),
                    borderColor: '#4f46e5',
                    backgroundColor: 'rgba(79,70,229,0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 3,
                },
                {
                    label: 'Users',
                    data: sessionsData.map(s => s.users),
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
            },
            scales: {
                x: { grid: { display: false } },
                y: { beginAtZero: true, ticks: { precision: 0 } }
            }
        }
    });
}

/**
 * Render top pages table
 */
function renderGA4TopPages(pages) {
    const tbody = document.getElementById('ga4-top-pages-body');
    if (!tbody) return;

    if (!pages || pages.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-muted">No page data yet</td></tr>';
        return;
    }

    tbody.innerHTML = pages.map(p => {
        const dur = p.avgDuration || 0;
        const mins = Math.floor(dur / 60);
        const secs = dur % 60;
        const durStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        const displayPage = p.page.length > 40 ? p.page.substring(0, 40) + '...' : p.page;
        return `<tr>
            <td title="${escapeHtml(p.page)}">${escapeHtml(displayPage)}</td>
            <td><strong>${p.views.toLocaleString()}</strong></td>
            <td>${durStr}</td>
        </tr>`;
    }).join('');
}

/**
 * Render traffic sources as horizontal bars (reuses .cost-bar-* CSS)
 */
function renderGA4Sources(sources) {
    const container = document.getElementById('ga4-sources-container');
    if (!container) return;

    if (!sources || sources.length === 0) {
        container.innerHTML = '<p class="text-muted">No source data yet</p>';
        return;
    }

    const maxSessions = Math.max(...sources.map(s => s.sessions), 1);
    const colors = {
        'Organic Search': '#10b981',
        'Direct': '#4f46e5',
        'Referral': '#f59e0b',
        'Organic Social': '#ec4899',
        'Paid Search': '#3b82f6',
        'Email': '#8b5cf6',
        'Unassigned': '#6b7280',
    };

    container.innerHTML = sources.map(s => {
        const pct = Math.round((s.sessions / maxSessions) * 100);
        const color = colors[s.source] || '#6b7280';
        return `
            <div class="cost-bar-row">
                <div class="cost-bar-label">
                    <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${color}; margin-right: 6px;"></span>
                    ${escapeHtml(s.source)}
                </div>
                <div class="cost-bar-track">
                    <div class="cost-bar-fill" style="width: ${pct}%; background: ${color};"></div>
                </div>
                <div class="cost-bar-value">${s.sessions.toLocaleString()}</div>
            </div>
        `;
    }).join('');
}

/**
 * Render devices as a doughnut chart
 */
function renderGA4DevicesChart(devices) {
    const container = document.getElementById('ga4-devices-chart-container');
    if (!container) return;

    if (!devices || devices.length === 0) {
        container.innerHTML = '<p class="text-muted" style="text-align:center; padding: 40px 0;">No device data yet</p>';
        return;
    }

    if (!document.getElementById('ga4-devices-chart')) {
        container.innerHTML = '<canvas id="ga4-devices-chart"></canvas>';
    }

    if (ga4DevicesChart) ga4DevicesChart.destroy();

    const deviceColors = { desktop: '#4f46e5', mobile: '#10b981', tablet: '#f59e0b' };
    const ctx = document.getElementById('ga4-devices-chart').getContext('2d');
    ga4DevicesChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: devices.map(d => d.device.charAt(0).toUpperCase() + d.device.slice(1)),
            datasets: [{
                data: devices.map(d => d.sessions),
                backgroundColor: devices.map(d => deviceColors[d.device] || '#6b7280'),
                borderWidth: 2,
                borderColor: '#ffffff',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }
            }
        }
    });
}

/**
 * Render geography table
 */
function renderGA4Geography(countries) {
    const tbody = document.getElementById('ga4-geography-body');
    if (!tbody) return;

    if (!countries || countries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-muted">No geographic data yet</td></tr>';
        return;
    }

    tbody.innerHTML = countries.map(c => `<tr>
        <td>${escapeHtml(c.country)}</td>
        <td><strong>${c.sessions.toLocaleString()}</strong></td>
        <td>${c.users.toLocaleString()}</td>
    </tr>`).join('');
}

// Expose globally
window.loadGA4Analytics = loadGA4Analytics;
window.loadGA4Data = loadGA4Data;

/**
 * SIAS Admin Dashboard — Health Checks
 * Displays automated health check results in the Overview tab.
 */

let healthCheckRunning = false;

/**
 * Load the latest health check result from Firestore.
 */
async function loadHealthStatus() {
    const container = document.getElementById('health-check-content');
    if (!container) return;

    try {
        const snap = await db.collection('healthChecks')
            .orderBy('timestamp', 'desc')
            .limit(5)
            .get();

        if (snap.empty) {
            container.innerHTML = `
                <p class="text-muted" style="font-size: 0.85rem;">
                    No health check results yet. Click "Run Check" to run the first check.
                </p>
            `;
            return;
        }

        const docs = [];
        snap.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));

        renderHealthPanel(docs[0], container);

        if (docs.length > 1) {
            renderHealthHistory(docs, container);
        }
    } catch (error) {
        console.error('Health status load error:', error);
        container.innerHTML = '<p class="text-muted" style="font-size: 0.85rem;">Failed to load health status.</p>';
    }
}

/**
 * Render the main health check panel from the latest result.
 */
function renderHealthPanel(result, container) {
    const ts = result.timestamp?.toDate ? result.timestamp.toDate() : new Date(result.timestamp || 0);
    const ago = timeAgo(ts.toISOString());
    const checks = result.checks || [];
    const statusColors = { pass: 'var(--success)', warn: '#f59e0b', fail: 'var(--danger)' };
    const statusIcons = { pass: '\u2705', warn: '\u26a0\ufe0f', fail: '\u274c' };

    const overallColor = statusColors[result.overallStatus] || 'var(--text-muted)';
    const overallLabel = result.overallStatus === 'pass' ? 'All Clear'
        : result.overallStatus === 'warn' ? 'Warnings' : 'Issues Found';

    let html = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
            <div style="width: 10px; height: 10px; border-radius: 50%; background: ${overallColor};"></div>
            <strong style="font-size: 0.9rem;">${overallLabel}</strong>
            <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: auto;">${ago} (${result.duration}ms)</span>
        </div>
    `;

    html += '<div class="health-checks-list">';
    for (const check of checks) {
        const icon = statusIcons[check.status] || '';
        const hasDetails = check.details && check.details.length > 0;
        const detailsId = 'health-detail-' + check.name.replace(/\s+/g, '-').toLowerCase();

        html += `
            <div class="health-check-item health-status-${check.status}">
                <span class="health-check-icon">${icon}</span>
                <span class="health-check-name">${escapeHtml(check.name)}</span>
                <span class="health-check-message">${escapeHtml(check.message)}</span>
                ${hasDetails ? `<button class="health-toggle-btn" onclick="toggleHealthDetails('${detailsId}')" title="Show details">&#9660;</button>` : ''}
            </div>
            ${hasDetails ? `<div id="${detailsId}" class="health-details" style="display: none;">${check.details.map(d => `<div class="health-detail-line">${escapeHtml(d)}</div>`).join('')}</div>` : ''}
        `;
    }
    html += '</div>';

    container.innerHTML = html;
}

/**
 * Render mini status history dots below the main panel.
 */
function renderHealthHistory(docs, container) {
    let html = '<div style="display: flex; align-items: center; gap: 6px; margin-top: 8px;">';
    html += '<span style="font-size: 0.7rem; color: var(--text-muted);">Recent:</span>';

    const statusColors = { pass: 'var(--success)', warn: '#f59e0b', fail: 'var(--danger)' };

    for (let i = 0; i < Math.min(docs.length, 5); i++) {
        const d = docs[i];
        const color = statusColors[d.overallStatus] || '#ccc';
        const ts = d.timestamp?.toDate ? d.timestamp.toDate() : new Date(0);
        const title = `${d.overallStatus} — ${ts.toLocaleString()}`;
        html += `<div style="width: 8px; height: 8px; border-radius: 50%; background: ${color};" title="${escapeHtml(title)}"></div>`;
    }

    html += '</div>';
    container.insertAdjacentHTML('beforeend', html);
}

/**
 * Toggle visibility of health check detail lines.
 */
function toggleHealthDetails(detailsId) {
    const el = document.getElementById(detailsId);
    if (!el) return;
    const isHidden = el.style.display === 'none';
    el.style.display = isHidden ? 'block' : 'none';
    // Toggle arrow direction on button
    const btn = el.previousElementSibling.querySelector('.health-toggle-btn');
    if (btn) btn.innerHTML = isHidden ? '&#9650;' : '&#9660;';
}

/**
 * Run health check on-demand via Cloud Function.
 */
async function runHealthCheckNow() {
    if (healthCheckRunning) return;
    healthCheckRunning = true;

    const btn = document.getElementById('run-health-check-btn');
    const container = document.getElementById('health-check-content');

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Running...';
    }

    try {
        const fn = firebase.functions().httpsCallable('adminRunHealthCheck');
        const result = await fn({});
        const data = result.data;

        showToast(`Health check: ${data.overallStatus} (${data.duration}ms)`,
            data.overallStatus === 'pass' ? 'success' : data.overallStatus === 'warn' ? 'warning' : 'error');

        // Re-render with fresh data (re-load from Firestore to get timestamp)
        await loadHealthStatus();
    } catch (error) {
        console.error('Health check error:', error);
        showToast('Health check failed: ' + error.message, 'error');
    } finally {
        healthCheckRunning = false;
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Run Check';
        }
    }
}

// Expose globally
window.loadHealthStatus = loadHealthStatus;
window.runHealthCheckNow = runHealthCheckNow;
window.toggleHealthDetails = toggleHealthDetails;

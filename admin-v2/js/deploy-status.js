/**
 * SIAS Admin Dashboard — Deploy Status Widget
 * Polls GitHub Actions deploy status via Cloud Function proxy.
 */

// State
let deployRuns = [];
let deployPollTimer = null;
let deployTickTimer = null;
let deployPanelOpen = false;
const DEPLOY_POLL_ACTIVE = 15000;   // 15s when deploying
const DEPLOY_POLL_IDLE = 120000;    // 2min when idle
const DEPLOY_STORAGE_KEY = 'sias-deploy-status';

/**
 * Initialize deploy status monitoring
 */
function initDeployStatus() {
    loadCachedDeployStatus();
    renderDeployBadge();
    fetchDeployStatus();
    startDeployPolling(DEPLOY_POLL_IDLE);
    startDeployTicker();

    // Click-outside handler to close detail panel
    document.addEventListener('click', function(e) {
        if (!deployPanelOpen) return;
        const wrapper = document.querySelector('.deploy-status-wrapper');
        if (wrapper && !wrapper.contains(e.target)) {
            deployPanelOpen = false;
            const panel = document.getElementById('deploy-detail-panel');
            if (panel) panel.classList.add('hidden');
        }
    });
}

/**
 * Fetch deploy status from Cloud Function
 */
async function fetchDeployStatus() {
    try {
        const fn = firebase.functions().httpsCallable('adminGetDeployStatus');
        const result = await fn();
        const newRuns = result.data.runs || [];

        checkDeployTransitions(newRuns);

        deployRuns = newRuns;
        saveCachedDeployStatus();
        renderDeployBadge();
        renderDeployOverview();
        adjustPollRate();
    } catch (error) {
        console.error('Deploy status fetch error:', error);
    }
}

/**
 * Start polling at given interval
 */
function startDeployPolling(interval) {
    if (deployPollTimer) clearInterval(deployPollTimer);
    deployPollTimer = setInterval(fetchDeployStatus, interval);
}

/**
 * Adjust poll rate based on whether a deploy is active
 */
function adjustPollRate() {
    const isActive = deployRuns.some(r => r.status === 'in_progress' || r.status === 'queued');
    const interval = isActive ? DEPLOY_POLL_ACTIVE : DEPLOY_POLL_IDLE;
    startDeployPolling(interval);
}

/**
 * Tick elapsed time every second for active deploys (no API calls)
 */
function startDeployTicker() {
    if (deployTickTimer) clearInterval(deployTickTimer);
    deployTickTimer = setInterval(() => {
        if (deployRuns.length === 0) return;
        const latest = deployRuns[0];
        if (latest.status === 'in_progress' || latest.status === 'queued') {
            renderDeployBadge();
        }
    }, 1000);
}

/**
 * Render the compact header badge
 */
function renderDeployBadge() {
    const container = document.getElementById('deploy-status-badge');
    if (!container || deployRuns.length === 0) return;

    const latest = deployRuns[0];
    let icon, label, badgeClass;

    if (latest.status === 'in_progress') {
        icon = '⏳';
        label = 'Deploying';
        badgeClass = 'deploy-badge-active';
    } else if (latest.status === 'queued') {
        icon = '⏳';
        label = 'Queued';
        badgeClass = 'deploy-badge-queued';
    } else if (latest.conclusion === 'success') {
        icon = '✅';
        label = 'Deployed';
        badgeClass = 'deploy-badge-success';
    } else if (latest.conclusion === 'failure') {
        icon = '❌';
        label = 'Failed';
        badgeClass = 'deploy-badge-failed';
    } else if (latest.conclusion === 'cancelled') {
        icon = '⚠️';
        label = 'Cancelled';
        badgeClass = 'deploy-badge-cancelled';
    } else {
        icon = 'ℹ️';
        label = latest.status || 'Unknown';
        badgeClass = 'deploy-badge-neutral';
    }

    // Time display
    let timeStr = '';
    if (latest.status === 'in_progress' || latest.status === 'queued') {
        const diffSec = Math.floor((Date.now() - new Date(latest.createdAt).getTime()) / 1000);
        const mins = Math.floor(diffSec / 60);
        const secs = diffSec % 60;
        timeStr = ` ${mins}:${String(secs).padStart(2, '0')}`;
    } else if (latest.updatedAt) {
        timeStr = ' ' + timeAgo(latest.updatedAt);
    }

    const pulseClass = (latest.status === 'in_progress' || latest.status === 'queued') ? ' deploy-pulse' : '';

    container.innerHTML = `
        <div class="deploy-badge ${badgeClass}${pulseClass}" onclick="toggleDeployDetail(event)" title="Deploy Status">
            <span class="deploy-badge-icon">${icon}</span>
            <span class="deploy-badge-label">${label}${timeStr}</span>
        </div>
    `;
}

/**
 * Toggle the detail dropdown panel
 */
function toggleDeployDetail(e) {
    if (e) e.stopPropagation();
    const panel = document.getElementById('deploy-detail-panel');
    if (!panel) return;
    deployPanelOpen = !deployPanelOpen;
    panel.classList.toggle('hidden', !deployPanelOpen);
    if (deployPanelOpen) renderDeployDetail();
}

/**
 * Render the detail dropdown with recent runs
 */
function renderDeployDetail() {
    const panel = document.getElementById('deploy-detail-panel');
    if (!panel || deployRuns.length === 0) return;

    const runsHtml = deployRuns.map(run => {
        let icon;
        if (run.status === 'in_progress') icon = '🔄';
        else if (run.status === 'queued') icon = '⏳';
        else if (run.conclusion === 'success') icon = '✅';
        else if (run.conclusion === 'failure') icon = '❌';
        else if (run.conclusion === 'cancelled') icon = '⚠️';
        else icon = '⏺️';

        const commitMsg = (run.commitMessage || '').split('\n')[0];
        const shortCommit = commitMsg.length > 50 ? commitMsg.substring(0, 50) + '...' : commitMsg;
        const time = run.status === 'completed' ? timeAgo(run.updatedAt) : timeAgo(run.createdAt);

        return `
            <div class="deploy-run-item">
                <span class="deploy-run-icon">${icon}</span>
                <div class="deploy-run-body">
                    <div class="deploy-run-commit">${escapeHtml(shortCommit)}</div>
                    <div class="deploy-run-meta">#${run.runNumber} · ${time}</div>
                </div>
                <div class="deploy-run-link">
                    <a href="${run.htmlUrl}" target="_blank" rel="noopener">Logs ↗</a>
                </div>
            </div>
        `;
    }).join('');

    panel.innerHTML = `
        <div class="deploy-detail-header">
            <h3>Deploy History</h3>
            <button class="btn btn-small btn-outline" onclick="fetchDeployStatus()">Refresh</button>
        </div>
        ${runsHtml}
    `;
}

/**
 * Render deploy info in the Overview tab System Health card
 */
function renderDeployOverview() {
    const container = document.getElementById('deploy-overview-content');
    if (!container || deployRuns.length === 0) return;

    const latest = deployRuns[0];
    let statusHtml;

    if (latest.status === 'in_progress') {
        statusHtml = '<span class="badge badge-processing">Deploying</span>';
    } else if (latest.status === 'queued') {
        statusHtml = '<span class="badge badge-pending">Queued</span>';
    } else if (latest.conclusion === 'success') {
        statusHtml = '<span class="badge badge-success">Deployed</span>';
    } else if (latest.conclusion === 'failure') {
        statusHtml = '<span class="badge badge-danger">Failed</span>';
    } else {
        statusHtml = '<span class="badge badge-neutral">' + (latest.conclusion || latest.status) + '</span>';
    }

    const commitMsg = (latest.commitMessage || '').split('\n')[0];
    const shortCommit = commitMsg.length > 60 ? commitMsg.substring(0, 60) + '...' : commitMsg;
    const time = latest.status === 'completed' ? timeAgo(latest.updatedAt) : timeAgo(latest.createdAt);

    container.innerHTML = `
        <div style="font-size: 0.85rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <strong>Last Deploy</strong>
                ${statusHtml}
            </div>
            <div class="text-muted" style="font-size: 0.8rem;">${escapeHtml(shortCommit)}</div>
            <div class="text-muted" style="font-size: 0.78rem; margin-top: 2px;">${time} · <a href="${latest.htmlUrl}" target="_blank" rel="noopener" style="color: var(--primary);">View logs ↗</a></div>
        </div>
    `;
}

/**
 * Check for deploy state transitions and fire notifications
 */
function checkDeployTransitions(newRuns) {
    if (deployRuns.length === 0 || newRuns.length === 0) return;

    const oldLatest = deployRuns[0];
    const newLatest = newRuns[0];
    if (!oldLatest || !newLatest || oldLatest.id !== newLatest.id) return;

    // Was in_progress, now completed
    if (oldLatest.status === 'in_progress' && newLatest.status === 'completed') {
        const commitMsg = (newLatest.commitMessage || '').split('\n')[0];
        if (newLatest.conclusion === 'success') {
            if (typeof addNotification === 'function') {
                addNotification({
                    id: 'deploy-success-' + newLatest.id,
                    type: 'queue-completed',
                    title: 'Deploy Succeeded',
                    message: '#' + newLatest.runNumber + ': ' + commitMsg,
                    actionTab: 'overview',
                    fireToast: true
                });
            }
        } else if (newLatest.conclusion === 'failure') {
            if (typeof addNotification === 'function') {
                addNotification({
                    id: 'deploy-failed-' + newLatest.id,
                    type: 'queue-failed',
                    title: 'Deploy Failed',
                    message: '#' + newLatest.runNumber + ': ' + commitMsg,
                    actionTab: 'overview',
                    fireToast: true
                });
            }
        }
    }
}

/**
 * Cache helpers
 */
function loadCachedDeployStatus() {
    try {
        const cached = localStorage.getItem(DEPLOY_STORAGE_KEY);
        if (cached) deployRuns = JSON.parse(cached);
    } catch (e) {}
}

function saveCachedDeployStatus() {
    try {
        localStorage.setItem(DEPLOY_STORAGE_KEY, JSON.stringify(deployRuns));
    } catch (e) {}
}

// Expose globally
window.initDeployStatus = initDeployStatus;
window.fetchDeployStatus = fetchDeployStatus;
window.toggleDeployDetail = toggleDeployDetail;

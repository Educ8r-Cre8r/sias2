/**
 * SIAS Admin Dashboard — Orphaned File Detector
 * Compares expected files against actual Firebase Storage to find orphaned/missing files.
 */

let orphanScanRunning = false;

/**
 * Run the orphan detection scan via Cloud Function
 */
async function runOrphanDetection() {
    if (orphanScanRunning) {
        showToast('Scan already in progress', 'info');
        return;
    }

    const images = metadataManager.getImages();
    if (!images || images.length === 0) {
        showToast('No image data available', 'warning');
        return;
    }

    orphanScanRunning = true;
    const btn = document.getElementById('run-orphan-scan-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Scanning...';
    }

    const container = document.getElementById('orphan-results-container');
    container.innerHTML = `
        <div style="text-align: center; padding: 30px;">
            <div class="spinner"></div>
            <p class="text-muted" style="margin-top: 12px;">Scanning Firebase Storage... This may take a moment.</p>
        </div>
    `;

    try {
        // Send image data to the Cloud Function
        const imageData = images.map(img => ({
            id: img.id,
            filename: img.filename,
            category: img.category,
            title: img.title || img.filename
        }));

        const auditFn = firebase.functions().httpsCallable('adminAuditStorage');
        const result = await auditFn({ images: imageData });
        renderOrphanResults(result.data);
    } catch (error) {
        console.error('Orphan detection error:', error);
        container.innerHTML = `<p class="text-muted" style="color: var(--danger);">Scan failed: ${escapeHtml(error.message)}</p>`;
        showToast('Storage scan failed: ' + error.message, 'error');
    } finally {
        orphanScanRunning = false;
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Scan Storage';
        }
    }
}

/**
 * Render the orphan detection results
 */
function renderOrphanResults(data) {
    const container = document.getElementById('orphan-results-container');
    if (!container) return;

    const { orphaned = [], missing = [], totalExpected = 0, totalActual = 0, orphanedCount = 0, missingCount = 0, orphanedSize = 0 } = data;

    // Format size
    const formatSize = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    // Stats row
    const healthColor = orphanedCount === 0 && missingCount === 0 ? 'var(--success)' :
        missingCount > 0 ? 'var(--danger)' : 'var(--warning)';

    let html = `
        <div class="stats-row" style="margin-bottom: 16px;">
            <div class="stat-card">
                <div class="stat-value">${totalExpected.toLocaleString()}</div>
                <div class="stat-label">Expected Files</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${totalActual.toLocaleString()}</div>
                <div class="stat-label">Actual Files</div>
            </div>
            <div class="stat-card" style="${orphanedCount > 0 ? 'border-color: var(--warning);' : ''}">
                <div class="stat-value" style="${orphanedCount > 0 ? 'color: var(--warning);' : ''}">${orphanedCount}</div>
                <div class="stat-label">Orphaned</div>
            </div>
            <div class="stat-card" style="${missingCount > 0 ? 'border-color: var(--danger);' : ''}">
                <div class="stat-value" style="${missingCount > 0 ? 'color: var(--danger);' : ''}">${missingCount}</div>
                <div class="stat-label">Missing</div>
            </div>
        </div>
    `;

    // Summary line
    if (orphanedCount === 0 && missingCount === 0) {
        html += `<p style="color: var(--success); font-weight: 600;">✓ All files accounted for. No orphans or missing files detected.</p>`;
    } else {
        if (orphanedCount > 0) {
            html += `<p style="color: var(--warning); font-weight: 500;">⚠ ${orphanedCount} orphaned file(s) found (${formatSize(orphanedSize)} total)</p>`;
        }
        if (missingCount > 0) {
            html += `<p style="color: var(--danger); font-weight: 500;">✗ ${missingCount} expected file(s) missing from Storage</p>`;
        }
    }

    // Orphaned files list
    if (orphanedCount > 0) {
        html += `
            <details style="margin-top: 12px; margin-bottom: 8px;">
                <summary style="cursor: pointer; font-weight: 600; font-size: 0.9rem; color: var(--warning);">
                    Orphaned Files (${orphanedCount}) — not referenced by any image
                </summary>
                <ul class="audit-file-list" style="margin-top: 8px; max-height: 300px; overflow-y: auto;">
                    ${orphaned.map(f => `<li class="missing" style="font-size: 0.8rem; padding: 4px 0;">${escapeHtml(f.name || f)} ${f.size ? '<span class="text-muted">(' + formatSize(f.size) + ')</span>' : ''}</li>`).join('')}
                </ul>
            </details>
        `;
    }

    // Missing files list
    if (missingCount > 0) {
        html += `
            <details style="margin-top: 8px;">
                <summary style="cursor: pointer; font-weight: 600; font-size: 0.9rem; color: var(--danger);">
                    Missing Files (${missingCount}) — expected but not in Storage
                </summary>
                <ul class="audit-file-list" style="margin-top: 8px; max-height: 300px; overflow-y: auto;">
                    ${missing.map(f => `<li class="missing" style="font-size: 0.8rem; padding: 4px 0;">${escapeHtml(f)}</li>`).join('')}
                </ul>
            </details>
        `;
    }

    container.innerHTML = html;
}

// Expose globally
window.runOrphanDetection = runOrphanDetection;

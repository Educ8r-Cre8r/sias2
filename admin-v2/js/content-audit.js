/**
 * SIAS Admin Dashboard — Content Audit
 * Checks file completeness for each image.
 */

let auditFilter = 'all';
let deferredAuditItems = []; // stored for lazy accordion rendering

/**
 * Render the content audit tab
 */
function renderContentAudit() {
    const images = metadataManager.getImages();
    const auditResults = images.map(img => auditImage(img));

    const complete = auditResults.filter(r => r.status === 'complete').length;
    const partial = auditResults.filter(r => r.status === 'partial').length;
    const missing = auditResults.filter(r => r.status === 'missing').length;

    document.getElementById('audit-complete').textContent = complete;
    document.getElementById('audit-partial').textContent = partial;
    document.getElementById('audit-missing').textContent = missing;

    renderAuditList(auditResults);
}

/**
 * Audit a single image for content completeness
 * Since we can't check file existence from the frontend,
 * we check what metadata indicates should exist.
 */
function auditImage(image) {
    const checks = [];

    // Check image paths in metadata
    checks.push({
        name: 'Original image',
        field: 'imagePath',
        present: !!image.imagePath
    });
    checks.push({
        name: 'Thumbnail',
        field: 'thumbPath',
        present: !!image.thumbPath
    });
    checks.push({
        name: 'WebP variant',
        field: 'webpPath',
        present: !!image.webpPath
    });
    checks.push({
        name: 'Placeholder',
        field: 'placeholderPath',
        present: !!image.placeholderPath
    });

    // Check content
    checks.push({
        name: 'Content file',
        field: 'contentFile',
        present: !!image.contentFile && image.hasContent
    });

    // Check keywords
    checks.push({
        name: 'Keywords',
        field: 'keywords',
        present: !!(image.keywords && image.keywords.length > 0)
    });

    // Check NGSS standards
    checks.push({
        name: 'NGSS Standards',
        field: 'ngssStandards',
        present: !!(image.ngssStandards && Object.keys(image.ngssStandards).length > 0)
    });

    // Check processing data
    checks.push({
        name: 'Processing cost',
        field: 'processingCost',
        present: image.processingCost !== undefined && image.processingCost !== null
    });

    const presentCount = checks.filter(c => c.present).length;
    const totalChecks = checks.length;
    const score = Math.round((presentCount / totalChecks) * 100);

    let status;
    if (score === 100) status = 'complete';
    else if (score >= 60) status = 'partial';
    else status = 'missing';

    return {
        image,
        checks,
        presentCount,
        totalChecks,
        score,
        status
    };
}

/**
 * Render a single audit item row
 */
function renderAuditItem(result) {
    const { image, checks, presentCount, totalChecks, score, status } = result;

    const checksHtml = checks.map(c => `
        <li class="${c.present ? 'found' : 'missing'}">
            ${escapeHtml(c.name)}
        </li>
    `).join('');

    return `
        <div class="audit-item" onclick="this.classList.toggle('expanded')">
            <div class="audit-item-header">
                <div class="audit-status-dot ${status}"></div>
                <div class="audit-item-title">${escapeHtml(image.title || image.filename)}</div>
                <span class="badge ${getCategoryBadgeClass(image.category)}">${getCategoryName(image.category)}</span>
                <div class="audit-item-score">${presentCount}/${totalChecks} (${score}%)</div>
                <div class="audit-item-toggle">&#9662;</div>
            </div>
            <div class="audit-item-details">
                <ul class="audit-file-list">
                    ${checksHtml}
                </ul>
            </div>
        </div>
    `;
}

/**
 * Render the audit list — newest first, 12 visible, rest in accordion
 */
function renderAuditList(results) {
    const container = document.getElementById('audit-list');
    if (!container) return;

    const filtered = auditFilter === 'all'
        ? results
        : results.filter(r => r.status === auditFilter);

    if (filtered.length === 0) {
        container.innerHTML = '<p class="text-muted">No images match the current filter.</p>';
        return;
    }

    // Sort newest first (highest id = most recently added)
    const sorted = [...filtered].sort((a, b) => b.image.id - a.image.id);

    const VISIBLE_COUNT = 12;
    const visible = sorted.slice(0, VISIBLE_COUNT);
    const remaining = sorted.slice(VISIBLE_COUNT);

    // Store remaining items for deferred rendering on accordion expand
    deferredAuditItems = remaining;

    let html = visible.map(renderAuditItem).join('');

    if (remaining.length > 0) {
        html += `
            <div class="ngss-accordion" style="margin-top: 12px;">
                <button class="ngss-accordion-header" onclick="expandAuditAccordion(this)">
                    <span class="ngss-accordion-arrow">&#9654;</span>
                    <span class="ngss-accordion-title">Show All</span>
                    <span class="ngss-accordion-badge">${remaining.length} more</span>
                </button>
                <div class="ngss-accordion-body">
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}

/**
 * Expand audit accordion — renders deferred items on first open
 */
function expandAuditAccordion(btn) {
    const accordion = btn.parentElement;
    const body = accordion.querySelector('.ngss-accordion-body');

    // Render deferred items on first expand
    if (body && body.children.length === 0 && deferredAuditItems.length > 0) {
        body.innerHTML = deferredAuditItems.map(renderAuditItem).join('');
    }

    accordion.classList.toggle('open');
}

/**
 * Filter audit results
 */
function filterAudit(filter) {
    auditFilter = filter;

    // Update active pill
    document.querySelectorAll('#tab-audit .pill').forEach(pill => {
        pill.classList.toggle('active', pill.dataset.audit === filter);
    });

    renderContentAudit();
}

/**
 * Export audit results to CSV
 */
function exportAuditCSV() {
    const images = metadataManager.getImages();
    const results = images.map(img => auditImage(img));
    const header = 'ID,Title,Category,Status,Score,Present,Total,Missing Items\n';
    const rows = results.map(r => {
        const missing = r.checks.filter(c => !c.present).map(c => c.name).join('; ');
        return `${r.image.id},"${(r.image.title || r.image.filename).replace(/"/g, '""')}",${r.image.category},${r.status},${r.score}%,${r.presentCount},${r.totalChecks},"${missing}"`;
    }).join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sias-content-audit-' + new Date().toISOString().split('T')[0] + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Audit CSV exported', 'success');
}

// Expose globally
window.renderContentAudit = renderContentAudit;
window.filterAudit = filterAudit;
window.exportAuditCSV = exportAuditCSV;
window.expandAuditAccordion = expandAuditAccordion;

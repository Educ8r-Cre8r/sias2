/**
 * SIAS Admin Dashboard — NGSS Coverage Map
 * Visual grid showing standards coverage from ngss-index.json.
 */

let ngssData = null;
let ngssLoaded = false;

async function loadNgssCoverage() {
    if (ngssLoaded) return;

    const container = document.getElementById('ngss-coverage-container');
    if (!container) return;

    try {
        const response = await fetch('../ngss-index.json?t=' + Date.now());
        if (!response.ok) throw new Error('Failed to fetch ngss-index.json');
        ngssData = await response.json();
        ngssLoaded = true;
        renderNgssCoverage();
    } catch (error) {
        console.error('NGSS load error:', error);
        container.innerHTML = '<p class="text-muted">Failed to load NGSS data.</p>';
    }
}

function renderNgssCoverage() {
    if (!ngssData) return;

    const container = document.getElementById('ngss-coverage-container');
    if (!container) return;

    const images = metadataManager.getImages();
    const totalImages = images.length;

    const peEntries = Object.entries(ngssData.performanceExpectations || {});
    const dciEntries = Object.entries(ngssData.disciplinaryCoreIdeas || {});
    const cccEntries = Object.entries(ngssData.crosscuttingConcepts || {});

    // Summary stats
    const totalStandards = peEntries.length + dciEntries.length + cccEntries.length;
    const allCounts = [...peEntries, ...dciEntries, ...cccEntries].map(([, ids]) => ids.length);
    const avgCoverage = allCounts.length > 0 ? (allCounts.reduce((a, b) => a + b, 0) / allCounts.length).toFixed(1) : 0;

    let html = `
        <div class="ngss-summary">
            <span><strong>${totalStandards}</strong> standards tracked</span>
            <span><strong>${avgCoverage}</strong> avg images/standard</span>
            <span><strong>${totalImages}</strong> total images</span>
        </div>
        <div class="ngss-legend">
            <span class="ngss-legend-item"><span class="ngss-dot good"></span> 5+ images</span>
            <span class="ngss-legend-item"><span class="ngss-dot sparse"></span> 1–4 images</span>
            <span class="ngss-legend-item"><span class="ngss-dot gap"></span> 0 images</span>
        </div>
    `;

    html += renderNgssSection('Performance Expectations', peEntries, images);
    html += renderNgssSection('Disciplinary Core Ideas', dciEntries, images);
    html += renderNgssSection('Crosscutting Concepts', cccEntries, images);

    container.innerHTML = html;
}

function renderNgssSection(title, entries, images) {
    if (entries.length === 0) return '';

    const sorted = [...entries].sort((a, b) => b[1].length - a[1].length);

    let html = `<div class="ngss-section">`;
    html += `<h3>${escapeHtml(title)} (${entries.length})</h3>`;
    html += `<div class="ngss-grid">`;

    for (const [standard, imageIds] of sorted) {
        const count = imageIds.length;
        const level = count >= 5 ? 'good' : count >= 1 ? 'sparse' : 'gap';

        html += `<div class="ngss-cell ${level}" onclick="this.classList.toggle('expanded')">`;
        html += `<div class="ngss-cell-header">`;
        html += `<span class="ngss-cell-name">${escapeHtml(standard)}</span>`;
        html += `<span class="ngss-cell-count">${count}</span>`;
        html += `</div>`;
        html += `<div class="ngss-cell-detail">`;

        const shown = imageIds.slice(0, 8);
        for (const id of shown) {
            const img = images.find(i => i.id === id);
            const name = img ? escapeHtml(img.title || img.filename) : `#${id}`;
            const cat = img ? getCategoryName(img.category) : '';
            html += `<div class="ngss-cell-image">${name} <span class="text-muted">${cat}</span></div>`;
        }
        if (imageIds.length > 8) {
            html += `<div class="ngss-cell-image text-muted">...and ${imageIds.length - 8} more</div>`;
        }

        html += `</div></div>`;
    }

    html += `</div></div>`;
    return html;
}

function refreshNgssCoverage() {
    ngssLoaded = false;
    loadNgssCoverage();
}

// Expose globally
window.loadNgssCoverage = loadNgssCoverage;
window.refreshNgssCoverage = refreshNgssCoverage;

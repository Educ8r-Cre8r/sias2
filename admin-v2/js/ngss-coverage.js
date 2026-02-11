/**
 * SIAS Admin Dashboard — NGSS Gap Analysis & Coverage Map
 * Compares gallery coverage against all 78 official K-5 NGSS Performance Expectations.
 */

// ── Complete K-5 NGSS Performance Expectations (78 total) ──────────────
const NGSS_K5_STANDARDS = {
    'Physical Science': [
        'K-PS2-1', 'K-PS2-2', 'K-PS3-1', 'K-PS3-2',
        '1-PS4-1', '1-PS4-2', '1-PS4-3', '1-PS4-4',
        '2-PS1-1', '2-PS1-2', '2-PS1-3', '2-PS1-4',
        '3-PS2-1', '3-PS2-2', '3-PS2-3', '3-PS2-4',
        '4-PS3-1', '4-PS3-2', '4-PS3-3', '4-PS3-4', '4-PS4-1', '4-PS4-2', '4-PS4-3',
        '5-PS1-1', '5-PS1-2', '5-PS1-3', '5-PS1-4', '5-PS2-1', '5-PS3-1'
    ],
    'Life Science': [
        'K-LS1-1',
        '1-LS1-1', '1-LS1-2', '1-LS3-1',
        '2-LS2-1', '2-LS2-2', '2-LS4-1',
        '3-LS1-1', '3-LS2-1', '3-LS3-1', '3-LS3-2', '3-LS4-1', '3-LS4-2', '3-LS4-3', '3-LS4-4',
        '4-LS1-1', '4-LS1-2',
        '5-LS1-1', '5-LS2-1'
    ],
    'Earth & Space Science': [
        'K-ESS2-1', 'K-ESS2-2', 'K-ESS3-1', 'K-ESS3-2', 'K-ESS3-3',
        '1-ESS1-1', '1-ESS1-2',
        '2-ESS1-1', '2-ESS2-1', '2-ESS2-2', '2-ESS2-3',
        '3-ESS2-1', '3-ESS2-2', '3-ESS3-1',
        '4-ESS1-1', '4-ESS2-1', '4-ESS2-2', '4-ESS3-1', '4-ESS3-2',
        '5-ESS1-1', '5-ESS1-2', '5-ESS2-1', '5-ESS2-2', '5-ESS3-1'
    ],
    'Engineering': [
        '2-ETS1-1', '2-ETS1-2', '2-ETS1-3',
        '5-ETS1-1', '5-ETS1-2', '5-ETS1-3'
    ]
};

const TOTAL_K5_STANDARDS = Object.values(NGSS_K5_STANDARDS).flat().length; // 78

const DISCIPLINE_CSS = {
    'Physical Science': 'physical',
    'Life Science': 'life',
    'Earth & Space Science': 'earth',
    'Engineering': 'engineering'
};

const DISCIPLINE_GALLERY_CAT = {
    'Physical Science': 'physical-science',
    'Life Science': 'life-science',
    'Earth & Space Science': 'earth-space-science',
    'Engineering': null
};

// ── State ──────────────────────────────────────────────────────────────
let ngssData = null;
let ngssLoaded = false;

// ── Load & Refresh ─────────────────────────────────────────────────────
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

function refreshNgssCoverage() {
    ngssLoaded = false;
    loadNgssCoverage();
}

// ── Helpers ────────────────────────────────────────────────────────────
function getGradeLevel(pe) {
    return pe.charAt(0) === 'K' ? 'K' : pe.charAt(0);
}

function buildCoverageMap(peData) {
    const map = {};
    for (const [discipline, standards] of Object.entries(NGSS_K5_STANDARDS)) {
        for (const pe of standards) {
            const imageIds = peData[pe] || [];
            map[pe] = {
                discipline,
                count: imageIds.length,
                imageIds,
                gradeLevel: getGradeLevel(pe)
            };
        }
    }
    return map;
}

function computeGapStats(coverageMap, totalImages) {
    let covered = 0;
    let gaps = 0;
    let totalTaggings = 0;

    for (const data of Object.values(coverageMap)) {
        if (data.count > 0) covered++;
        else gaps++;
        totalTaggings += data.count;
    }

    const coveragePct = ((covered / TOTAL_K5_STANDARDS) * 100).toFixed(1);
    const avgPerStandard = covered > 0 ? (totalTaggings / covered).toFixed(1) : '0';
    const idealPerStandard = (totalImages / TOTAL_K5_STANDARDS).toFixed(1);

    return { covered, gaps, coveragePct, avgPerStandard, idealPerStandard, totalImages };
}

// ── Render: Summary Stats ──────────────────────────────────────────────
function renderGapSummaryStats(stats) {
    const coverageClass = stats.coveragePct >= 75 ? 'coverage-high'
        : stats.coveragePct >= 40 ? 'coverage-mid' : 'coverage-low';

    return `
        <div class="ngss-gap-stats">
            <div class="ngss-gap-stat ${coverageClass}">
                <div class="stat-value">${stats.coveragePct}%</div>
                <div class="stat-label">PE Coverage</div>
            </div>
            <div class="ngss-gap-stat">
                <div class="stat-value">${stats.covered} / ${TOTAL_K5_STANDARDS}</div>
                <div class="stat-label">Standards Covered</div>
            </div>
            <div class="ngss-gap-stat coverage-low">
                <div class="stat-value">${stats.gaps}</div>
                <div class="stat-label">Missing Standards</div>
            </div>
            <div class="ngss-gap-stat">
                <div class="stat-value">${stats.avgPerStandard}</div>
                <div class="stat-label">Avg Photos / Covered Std</div>
            </div>
            <div class="ngss-gap-stat">
                <div class="stat-value">${stats.idealPerStandard}</div>
                <div class="stat-label">Ideal Even Distribution</div>
            </div>
        </div>
    `;
}

// ── Render: Discipline Breakdown Bars ──────────────────────────────────
function renderDisciplineBreakdown(coverageMap) {
    let html = '<div class="ngss-discipline-bars">';

    for (const [discipline, standards] of Object.entries(NGSS_K5_STANDARDS)) {
        const total = standards.length;
        const covered = standards.filter(pe => coverageMap[pe].count > 0).length;
        const pct = ((covered / total) * 100).toFixed(0);
        const cssClass = DISCIPLINE_CSS[discipline];

        html += `
            <div class="ngss-disc-bar">
                <div class="ngss-disc-label">${escapeHtml(discipline)}</div>
                <div class="ngss-disc-track">
                    <div class="ngss-disc-fill ${cssClass}" style="width: ${Math.max(pct, 2)}%">${pct}%</div>
                </div>
                <div class="ngss-disc-value">${covered} / ${total}</div>
            </div>
        `;
    }

    html += '</div>';
    return html;
}

// ── Render: Grade-Band Heatmap ─────────────────────────────────────────
function renderGradeBandHeatmap(coverageMap) {
    const grades = ['K', '1', '2', '3', '4', '5'];
    const disciplines = Object.keys(NGSS_K5_STANDARDS);

    let html = '<div class="ngss-heatmap"><table><thead><tr><th>Grade</th>';
    for (const d of disciplines) {
        html += `<th>${escapeHtml(d)}</th>`;
    }
    html += '<th>Total</th></tr></thead><tbody>';

    for (const grade of grades) {
        html += `<tr><th>${grade === 'K' ? 'K' : 'Grade ' + grade}</th>`;
        let gradeTotal = 0, gradeCovered = 0;

        for (const discipline of disciplines) {
            const standards = NGSS_K5_STANDARDS[discipline].filter(pe => getGradeLevel(pe) === grade);
            const covered = standards.filter(pe => coverageMap[pe].count > 0).length;
            const total = standards.length;
            gradeTotal += total;
            gradeCovered += covered;

            if (total === 0) {
                html += '<td class="na">—</td>';
            } else {
                const cls = covered === total ? 'full' : covered > 0 ? 'partial' : 'empty';
                html += `<td class="${cls}">${covered} / ${total}</td>`;
            }
        }

        const cls = gradeCovered === gradeTotal ? 'full' : gradeCovered > 0 ? 'partial' : 'empty';
        html += `<td class="${cls}"><strong>${gradeCovered} / ${gradeTotal}</strong></td>`;
        html += '</tr>';
    }

    html += '</tbody></table></div>';
    return html;
}

// ── Render: Full Coverage Grid (all 78 PE standards) ───────────────────
function renderFullCoverageGrid(discipline, standards, coverageMap, images) {
    const sorted = [...standards].sort();

    let html = `<div class="ngss-section">`;
    html += `<h3>${escapeHtml(discipline)} (${standards.length})</h3>`;
    html += `<div class="ngss-grid">`;

    for (const pe of sorted) {
        const data = coverageMap[pe];
        const count = data.count;
        const level = count >= 5 ? 'good' : count >= 1 ? 'sparse' : 'gap';

        html += `<div class="ngss-cell ${level}" onclick="this.classList.toggle('expanded')">`;
        html += `<div class="ngss-cell-header">`;
        html += `<span class="ngss-cell-name">${escapeHtml(pe)}</span>`;
        html += `<span class="ngss-cell-count">${count}</span>`;
        html += `</div>`;
        html += `<div class="ngss-cell-detail">`;

        if (count === 0) {
            html += `<div class="ngss-cell-image text-muted">No photos — needs coverage</div>`;
        } else {
            const shown = data.imageIds.slice(0, 8);
            for (const id of shown) {
                const img = images.find(i => i.id === id);
                const name = img ? escapeHtml(img.title || img.filename) : `#${id}`;
                const cat = img ? getCategoryName(img.category) : '';
                html += `<div class="ngss-cell-image">${name} <span class="text-muted">${cat}</span></div>`;
            }
            if (data.imageIds.length > 8) {
                html += `<div class="ngss-cell-image text-muted">...and ${data.imageIds.length - 8} more</div>`;
            }
        }

        html += `</div></div>`;
    }

    html += `</div></div>`;
    return html;
}

// ── Render: Priority Gaps ──────────────────────────────────────────────
function renderPriorityGaps(coverageMap) {
    const missing = [];
    const underrep = [];

    for (const [pe, data] of Object.entries(coverageMap)) {
        if (data.count === 0) missing.push({ pe, ...data });
        else if (data.count <= 2) underrep.push({ pe, ...data });
    }

    missing.sort((a, b) => a.discipline.localeCompare(b.discipline) || a.pe.localeCompare(b.pe));
    underrep.sort((a, b) => a.count - b.count || a.pe.localeCompare(b.pe));

    if (missing.length === 0 && underrep.length === 0) {
        return '<p class="text-muted">All standards have adequate coverage.</p>';
    }

    let html = '';

    if (missing.length > 0) {
        let missingContent = '<div class="ngss-priority-list">';
        for (const item of missing) {
            missingContent += `
                <div class="ngss-priority-item">
                    <span class="pe-code">${escapeHtml(item.pe)}</span>
                    <span class="pe-discipline">${escapeHtml(item.discipline)}</span>
                    <span class="badge badge-neutral">Grade ${item.gradeLevel}</span>
                </div>
            `;
        }
        missingContent += '</div>';
        html += renderAccordion('ngss-missing-list', `Missing Coverage (${missing.length} standards with 0 photos)`,
            missingContent, { expanded: true, badge: `${missing.length}` });
    }

    if (underrep.length > 0) {
        let underrepContent = '<div class="ngss-priority-list">';
        for (const item of underrep) {
            underrepContent += `
                <div class="ngss-priority-item low-coverage">
                    <span class="pe-code">${escapeHtml(item.pe)}</span>
                    <span class="pe-discipline">${escapeHtml(item.discipline)}</span>
                    <span class="badge badge-neutral">Grade ${item.gradeLevel}</span>
                    <span class="ngss-cell-count">${item.count} photo${item.count !== 1 ? 's' : ''}</span>
                </div>
            `;
        }
        underrepContent += '</div>';
        html += renderAccordion('ngss-underrep-list', `Underrepresented (${underrep.length} standards with 1–2 photos)`,
            underrepContent, { badge: `${underrep.length}` });
    }

    return html;
}

// ── Render: DCI & CCC sections (preserved from original) ──────────────
function renderLegacySection(title, entries, images) {
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

// ── Accordion helper ───────────────────────────────────────────────────
function renderAccordion(id, title, content, { expanded = false, badge = '' } = {}) {
    const openClass = expanded ? ' open' : '';
    const badgeHtml = badge ? ` <span class="ngss-accordion-badge">${badge}</span>` : '';
    return `
        <div class="ngss-accordion${openClass}">
            <button class="ngss-accordion-header" onclick="this.parentElement.classList.toggle('open')">
                <span class="ngss-accordion-arrow">&#9654;</span>
                <span class="ngss-accordion-title">${title}${badgeHtml}</span>
            </button>
            <div class="ngss-accordion-body" id="${id}">
                ${content}
            </div>
        </div>
    `;
}

// ── Main Render ────────────────────────────────────────────────────────
function renderNgssCoverage() {
    if (!ngssData) return;

    const container = document.getElementById('ngss-coverage-container');
    if (!container) return;

    const images = metadataManager.getImages();
    const peData = ngssData.performanceExpectations || {};

    // Build coverage map against all 78 standards
    const coverageMap = buildCoverageMap(peData);
    const stats = computeGapStats(coverageMap, images.length);

    let html = '';

    // Always visible: Summary stats + discipline bars
    html += renderGapSummaryStats(stats);
    html += renderDisciplineBreakdown(coverageMap);

    // Accordion 1: Grade-band heatmap
    html += renderAccordion('ngss-heatmap-section', 'Grade-Band Heatmap',
        renderGradeBandHeatmap(coverageMap));

    // Accordion 2: Full coverage grid (all 78 PE standards)
    let gridContent = `
        <div class="ngss-legend">
            <span class="ngss-legend-item"><span class="ngss-dot good"></span> 5+ photos</span>
            <span class="ngss-legend-item"><span class="ngss-dot sparse"></span> 1–4 photos</span>
            <span class="ngss-legend-item"><span class="ngss-dot gap"></span> 0 photos</span>
        </div>
    `;
    for (const [discipline, standards] of Object.entries(NGSS_K5_STANDARDS)) {
        gridContent += renderFullCoverageGrid(discipline, standards, coverageMap, images);
    }
    html += renderAccordion('ngss-grid-section', 'Full Coverage Grid',
        gridContent, { badge: `${stats.covered} / ${TOTAL_K5_STANDARDS}` });

    // Accordion 3: Priority gaps (expanded by default)
    const priorityContent = renderPriorityGaps(coverageMap);
    html += renderAccordion('ngss-priority-section', 'Priority Gaps',
        priorityContent, { expanded: true, badge: `${stats.gaps} gaps` });

    // Note: extra PE codes outside the K-5 master list
    const masterSet = new Set(Object.values(NGSS_K5_STANDARDS).flat());
    const extraPEs = Object.keys(peData).filter(pe => !masterSet.has(pe));
    if (extraPEs.length > 0) {
        html += `
            <div class="ngss-extra-note">
                <strong>Note:</strong> ${extraPEs.length} PE code(s) found in content outside the official K-5 list:
                ${extraPEs.map(pe => `<code>${escapeHtml(pe)}</code> (${peData[pe].length} photos)`).join(', ')}
            </div>
        `;
    }

    // Accordion 4: DCI & CCC sections
    const dciEntries = Object.entries(ngssData.disciplinaryCoreIdeas || {});
    const cccEntries = Object.entries(ngssData.crosscuttingConcepts || {});

    if (dciEntries.length > 0 || cccEntries.length > 0) {
        let dciCccContent = '';
        dciCccContent += renderLegacySection('Disciplinary Core Ideas', dciEntries, images);
        dciCccContent += renderLegacySection('Crosscutting Concepts', cccEntries, images);
        html += renderAccordion('ngss-dci-ccc', 'Disciplinary Core Ideas & Crosscutting Concepts',
            dciCccContent);
    }

    container.innerHTML = html;
}

// Expose globally
window.loadNgssCoverage = loadNgssCoverage;
window.refreshNgssCoverage = refreshNgssCoverage;

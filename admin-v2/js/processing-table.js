/**
 * SIAS Admin Dashboard — Processing Table & Cost Analytics
 * Displays processing cost, time, and date for all images.
 */

let costSortColumn = 'id';
let costSortDirection = 'desc';

/**
 * Render the Cost Analytics tab
 */
function renderCostAnalytics() {
    const images = metadataManager.getImages();
    const withCost = metadataManager.getImagesWithCostData();

    // Summary stats
    const totalCost = withCost.reduce((sum, i) => sum + (i.processingCost || 0), 0);
    const avgCost = withCost.length > 0 ? totalCost / withCost.length : 0;
    const highestCost = withCost.length > 0 ? Math.max(...withCost.map(i => i.processingCost || 0)) : 0;

    // Total processing time
    const totalTimeMinutes = withCost.reduce((sum, i) => {
        return sum + parseProcessingTimeToMinutes(i.processingTime);
    }, 0);
    const totalTimeStr = formatTotalTime(totalTimeMinutes);

    document.getElementById('cost-total').textContent = totalCost > 0 ? '$' + totalCost.toFixed(2) : '--';
    document.getElementById('cost-avg').textContent = avgCost > 0 ? '$' + avgCost.toFixed(4) : '--';
    document.getElementById('cost-highest').textContent = highestCost > 0 ? '$' + highestCost.toFixed(4) : '--';
    document.getElementById('cost-total-time').textContent = totalTimeStr || '--';
    document.getElementById('cost-tracked-count').textContent = withCost.length + ' / ' + images.length;

    // Category cost breakdown
    renderCategoryCostBars(images, totalCost);

    // Processing details table
    renderCostTable(images);
}

/**
 * Parse "Xm Ys" processing time to minutes (decimal)
 */
function parseProcessingTimeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const match = timeStr.match(/(\d+)m\s*(\d+)s/);
    if (match) {
        return parseInt(match[1]) + parseInt(match[2]) / 60;
    }
    return 0;
}

/**
 * Format total time from minutes to human-readable
 */
function formatTotalTime(totalMinutes) {
    if (totalMinutes <= 0) return '';
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.round(totalMinutes % 60);
    if (hours > 0) return hours + 'h ' + mins + 'm';
    return mins + 'm';
}

/**
 * Render category cost bar chart
 */
function renderCategoryCostBars(images, totalCost) {
    const container = document.getElementById('category-cost-bars');
    if (!container) return;

    const categories = [
        { key: 'life-science', label: 'Life Science', cssClass: 'life' },
        { key: 'earth-space-science', label: 'Earth & Space', cssClass: 'earth' },
        { key: 'physical-science', label: 'Physical Science', cssClass: 'physical' }
    ];

    const maxCost = Math.max(...categories.map(cat => {
        return images
            .filter(i => i.category === cat.key && i.processingCost)
            .reduce((sum, i) => sum + (i.processingCost || 0), 0);
    }), 0.01); // avoid division by zero

    container.innerHTML = categories.map(cat => {
        const catImages = images.filter(i => i.category === cat.key && i.processingCost);
        const catCost = catImages.reduce((sum, i) => sum + (i.processingCost || 0), 0);
        const pct = (catCost / maxCost) * 100;

        return `
            <div class="cost-bar-item">
                <div class="cost-bar-label">${cat.label} (${catImages.length})</div>
                <div class="cost-bar-track">
                    <div class="cost-bar-fill ${cat.cssClass}" style="width: ${Math.max(pct, 2)}%">
                        ${catCost > 0 ? '$' + catCost.toFixed(2) : ''}
                    </div>
                </div>
                <div class="cost-bar-value">${catCost > 0 ? '$' + catCost.toFixed(2) : '--'}</div>
            </div>
        `;
    }).join('');
}

/**
 * Render the processing details table
 */
const COST_TABLE_VISIBLE_ROWS = 24;

function renderCostTableRow(img) {
    const hasCost = img.processingCost !== undefined && img.processingCost !== null;
    return `
        <tr>
            <td>${img.id}</td>
            <td>${escapeHtml(img.title || img.filename)}</td>
            <td><span class="badge ${getCategoryBadgeClass(img.category)}">${getCategoryName(img.category)}</span></td>
            <td>${hasCost ? '$' + img.processingCost.toFixed(4) : '<span class="text-na">\u2014</span>'}</td>
            <td>${img.processingTime || '<span class="text-na">\u2014</span>'}</td>
            <td>${img.processedAt ? formatDate(img.processedAt) : '<span class="text-na">\u2014</span>'}</td>
        </tr>
    `;
}

function renderCostTable(images) {
    const sorted = sortCostData(images);
    const tbody = document.getElementById('cost-table-body');
    if (!tbody) return;

    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-muted">No images found</td></tr>';
        return;
    }

    const visible = sorted.slice(0, COST_TABLE_VISIBLE_ROWS);
    const hidden = sorted.slice(COST_TABLE_VISIBLE_ROWS);

    let html = visible.map(renderCostTableRow).join('');

    if (hidden.length > 0) {
        const isExpanded = tbody.dataset.expanded === 'true';
        html += `<tr class="cost-table-toggle-row">
            <td colspan="6" style="text-align:center; padding: 10px;">
                <button class="btn btn-small btn-secondary" onclick="toggleCostTableRows(this)">
                    ${isExpanded ? 'Hide' : 'Show'} ${hidden.length} older entries ${isExpanded ? '▲' : '▼'}
                </button>
            </td>
        </tr>`;
        html += hidden.map(img => `<tr class="cost-table-hidden" style="display:${isExpanded ? '' : 'none'};">${renderCostTableRow(img).replace(/^<tr>|<\/tr>$/g, '')}</tr>`).join('');
    }

    tbody.innerHTML = html;
}

function toggleCostTableRows(btn) {
    const tbody = document.getElementById('cost-table-body');
    const isExpanded = tbody.dataset.expanded === 'true';
    const hiddenRows = tbody.querySelectorAll('.cost-table-hidden');
    const newState = !isExpanded;

    hiddenRows.forEach(row => row.style.display = newState ? '' : 'none');
    tbody.dataset.expanded = newState;

    const count = hiddenRows.length;
    btn.textContent = (newState ? 'Hide' : 'Show') + ` ${count} older entries ` + (newState ? '▲' : '▼');
}

/**
 * Sort cost table data
 */
function sortCostData(images) {
    const sorted = [...images];
    sorted.sort((a, b) => {
        let valA, valB;
        switch (costSortColumn) {
            case 'id':
                valA = a.id; valB = b.id; break;
            case 'title':
                valA = (a.title || a.filename).toLowerCase();
                valB = (b.title || b.filename).toLowerCase();
                break;
            case 'cost':
                valA = a.processingCost || 0;
                valB = b.processingCost || 0;
                break;
            case 'time':
                valA = parseProcessingTimeToMinutes(a.processingTime);
                valB = parseProcessingTimeToMinutes(b.processingTime);
                break;
            case 'date':
                valA = a.processedAt || '';
                valB = b.processedAt || '';
                break;
            default:
                valA = a.id; valB = b.id;
        }

        if (valA < valB) return costSortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return costSortDirection === 'asc' ? 1 : -1;
        return 0;
    });
    return sorted;
}

/**
 * Handle sort column click
 */
function sortCostTable(column) {
    if (costSortColumn === column) {
        costSortDirection = costSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        costSortColumn = column;
        costSortDirection = column === 'title' ? 'asc' : 'desc';
    }

    // Update column header classes
    document.querySelectorAll('#cost-table thead th').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
    });

    const images = metadataManager.getImages();
    renderCostTable(images);
}

/**
 * Export cost data to CSV
 */
function exportCostCSV() {
    const images = metadataManager.getImages();
    const header = 'ID,Title,Category,Cost,Processing Time,Processed At\n';
    const rows = images.map(img => {
        const cost = img.processingCost !== undefined ? img.processingCost.toFixed(4) : '';
        const time = img.processingTime || '';
        const date = img.processedAt || '';
        return `${img.id},"${(img.title || img.filename).replace(/"/g, '""')}",${img.category},${cost},"${time}",${date}`;
    }).join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sias-processing-costs-' + new Date().toISOString().split('T')[0] + '.csv';
    a.click();
    URL.revokeObjectURL(url);

    showToast('CSV exported successfully', 'success');
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Expose globally
window.renderCostAnalytics = renderCostAnalytics;
window.sortCostTable = sortCostTable;
window.exportCostCSV = exportCostCSV;
window.escapeHtml = escapeHtml;
window.toggleCostTableRows = toggleCostTableRows;

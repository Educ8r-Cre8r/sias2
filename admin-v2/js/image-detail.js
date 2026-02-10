/**
 * SIAS Admin Dashboard — Image Detail Modal
 * Shows comprehensive details for a single image.
 */

/**
 * Show the detail modal for an image
 */
function showDetailModal(imageId) {
    const image = metadataManager.getImageById(imageId);
    if (!image) {
        showToast('Image not found', 'error');
        return;
    }

    const files = computeAssociatedFiles(image);
    const totalFiles = countAssociatedFiles(files);
    const hasCost = image.processingCost !== undefined && image.processingCost !== null;

    const modal = document.getElementById('detail-modal');
    const body = document.getElementById('detail-modal-body');

    // Build keywords HTML
    const keywordsHtml = (image.keywords && image.keywords.length > 0)
        ? image.keywords.map(k => `<span class="detail-tag">${escapeHtml(k)}</span>`).join('')
        : '<span class="text-na">No keywords</span>';

    // Build NGSS standards HTML
    let ngssHtml = '<span class="text-na">No standards</span>';
    if (image.ngssStandards && typeof image.ngssStandards === 'object') {
        const allStandards = new Set();
        Object.values(image.ngssStandards).forEach(arr => {
            if (Array.isArray(arr)) arr.forEach(s => allStandards.add(s));
        });
        if (allStandards.size > 0) {
            ngssHtml = [...allStandards].map(s => `<span class="detail-tag">${escapeHtml(s)}</span>`).join('');
        }
    }

    // File list per category
    const fileListHtml = (fileArray) => {
        return fileArray.map(f => {
            const name = f.split('/').pop();
            return `<li class="found">${escapeHtml(name)}</li>`;
        }).join('');
    };

    body.innerHTML = `
        <div class="detail-grid">
            <div>
                <img class="detail-image" src="../${image.imagePath}" alt="${escapeHtml(image.title)}"
                     onerror="this.src='../${image.thumbPath || image.imagePath}'">
                <div class="mt-16">
                    <button class="btn btn-danger btn-small" onclick="closeDetailModal(); showDeleteModal(${image.id});">
                        Delete Image
                    </button>
                </div>
            </div>
            <div>
                <div class="detail-section">
                    <h3>Image Info</h3>
                    <div class="detail-field">
                        <span class="detail-field-label">ID</span>
                        <span class="detail-field-value">${image.id}</span>
                    </div>
                    <div class="detail-field">
                        <span class="detail-field-label">Title</span>
                        <span class="detail-field-value">${escapeHtml(image.title || 'Untitled')}</span>
                    </div>
                    <div class="detail-field">
                        <span class="detail-field-label">Filename</span>
                        <span class="detail-field-value" style="font-size: 0.85rem;">${escapeHtml(image.filename)}</span>
                    </div>
                    <div class="detail-field">
                        <span class="detail-field-label">Category</span>
                        <span class="detail-field-value"><span class="badge ${getCategoryBadgeClass(image.category)}">${getCategoryName(image.category)}</span></span>
                    </div>
                    <div class="detail-field">
                        <span class="detail-field-label">Has Content</span>
                        <span class="detail-field-value">${image.hasContent ? 'Yes' : 'No'}</span>
                    </div>
                    <div class="detail-field">
                        <span class="detail-field-label">Total Files</span>
                        <span class="detail-field-value">${totalFiles}</span>
                    </div>
                </div>

                <div class="detail-section">
                    <h3>Processing</h3>
                    <div class="detail-field">
                        <span class="detail-field-label">Cost</span>
                        <span class="detail-field-value">${hasCost ? '$' + image.processingCost.toFixed(4) : '<span class="text-na">\u2014</span>'}</span>
                    </div>
                    <div class="detail-field">
                        <span class="detail-field-label">Time</span>
                        <span class="detail-field-value">${image.processingTime || '<span class="text-na">\u2014</span>'}</span>
                    </div>
                    <div class="detail-field">
                        <span class="detail-field-label">Processed</span>
                        <span class="detail-field-value">${image.processedAt ? formatDate(image.processedAt) : '<span class="text-na">\u2014</span>'}</span>
                    </div>
                </div>

                <div class="detail-section">
                    <h3>Keywords</h3>
                    <div class="detail-tags">${keywordsHtml}</div>
                </div>

                <div class="detail-section">
                    <h3>NGSS Standards</h3>
                    <div class="detail-tags">${ngssHtml}</div>
                </div>

                <div class="detail-section">
                    <h3>Associated Files (${totalFiles})</h3>
                    <details style="margin-bottom: 8px;">
                        <summary style="cursor: pointer; font-size: 0.85rem;">Images (${files.images.length})</summary>
                        <ul class="audit-file-list" style="margin-top: 4px;">${fileListHtml(files.images)}</ul>
                    </details>
                    <details style="margin-bottom: 8px;">
                        <summary style="cursor: pointer; font-size: 0.85rem;">Content (${files.content.length})</summary>
                        <ul class="audit-file-list" style="margin-top: 4px;">${fileListHtml(files.content)}</ul>
                    </details>
                    <details style="margin-bottom: 8px;">
                        <summary style="cursor: pointer; font-size: 0.85rem;">Hotspots (${files.hotspots.length})</summary>
                        <ul class="audit-file-list" style="margin-top: 4px;">${fileListHtml(files.hotspots)}</ul>
                    </details>
                    <details style="margin-bottom: 8px;">
                        <summary style="cursor: pointer; font-size: 0.85rem;">PDFs (${files.pdfs.length})</summary>
                        <ul class="audit-file-list" style="margin-top: 4px;">${fileListHtml(files.pdfs)}</ul>
                    </details>
                </div>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
}

/**
 * Close the detail modal
 */
function closeDetailModal() {
    const modal = document.getElementById('detail-modal');
    modal.classList.add('hidden');
}

// Expose globally
window.showDetailModal = showDetailModal;
window.closeDetailModal = closeDetailModal;

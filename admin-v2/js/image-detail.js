/**
 * SIAS Admin Dashboard — Image Detail Modal
 * Shows comprehensive details for a single image.
 */

let editModeActive = false;
let editImageId = null;
let editKeywords = [];

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
                <div class="mt-16" style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="btn btn-secondary btn-small" id="edit-meta-btn" onclick="enterEditMode(${image.id})">
                        Edit Info
                    </button>
                    <button class="btn btn-primary btn-small" onclick="reprocessImage(${image.id})">
                        Re-process
                    </button>
                    <button class="btn btn-danger btn-small" onclick="closeDetailModal(); showDeleteModal(${image.id});">
                        Delete Image
                    </button>
                    ${image.hasContent ? `<button class="btn btn-secondary btn-small" onclick="initContentEditor(${image.id})">Edit Content</button>` : ''}
                </div>
            </div>
            <div>
                <div class="detail-section">
                    <h3>Image Info</h3>
                    <div class="detail-field">
                        <span class="detail-field-label">ID</span>
                        <span class="detail-field-value">${image.id}</span>
                    </div>
                    <div class="detail-field" id="detail-title-field">
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

                <div class="detail-section" id="detail-keywords-section">
                    <h3>Keywords</h3>
                    <div class="detail-tags" id="detail-keywords-container">${keywordsHtml}</div>
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
        <div id="content-editor-container" class="hidden"></div>
    `;

    modal.classList.remove('hidden');
}

/**
 * Enter edit mode for title and keywords
 */
function enterEditMode(imageId) {
    const image = metadataManager.getImageById(imageId);
    if (!image) return;

    editModeActive = true;
    editImageId = imageId;
    editKeywords = [...(image.keywords || [])];

    // Replace Edit button with Save/Cancel
    const editBtn = document.getElementById('edit-meta-btn');
    if (editBtn) {
        editBtn.outerHTML = `
            <button class="btn btn-primary btn-small" id="save-meta-btn" onclick="saveImageMetadata()">
                Save
            </button>
            <button class="btn btn-secondary btn-small" onclick="cancelEditMode()">
                Cancel
            </button>
        `;
    }

    // Replace title with input
    const titleField = document.getElementById('detail-title-field');
    if (titleField) {
        titleField.innerHTML = `
            <span class="detail-field-label">Title</span>
            <input type="text" id="edit-title-input" class="edit-input" value="${escapeHtml(image.title || '')}" placeholder="Enter title...">
        `;
    }

    // Replace keywords with editable tags
    renderEditableKeywords();
}

/**
 * Render editable keyword tags with add/remove
 */
function renderEditableKeywords() {
    const container = document.getElementById('detail-keywords-container');
    if (!container) return;

    const tagsHtml = editKeywords.map((k, i) =>
        `<span class="detail-tag keyword-editable">${escapeHtml(k)}<button class="keyword-remove-btn" onclick="removeKeywordTag(${i})" title="Remove">&times;</button></span>`
    ).join('');

    container.innerHTML = `
        ${tagsHtml}
        <div class="keyword-add-row">
            <input type="text" id="add-keyword-input" class="edit-input edit-input-small" placeholder="Add keyword..." onkeydown="if(event.key==='Enter'){event.preventDefault();addKeywordTag();}">
            <button class="btn btn-small btn-outline" onclick="addKeywordTag()">+</button>
        </div>
    `;
}

/**
 * Add a new keyword tag
 */
function addKeywordTag() {
    const input = document.getElementById('add-keyword-input');
    if (!input) return;
    const val = input.value.trim();
    if (!val) return;
    if (editKeywords.includes(val)) {
        showToast('Keyword already exists', 'info');
        input.value = '';
        return;
    }
    editKeywords.push(val);
    input.value = '';
    renderEditableKeywords();
    // Re-focus the input
    const newInput = document.getElementById('add-keyword-input');
    if (newInput) newInput.focus();
}

/**
 * Remove a keyword tag by index
 */
function removeKeywordTag(index) {
    editKeywords.splice(index, 1);
    renderEditableKeywords();
}

/**
 * Cancel edit mode and restore display
 */
function cancelEditMode() {
    editModeActive = false;
    editKeywords = [];
    // Re-render the whole modal to restore original display
    if (editImageId !== null) {
        showDetailModal(editImageId);
    }
    editImageId = null;
}

/**
 * Save edited title and keywords via Cloud Function
 */
async function saveImageMetadata() {
    const titleInput = document.getElementById('edit-title-input');
    const newTitle = titleInput ? titleInput.value.trim() : '';

    if (!newTitle) {
        showToast('Title cannot be empty', 'warning');
        return;
    }

    const saveBtn = document.getElementById('save-meta-btn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
    }

    try {
        const updateFn = firebase.functions().httpsCallable('adminUpdateImageMetadata');
        await updateFn({
            imageId: editImageId,
            title: newTitle,
            keywords: editKeywords
        });

        // Optimistic local update
        metadataManager.updateImageLocally(editImageId, {
            title: newTitle,
            keywords: [...editKeywords]
        });

        showToast('Image metadata saved!', 'success');
        editModeActive = false;

        // Refresh the modal to show updated data
        showDetailModal(editImageId);
        editImageId = null;
        editKeywords = [];

        // Refresh the images grid
        if (typeof renderImagesGrid === 'function') renderImagesGrid();
    } catch (error) {
        console.error('Save metadata error:', error);
        showToast('Failed to save: ' + error.message, 'error');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
        }
    }
}

/**
 * Close the detail modal
 */
function closeDetailModal() {
    const modal = document.getElementById('detail-modal');
    modal.classList.add('hidden');
    editModeActive = false;
    editImageId = null;
    editKeywords = [];
}

// Expose globally
window.showDetailModal = showDetailModal;
window.closeDetailModal = closeDetailModal;
window.enterEditMode = enterEditMode;
window.cancelEditMode = cancelEditMode;
window.saveImageMetadata = saveImageMetadata;
window.addKeywordTag = addKeywordTag;
window.removeKeywordTag = removeKeywordTag;

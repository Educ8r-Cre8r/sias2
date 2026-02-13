/**
 * SIAS Admin Dashboard — Bulk Operations
 * Centralized bulk operation logic with progress modal, cancel capability,
 * and filter-based bulk actions.
 */

let bulkOpState = {
    active: false,
    type: null,        // 'reprocess' | 'delete'
    imageIds: [],
    completed: 0,
    failed: 0,
    cancelled: false,
};

/**
 * Show bulk operation confirmation modal
 * @param {'reprocess' | 'delete'} type
 * @param {number[]} imageIds
 */
function showBulkConfirmModal(type, imageIds) {
    if (bulkOpState.active) {
        showToast('A bulk operation is already in progress', 'info');
        return;
    }
    if (!imageIds || imageIds.length === 0) {
        showToast('No images selected', 'warning');
        return;
    }

    const modal = document.getElementById('bulk-op-modal');
    const title = document.getElementById('bulk-op-modal-title');
    const body = document.getElementById('bulk-op-modal-body');

    const isDelete = type === 'delete';
    title.textContent = isDelete ? 'Delete Images' : 'Re-process Images';

    // Build image preview list (show first 10, then "and X more")
    const images = metadataManager.getImages();
    const imageMap = {};
    images.forEach(img => { imageMap[img.id] = img; });

    const previewImages = imageIds.slice(0, 10);
    const remaining = imageIds.length - previewImages.length;

    const listHtml = previewImages.map(id => {
        const img = imageMap[id];
        const name = img ? escapeHtml(img.title || img.filename) : `Image #${id}`;
        return `<div style="padding: 4px 0; font-size: 0.85rem; color: var(--text-secondary);">${name}</div>`;
    }).join('') + (remaining > 0
        ? `<div style="padding: 4px 0; font-size: 0.85rem; color: var(--text-muted);">...and ${remaining} more</div>`
        : '');

    const warningHtml = isDelete
        ? `<p style="color: var(--danger); font-weight: 600; margin-top: 12px;">
               This will permanently delete ${imageIds.length} image(s) and approximately ${imageIds.length * 32} associated files.
               This action cannot be undone.
           </p>`
        : `<p style="color: var(--text-secondary); margin-top: 12px;">
               This will regenerate all content, hotspots, and PDFs for ${imageIds.length} image(s).
               They will be added to the processing queue.
           </p>`;

    body.innerHTML = `
        <div class="bulk-op-image-list">${listHtml}</div>
        ${warningHtml}
        <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px;">
            <button class="btn btn-secondary" onclick="closeBulkOpModal()">Cancel</button>
            <button class="btn ${isDelete ? 'btn-danger' : 'btn-primary'}" id="bulk-op-start-btn"
                    onclick="startBulkExecution('${type}', ${JSON.stringify(imageIds)})">
                ${isDelete ? 'Delete ' + imageIds.length + ' Images' : 'Re-process ' + imageIds.length + ' Images'}
            </button>
        </div>
    `;

    modal.classList.remove('hidden');
}

/**
 * Start executing the bulk operation with progress tracking
 */
function startBulkExecution(type, imageIds) {
    bulkOpState = {
        active: true,
        type: type,
        imageIds: imageIds,
        completed: 0,
        failed: 0,
        cancelled: false,
    };

    renderBulkProgress();
    executeBulkOperation();
}

/**
 * Render the progress UI inside the modal
 */
function renderBulkProgress() {
    const body = document.getElementById('bulk-op-modal-body');
    const total = bulkOpState.imageIds.length;
    const done = bulkOpState.completed + bulkOpState.failed;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    if (bulkOpState.cancelled || done >= total) {
        // Show completion summary
        const isDelete = bulkOpState.type === 'delete';
        const action = isDelete ? 'deleted' : 'queued for re-processing';
        const skipped = total - done;

        body.innerHTML = `
            <div class="bulk-progress-section">
                <div class="upload-progress-track">
                    <div class="upload-progress-bar" style="width: ${pct}%; ${bulkOpState.failed > 0 ? 'background: var(--warning);' : ''}"></div>
                </div>
                <div class="bulk-op-summary">
                    <p style="font-size: 1rem; font-weight: 600; margin-bottom: 8px;">
                        ${bulkOpState.cancelled ? 'Operation Cancelled' : 'Operation Complete'}
                    </p>
                    <p>${bulkOpState.completed} ${action}</p>
                    ${bulkOpState.failed > 0 ? `<p style="color: var(--danger);">${bulkOpState.failed} failed</p>` : ''}
                    ${skipped > 0 ? `<p style="color: var(--text-muted);">${skipped} skipped (cancelled)</p>` : ''}
                </div>
                <div style="display: flex; justify-content: flex-end; margin-top: 16px;">
                    <button class="btn btn-primary" onclick="closeBulkOpModal()">Done</button>
                </div>
            </div>
        `;
        return;
    }

    // Show in-progress state
    const currentIdx = done + 1;
    const currentId = bulkOpState.imageIds[done];
    const images = metadataManager.getImages();
    const currentImg = images.find(img => img.id === currentId);
    const currentName = currentImg ? escapeHtml(currentImg.title || currentImg.filename) : `Image #${currentId}`;

    body.innerHTML = `
        <div class="bulk-progress-section">
            <div class="upload-progress-track">
                <div class="upload-progress-bar" style="width: ${pct}%"></div>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 8px; font-size: 0.85rem;">
                <span>Processing ${currentIdx} of ${total}: ${currentName}</span>
                <span>${bulkOpState.failed > 0 ? bulkOpState.failed + ' failed' : ''}</span>
            </div>
            <div style="display: flex; justify-content: flex-end; margin-top: 16px;">
                <button class="btn btn-secondary" onclick="cancelBulkOperation()">Cancel Remaining</button>
            </div>
        </div>
    `;
}

/**
 * Execute the bulk operation — loops through images sequentially
 */
async function executeBulkOperation() {
    const isDelete = bulkOpState.type === 'delete';
    const fnName = isDelete ? 'adminDeleteImage' : 'adminReprocessImage';

    for (let i = 0; i < bulkOpState.imageIds.length; i++) {
        if (bulkOpState.cancelled) break;

        const imageId = bulkOpState.imageIds[i];

        try {
            const fn = firebase.functions().httpsCallable(fnName);
            await fn({ imageId });

            if (isDelete) {
                metadataManager.removeImageLocally(imageId);
            }

            bulkOpState.completed++;
        } catch (error) {
            console.error(`Bulk ${bulkOpState.type} failed for image ${imageId}:`, error);
            bulkOpState.failed++;
        }

        renderBulkProgress();
    }

    // Final state
    bulkOpState.active = false;
    renderBulkProgress();

    // Refresh views after bulk operations complete
    if (isDelete) {
        renderOverview();
        renderImagesGrid();
        renderCostAnalytics();
        renderContentAudit();
    }
    clearSelection();
}

/**
 * Cancel the current bulk operation
 */
function cancelBulkOperation() {
    bulkOpState.cancelled = true;
}

/**
 * Close the bulk operation modal
 */
function closeBulkOpModal() {
    const modal = document.getElementById('bulk-op-modal');
    modal.classList.add('hidden');
    bulkOpState.active = false;
}

/**
 * Handle filter-based bulk action from the dropdown
 */
function handleBulkFilterAction(selectEl) {
    const action = selectEl.value;
    selectEl.value = ''; // Reset dropdown

    if (action === 'reprocess-category') {
        bulkReprocessByCategory();
    }
}

/**
 * Reprocess all images in the currently filtered category
 */
function bulkReprocessByCategory() {
    const images = metadataManager.getImages();
    // Use the current category filter from search-filter.js
    const category = typeof currentCategory !== 'undefined' ? currentCategory : 'all';

    let filtered = images;
    if (category && category !== 'all') {
        filtered = images.filter(img => img.category === category);
    }

    if (filtered.length === 0) {
        showToast('No images in this category', 'warning');
        return;
    }

    const ids = filtered.map(img => img.id);
    const catName = category === 'all' ? 'All Categories' : getCategoryName(category);

    showToast(`Selected ${ids.length} images from ${catName}`, 'info');
    showBulkConfirmModal('reprocess', ids);
}

/**
 * Show single reprocess confirmation modal (replaces browser confirm)
 */
function showReprocessConfirmModal(imageId) {
    const image = metadataManager.getImageById(imageId);
    if (!image) {
        showToast('Image not found', 'error');
        return;
    }

    const modal = document.getElementById('bulk-op-modal');
    const title = document.getElementById('bulk-op-modal-title');
    const body = document.getElementById('bulk-op-modal-body');

    title.textContent = 'Re-process Image';

    body.innerHTML = `
        <div style="padding: 8px 0;">
            <p>Re-process <strong>${escapeHtml(image.title || image.filename)}</strong>?</p>
            <p style="color: var(--text-secondary); margin-top: 8px; font-size: 0.9rem;">
                This will regenerate all content, hotspots, and PDFs.
                The image will be added to the processing queue.
            </p>
        </div>
        <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px;">
            <button class="btn btn-secondary" onclick="closeBulkOpModal()">Cancel</button>
            <button class="btn btn-primary" onclick="closeBulkOpModal(); executeReprocess(${imageId})">Re-process</button>
        </div>
    `;

    modal.classList.remove('hidden');
}

/**
 * Execute single reprocess (called after modal confirmation)
 */
async function executeReprocess(imageId) {
    const image = metadataManager.getImageById(imageId);
    showToast('Queuing re-process...', 'info');

    try {
        const reprocessFn = firebase.functions().httpsCallable('adminReprocessImage');
        await reprocessFn({ imageId: imageId });
        showToast(`"${image?.title || image?.filename || 'Image'}" queued for re-processing!`, 'success', 5000);
        closeDetailModal();
    } catch (error) {
        console.error('Re-process error:', error);
        showToast('Re-process failed: ' + error.message, 'error');
    }
}

// Expose globally
window.showBulkConfirmModal = showBulkConfirmModal;
window.closeBulkOpModal = closeBulkOpModal;
window.cancelBulkOperation = cancelBulkOperation;
window.handleBulkFilterAction = handleBulkFilterAction;
window.bulkReprocessByCategory = bulkReprocessByCategory;
window.showReprocessConfirmModal = showReprocessConfirmModal;
window.executeReprocess = executeReprocess;

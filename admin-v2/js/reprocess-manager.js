/**
 * SIAS Admin Dashboard — Re-process Image
 * Triggers regeneration of content/hotspots/PDFs for an existing image.
 * Uses modal confirmation (via bulk-operations.js) instead of browser confirm().
 */

let reprocessInProgress = false;

async function reprocessImage(imageId) {
    if (reprocessInProgress) {
        showToast('A re-process is already in progress', 'info');
        return;
    }

    // Show styled confirmation modal instead of browser confirm()
    showReprocessConfirmModal(imageId);
}

/**
 * Bulk re-process selected images — delegates to bulk-operations.js
 */
function bulkReprocess() {
    const selected = getSelectedImageIds();
    if (selected.length === 0) {
        showToast('No images selected', 'warning');
        return;
    }
    showBulkConfirmModal('reprocess', selected);
}

// Expose globally
window.reprocessImage = reprocessImage;
window.bulkReprocess = bulkReprocess;

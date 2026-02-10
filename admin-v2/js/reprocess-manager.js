/**
 * SIAS Admin Dashboard — Re-process Image
 * Triggers regeneration of content/hotspots/PDFs for an existing image.
 */

let reprocessInProgress = false;

async function reprocessImage(imageId) {
    if (reprocessInProgress) {
        showToast('A re-process is already in progress', 'info');
        return;
    }

    const image = metadataManager.getImageById(imageId);
    if (!image) {
        showToast('Image not found', 'error');
        return;
    }

    const confirmed = confirm(
        `Re-process "${image.title || image.filename}"?\n\n` +
        `This will regenerate all content, hotspots, and PDFs.\n` +
        `The image will be added to the processing queue.`
    );
    if (!confirmed) return;

    reprocessInProgress = true;
    showToast('Queuing re-process...', 'info');

    try {
        const reprocessFn = firebase.functions().httpsCallable('adminReprocessImage');
        const result = await reprocessFn({ imageId: imageId });
        showToast(`"${image.title || image.filename}" queued for re-processing!`, 'success', 5000);
        closeDetailModal();
    } catch (error) {
        console.error('Re-process error:', error);
        showToast('Re-process failed: ' + error.message, 'error');
    } finally {
        reprocessInProgress = false;
    }
}

/**
 * Bulk re-process selected images
 */
async function bulkReprocess() {
    const selected = getSelectedImageIds();
    if (selected.length === 0) {
        showToast('No images selected', 'warning');
        return;
    }

    const confirmed = confirm(
        `Re-process ${selected.length} image(s)?\n\n` +
        `This will regenerate all content, hotspots, and PDFs for each image.\n` +
        `They will be added to the processing queue one by one.`
    );
    if (!confirmed) return;

    showToast(`Re-processing ${selected.length} images...`, 'info', 8000);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < selected.length; i++) {
        const imageId = selected[i];
        try {
            const reprocessFn = firebase.functions().httpsCallable('adminReprocessImage');
            await reprocessFn({ imageId });
            successCount++;
        } catch (error) {
            console.error(`Failed to re-process image ${imageId}:`, error);
            failCount++;
        }
    }

    clearSelection();

    if (failCount === 0) {
        showToast(`All ${successCount} images queued for re-processing`, 'success');
    } else {
        showToast(`Queued ${successCount}, failed ${failCount}`, 'warning');
    }
}

// Expose globally
window.reprocessImage = reprocessImage;
window.bulkReprocess = bulkReprocess;

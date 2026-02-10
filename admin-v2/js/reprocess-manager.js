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

// Expose globally
window.reprocessImage = reprocessImage;

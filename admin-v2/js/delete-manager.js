/**
 * SIAS Admin Dashboard — Delete Manager
 * Handles full image deletion with confirmation modal.
 */

let deleteInProgress = false;

/**
 * Show delete confirmation modal for an image
 */
function showDeleteModal(imageId) {
    if (deleteInProgress) {
        showToast('A deletion is already in progress', 'warning');
        return;
    }

    const image = metadataManager.getImageById(imageId);
    if (!image) {
        showToast('Image not found', 'error');
        return;
    }

    const files = computeAssociatedFiles(image);
    const totalFiles = countAssociatedFiles(files);
    const allFiles = [...files.images, ...files.content, ...files.hotspots, ...files.pdfs, ...(files.fiveE || [])];

    const modal = document.getElementById('delete-modal');
    const body = document.getElementById('delete-modal-body');

    // Determine thumbnail path
    const thumbSrc = resolveAssetUrl(image.thumbPath ? '../' + image.thumbPath : '../' + image.imagePath);

    body.innerHTML = `
        <div class="delete-preview">
            <img src="${thumbSrc}" alt="${escapeHtml(image.title)}" onerror="this.style.display='none'">
            <div>
                <strong>${escapeHtml(image.title || image.filename)}</strong><br>
                <span class="badge ${getCategoryBadgeClass(image.category)}">${getCategoryName(image.category)}</span>
                <span style="color: var(--text-muted); font-size: 0.85rem;">ID: ${image.id}</span>
            </div>
        </div>

        <div class="delete-file-count">
            This will permanently delete ${totalFiles} files + Firestore records
        </div>

        <details>
            <summary style="cursor: pointer; color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 8px;">
                View all files to be deleted
            </summary>
            <div class="delete-file-list">
                <strong>Images (${files.images.length}):</strong><br>
                ${files.images.map(f => '  ' + f).join('<br>')}
                <br><br>
                <strong>Content (${files.content.length}):</strong><br>
                ${files.content.map(f => '  ' + f).join('<br>')}
                <br><br>
                <strong>Hotspots (${files.hotspots.length}):</strong><br>
                ${files.hotspots.map(f => '  ' + f).join('<br>')}
                <br><br>
                <strong>PDFs (${files.pdfs.length}):</strong><br>
                ${files.pdfs.map(f => '  ' + f).join('<br>')}
                <br><br>
                <strong>5E Lessons (${files.fiveE ? files.fiveE.length : 0}):</strong><br>
                ${files.fiveE ? files.fiveE.map(f => '  ' + f).join('<br>') : '  (none)'}
                <br><br>
                <strong>Also removed:</strong><br>
                  gallery-metadata.json entry<br>
                  Firestore: ratings, views, userRatings, favorites, comments
            </div>
        </details>

        <div class="delete-actions">
            <button class="btn btn-secondary" onclick="closeDeleteModal()">Cancel</button>
            <button class="btn btn-danger" onclick="confirmDelete(${image.id})">
                Delete Permanently
            </button>
        </div>
    `;

    modal.classList.remove('hidden');
}

/**
 * Execute the deletion via Cloud Function
 */
async function confirmDelete(imageId) {
    if (deleteInProgress) return;
    deleteInProgress = true;

    const body = document.getElementById('delete-modal-body');
    body.innerHTML = `
        <div class="delete-progress">
            <div class="spinner spinner-large" style="margin: 0 auto 16px;"></div>
            <p>Deleting image and all associated files...</p>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 8px;">
                This involves cloning the repo, removing files, committing, and pushing to GitHub.
                This may take 30-60 seconds.
            </p>
        </div>
    `;

    try {
        const deleteFn = firebase.functions().httpsCallable('adminDeleteImage');
        const result = await deleteFn({ imageId: imageId });

        // Optimistic update — remove from local cache
        metadataManager.removeImageLocally(imageId);

        // Refresh all views
        renderOverview();
        renderImagesGrid();
        renderCostAnalytics();
        renderContentAudit();

        closeDeleteModal();

        const data = result.data;
        showToast(
            `Deleted "${data.title || 'image'}" — ${data.filesDeleted || 0} files removed`,
            'success',
            6000
        );
    } catch (error) {
        console.error('Delete error:', error);

        body.innerHTML = `
            <div class="delete-progress">
                <p class="text-danger" style="font-size: 1.2rem; margin-bottom: 12px;">Deletion Failed</p>
                <p>${escapeHtml(error.message || 'Unknown error occurred')}</p>
                <div class="delete-actions" style="margin-top: 20px;">
                    <button class="btn btn-secondary" onclick="closeDeleteModal()">Close</button>
                    <button class="btn btn-danger" onclick="confirmDelete(${imageId})">Retry</button>
                </div>
            </div>
        `;
    } finally {
        deleteInProgress = false;
    }
}

/**
 * Close the delete modal
 */
function closeDeleteModal() {
    const modal = document.getElementById('delete-modal');
    modal.classList.add('hidden');
}

/**
 * Bulk delete selected images
 */
async function bulkDelete() {
    const selected = getSelectedImageIds();
    if (selected.length === 0) {
        showToast('No images selected', 'warning');
        return;
    }

    const confirmed = confirm(
        `Are you sure you want to delete ${selected.length} image(s) and ALL their associated files?\n\n` +
        `This will delete approximately ${selected.length * 32} files total.\n\n` +
        `This action cannot be undone.`
    );

    if (!confirmed) return;

    showToast(`Deleting ${selected.length} images... this will take a while`, 'info', 10000);

    let successCount = 0;
    let failCount = 0;

    for (const imageId of selected) {
        try {
            const deleteFn = firebase.functions().httpsCallable('adminDeleteImage');
            await deleteFn({ imageId: imageId });
            metadataManager.removeImageLocally(imageId);
            successCount++;
        } catch (error) {
            console.error(`Failed to delete image ${imageId}:`, error);
            failCount++;
        }
    }

    // Refresh all views
    renderOverview();
    renderImagesGrid();
    renderCostAnalytics();
    renderContentAudit();
    clearSelection();

    if (failCount === 0) {
        showToast(`Successfully deleted ${successCount} images`, 'success');
    } else {
        showToast(`Deleted ${successCount}, failed ${failCount}`, 'warning');
    }
}

// Expose globally
window.showDeleteModal = showDeleteModal;
window.confirmDelete = confirmDelete;
window.closeDeleteModal = closeDeleteModal;
window.bulkDelete = bulkDelete;

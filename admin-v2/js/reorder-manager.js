/**
 * SIAS Admin Dashboard — Image Reorder Manager
 * Drag-and-drop reordering of gallery images using SortableJS.
 */

let sortableInstance = null;
let reorderDirty = false;

/**
 * Open the reorder modal with all images in current order.
 */
async function openReorderModal() {
    const modal = document.getElementById('reorder-modal');
    if (!modal) return;

    // Ensure metadata is loaded before rendering
    const data = metadataManager.getData();
    if (!data || !data.images || data.images.length === 0) {
        showToast('Loading metadata...', 'info');
        await metadataManager.load();
    }

    modal.style.display = 'flex';
    reorderDirty = false;
    document.getElementById('reorder-save-btn').disabled = true;

    renderReorderGrid('all');
    initSortable();
}

/**
 * Close the reorder modal.
 */
function closeReorderModal() {
    const modal = document.getElementById('reorder-modal');
    if (!modal) return;

    if (reorderDirty) {
        if (!confirm('You have unsaved changes. Close anyway?')) return;
    }

    modal.style.display = 'none';
    if (sortableInstance) {
        sortableInstance.destroy();
        sortableInstance = null;
    }
}

/**
 * Render the image grid inside the reorder modal.
 */
function renderReorderGrid(categoryFilter) {
    const grid = document.getElementById('reorder-grid');
    if (!grid) {
        console.warn('Reorder grid element not found');
        return;
    }

    const data = metadataManager.getData();
    if (!data || !data.images) {
        console.warn('Metadata not loaded for reorder grid');
        showToast('Unable to load images. Please refresh.', 'error');
        return;
    }

    let images = [...data.images];

    // Sort by current imageOrder if it exists
    if (data.imageOrder && data.imageOrder.length > 0) {
        const orderMap = {};
        data.imageOrder.forEach((id, idx) => { orderMap[id] = idx; });
        images.sort((a, b) => (orderMap[a.id] ?? 9999) - (orderMap[b.id] ?? 9999));
    }

    // Apply category filter for view (but we save global order)
    if (categoryFilter && categoryFilter !== 'all') {
        images = images.filter(img => img.category === categoryFilter);
    }

    const html = images.map(img => {
        const thumbUrl = resolveAssetUrl(`../images/${img.category}/thumbs/${img.filename}`);
        const catBadge = getCategoryBadgeClass(img.category);
        const title = escapeHtml(img.title || img.filename);

        return `
            <div class="reorder-card" data-image-id="${img.id}">
                <span class="drag-handle" title="Drag to reorder">&#9776;</span>
                <img src="${thumbUrl}" alt="${title}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 60 60%22><rect fill=%22%23ddd%22 width=%2260%22 height=%2260%22/><text x=%2230%22 y=%2234%22 text-anchor=%22middle%22 fill=%22%23999%22 font-size=%2210%22>?</text></svg>'">
                <div class="reorder-card-info">
                    <div class="reorder-card-title">${title}</div>
                    <span class="badge ${catBadge}" style="font-size: 0.65rem;">${getCategoryName(img.category)}</span>
                </div>
            </div>
        `;
    }).join('');

    grid.innerHTML = html;
    console.log(`Rendered ${images.length} images in reorder grid (filter: ${categoryFilter})`);

    // Update filter pills active state
    document.querySelectorAll('#reorder-filter-pills .pill').forEach(p => {
        p.classList.toggle('active', p.dataset.category === categoryFilter);
    });
}

/**
 * Initialize SortableJS on the grid.
 */
function initSortable() {
    const grid = document.getElementById('reorder-grid');
    if (!grid) return;

    if (sortableInstance) sortableInstance.destroy();

    sortableInstance = Sortable.create(grid, {
        animation: 150,
        handle: '.drag-handle',
        ghostClass: 'sortable-ghost',
        onEnd: () => {
            reorderDirty = true;
            document.getElementById('reorder-save-btn').disabled = false;
        }
    });
}

/**
 * Reset order to ascending by image ID.
 */
function resetToOriginalOrder() {
    const data = metadataManager.getData();
    if (!data) return;

    const sorted = [...data.images].sort((a, b) => a.id - b.id);
    data.imageOrder = sorted.map(img => img.id);

    renderReorderGrid('all');
    initSortable();
    reorderDirty = true;
    document.getElementById('reorder-save-btn').disabled = false;
    showToast('Reset to original order (unsaved)', 'info');
}

/**
 * Save the current grid order to the Cloud Function.
 */
async function saveImageOrder() {
    const grid = document.getElementById('reorder-grid');
    const btn = document.getElementById('reorder-save-btn');
    if (!grid || !btn) return;

    // Check if we're filtering — need all images for a full save
    const activePill = document.querySelector('#reorder-filter-pills .pill.active');
    if (activePill && activePill.dataset.category !== 'all') {
        showToast('Switch to "All" filter before saving to preserve complete order', 'warning');
        return;
    }

    const cards = grid.querySelectorAll('.reorder-card');
    const imageOrder = Array.from(cards).map(card => parseInt(card.dataset.imageId));

    const data = metadataManager.getData();
    if (imageOrder.length !== data.images.length) {
        showToast(`Order has ${imageOrder.length} images but metadata has ${data.images.length}. Reset filter to "All".`, 'error');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        const fn = firebase.functions().httpsCallable('adminSaveImageOrder');
        await fn({ imageOrder });

        // Update local metadata
        const localData = metadataManager.getData();
        if (localData) localData.imageOrder = imageOrder;

        reorderDirty = false;
        btn.textContent = 'Saved!';
        showToast('Image order saved! Changes will appear after deploy.', 'success');

        setTimeout(() => {
            btn.textContent = 'Save Order';
            btn.disabled = true;
        }, 2000);
    } catch (error) {
        console.error('Save order error:', error);
        showToast('Failed to save order: ' + error.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Save Order';
    }
}

/**
 * Filter the reorder grid by category.
 */
function filterReorderGrid(category) {
    renderReorderGrid(category);
    initSortable();
}

// Expose globally
window.openReorderModal = openReorderModal;
window.closeReorderModal = closeReorderModal;
window.resetToOriginalOrder = resetToOriginalOrder;
window.saveImageOrder = saveImageOrder;
window.filterReorderGrid = filterReorderGrid;

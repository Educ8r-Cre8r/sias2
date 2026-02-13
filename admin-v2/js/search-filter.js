/**
 * SIAS Admin Dashboard — Search, Filter & Image Grid
 * Handles the Images tab with search, filter, sort, and bulk selection.
 */

let currentCategory = 'all';
let currentSort = 'id-desc';
let selectedImageIds = new Set();

const ADMIN_IMAGES_PER_PAGE = 48;
let adminVisibleCount = ADMIN_IMAGES_PER_PAGE;

// Utility: debounce function calls
function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

const debouncedRenderGrid = debounce(renderImagesGrid, 250);

/**
 * Render the images grid
 */
function renderImagesGrid() {
    const container = document.getElementById('images-grid');
    if (!container) return;

    const images = getFilteredImages();

    if (images.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No images match your search.</p></div>';
        return;
    }

    const visibleImages = images.slice(0, adminVisibleCount);

    container.innerHTML = visibleImages.map(img => {
        const hasCost = img.processingCost !== undefined && img.processingCost !== null;
        const thumbSrc = resolveAssetUrl(img.thumbPath ? '../' + img.thumbPath : '../' + img.imagePath);
        const isSelected = selectedImageIds.has(img.id);

        return `
            <div class="photo-card ${isSelected ? 'selected' : ''}" data-id="${img.id}">
                <input type="checkbox" class="photo-card-select"
                       ${isSelected ? 'checked' : ''}
                       onchange="toggleImageSelect(${img.id}, this.checked)"
                       onclick="event.stopPropagation()">
                <img class="photo-thumb" src="${thumbSrc}" alt="${escapeHtml(img.title)}"
                     onclick="showDetailModal(${img.id})"
                     onerror="this.src='../${img.imagePath}'">
                <div class="photo-card-body">
                    <div class="photo-card-title" title="${escapeHtml(img.title || img.filename)}">
                        ${escapeHtml(img.title || img.filename)}
                    </div>
                    <div class="photo-card-meta">
                        <span class="badge ${getCategoryBadgeClass(img.category)}">${getCategoryName(img.category)}</span>
                        <span class="photo-card-cost">${hasCost ? '$' + img.processingCost.toFixed(4) : ''}</span>
                    </div>
                    <div class="photo-card-actions">
                        <button class="btn btn-small btn-outline" onclick="showDetailModal(${img.id})">Details</button>
                        <button class="btn btn-small btn-danger" onclick="showDeleteModal(${img.id})">Delete</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Load More button if there are more images
    if (images.length > adminVisibleCount) {
        const remaining = images.length - adminVisibleCount;
        const nextBatch = Math.min(ADMIN_IMAGES_PER_PAGE, remaining);
        container.innerHTML += `
            <div class="load-more-row" style="grid-column: 1/-1; text-align: center; padding: 20px;">
                <p style="margin-bottom: 8px; color: var(--text-muted); font-size: 0.85rem;">
                    Showing ${adminVisibleCount} of ${images.length} images
                </p>
                <button class="btn btn-primary" onclick="loadMoreAdminImages()">
                    Load ${nextBatch} More
                </button>
            </div>`;
    }
}

/**
 * Get filtered and sorted images
 */
function getFilteredImages() {
    let images = metadataManager.getImages();

    // Category filter
    if (currentCategory !== 'all') {
        images = images.filter(i => i.category === currentCategory);
    }

    // Search filter
    const searchTerm = document.getElementById('image-search')?.value?.toLowerCase() || '';
    if (searchTerm) {
        images = images.filter(i => {
            const title = (i.title || '').toLowerCase();
            const filename = (i.filename || '').toLowerCase();
            const keywords = (i.keywords || []).join(' ').toLowerCase();
            return title.includes(searchTerm) || filename.includes(searchTerm) || keywords.includes(searchTerm);
        });
    }

    // Sort
    images = sortImageArray(images);

    return images;
}

/**
 * Sort images array based on current sort setting
 */
function sortImageArray(images) {
    const sorted = [...images];
    const [field, direction] = currentSort.split('-');

    sorted.sort((a, b) => {
        let valA, valB;
        switch (field) {
            case 'id':
                valA = a.id; valB = b.id; break;
            case 'title':
                valA = (a.title || a.filename || '').toLowerCase();
                valB = (b.title || b.filename || '').toLowerCase();
                break;
            case 'cost':
                valA = a.processingCost || 0;
                valB = b.processingCost || 0;
                break;
            default:
                valA = a.id; valB = b.id;
        }

        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
    });

    return sorted;
}

/**
 * Load more images in the admin grid
 */
function loadMoreAdminImages() {
    adminVisibleCount += ADMIN_IMAGES_PER_PAGE;
    renderImagesGrid();
}

/**
 * Filter images by search term (called on input)
 */
function filterImages() {
    adminVisibleCount = ADMIN_IMAGES_PER_PAGE;
    debouncedRenderGrid();
}

/**
 * Filter by category
 */
function filterByCategory(category) {
    currentCategory = category;
    adminVisibleCount = ADMIN_IMAGES_PER_PAGE;

    // Update active pill
    document.querySelectorAll('#tab-images .pill').forEach(pill => {
        pill.classList.toggle('active', pill.dataset.category === category);
    });

    renderImagesGrid();
}

/**
 * Sort images (called on select change)
 */
function sortImages() {
    const select = document.getElementById('sort-select');
    if (select) currentSort = select.value;
    adminVisibleCount = ADMIN_IMAGES_PER_PAGE;
    renderImagesGrid();
}

/**
 * Toggle selection of a single image
 */
function toggleImageSelect(imageId, checked) {
    if (checked) {
        selectedImageIds.add(imageId);
    } else {
        selectedImageIds.delete(imageId);
    }
    updateBulkBar();
    updateCardSelectionState(imageId, checked);
}

/**
 * Toggle all images selected
 */
function toggleSelectAll() {
    const checkbox = document.getElementById('select-all');
    const visible = getFilteredImages();

    if (checkbox.checked) {
        visible.forEach(img => selectedImageIds.add(img.id));
    } else {
        visible.forEach(img => selectedImageIds.delete(img.id));
    }

    renderImagesGrid();
    updateBulkBar();
}

/**
 * Clear all selections
 */
function clearSelection() {
    selectedImageIds.clear();
    const checkbox = document.getElementById('select-all');
    if (checkbox) checkbox.checked = false;
    renderImagesGrid();
    updateBulkBar();
}

/**
 * Get array of selected image IDs
 */
function getSelectedImageIds() {
    return [...selectedImageIds];
}

/**
 * Update the bulk action bar visibility
 */
function updateBulkBar() {
    const bar = document.getElementById('bulk-bar');
    const count = document.getElementById('bulk-count');

    if (selectedImageIds.size > 0) {
        bar.classList.remove('hidden');
        count.textContent = selectedImageIds.size + ' selected';
    } else {
        bar.classList.add('hidden');
    }
}

/**
 * Update visual selection state of a card
 */
function updateCardSelectionState(imageId, selected) {
    const card = document.querySelector(`.photo-card[data-id="${imageId}"]`);
    if (card) {
        card.classList.toggle('selected', selected);
    }
}

/**
 * Export images metadata to CSV
 */
function exportImagesCSV() {
    const images = metadataManager.getImages();
    const header = 'ID,Title,Filename,Category,Has Content,Keywords,NGSS Standards,Cost,Processing Time,Processed At\n';
    const rows = images.map(img => {
        const keywords = (img.keywords || []).join('; ');
        let ngss = '';
        if (img.ngssStandards && typeof img.ngssStandards === 'object') {
            const all = new Set();
            Object.values(img.ngssStandards).forEach(arr => { if (Array.isArray(arr)) arr.forEach(s => all.add(s)); });
            ngss = [...all].join('; ');
        }
        const cost = img.processingCost !== undefined ? img.processingCost.toFixed(4) : '';
        return `${img.id},"${(img.title || '').replace(/"/g, '""')}","${img.filename}",${img.category},${img.hasContent ? 'Yes' : 'No'},"${keywords}","${ngss}",${cost},"${img.processingTime || ''}",${img.processedAt || ''}`;
    }).join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sias-images-' + new Date().toISOString().split('T')[0] + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Images CSV exported', 'success');
}

// Expose globally
window.renderImagesGrid = renderImagesGrid;
window.filterImages = filterImages;
window.filterByCategory = filterByCategory;
window.sortImages = sortImages;
window.toggleImageSelect = toggleImageSelect;
window.toggleSelectAll = toggleSelectAll;
window.clearSelection = clearSelection;
window.getSelectedImageIds = getSelectedImageIds;
window.exportImagesCSV = exportImagesCSV;
window.loadMoreAdminImages = loadMoreAdminImages;

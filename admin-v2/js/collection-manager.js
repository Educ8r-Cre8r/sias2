/**
 * SIAS Admin Dashboard — Featured Collections Manager
 * Create, edit, delete, and activate featured collections.
 */

let workingCollections = [];
let editingCollectionId = null;
let collectionsDirty = false;

/**
 * Open the collections modal.
 */
function openCollectionsModal() {
    const modal = document.getElementById('collections-modal');
    if (!modal) return;

    // Load current collections from metadata
    const data = metadataManager.getData();
    workingCollections = JSON.parse(JSON.stringify(data.featuredCollections || []));
    collectionsDirty = false;
    editingCollectionId = null;

    modal.style.display = 'flex';
    renderCollectionsList();
    hideCollectionEditor();
}

/**
 * Close the collections modal.
 */
function closeCollectionsModal() {
    if (collectionsDirty) {
        if (!confirm('You have unsaved changes. Close anyway?')) return;
    }
    document.getElementById('collections-modal').style.display = 'none';
    editingCollectionId = null;
}

/**
 * Render the collections list.
 */
function renderCollectionsList() {
    const container = document.getElementById('collections-list');
    if (!container) return;

    if (workingCollections.length === 0) {
        container.innerHTML = '<p class="text-muted" style="padding: 20px; text-align: center;">No collections yet. Click "New Collection" to create one.</p>';
        return;
    }

    container.innerHTML = workingCollections.map(c => {
        const activeLabel = c.active
            ? '<span class="badge badge-success" style="font-size: 0.7rem;">Active</span>'
            : '';
        return `
            <div class="collection-row">
                <span class="collection-emoji">${c.emoji}</span>
                <div class="collection-info">
                    <strong>${escapeHtml(c.name)}</strong>
                    <span class="text-muted" style="font-size: 0.8rem;">${c.imageIds.length} images</span>
                </div>
                ${activeLabel}
                <div class="collection-actions">
                    <button class="btn btn-small ${c.active ? 'btn-secondary' : 'btn-primary'}" onclick="setActiveCollection('${c.id}')" title="${c.active ? 'Deactivate' : 'Set as active'}">
                        ${c.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button class="btn btn-small btn-secondary" onclick="editCollection('${c.id}')">Edit</button>
                    <button class="btn btn-small btn-danger" onclick="deleteCollection('${c.id}')">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Show the collection editor form for a new or existing collection.
 */
function editCollection(collectionId) {
    editingCollectionId = collectionId;
    const collection = collectionId
        ? workingCollections.find(c => c.id === collectionId)
        : null;

    const editor = document.getElementById('collection-editor');
    if (!editor) return;

    document.getElementById('collection-name-input').value = collection ? collection.name : '';
    document.getElementById('collection-emoji-input').value = collection ? collection.emoji : '';

    renderImagePicker(collection ? new Set(collection.imageIds) : new Set());
    editor.style.display = 'block';

    // Scroll editor into view
    editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Start creating a new collection.
 */
function newCollection() {
    editingCollectionId = null;
    editCollection(null);
}

/**
 * Hide the collection editor.
 */
function hideCollectionEditor() {
    const editor = document.getElementById('collection-editor');
    if (editor) editor.style.display = 'none';
    editingCollectionId = null;
}

/**
 * Render the image picker grid with checkboxes.
 */
function renderImagePicker(selectedIds) {
    const container = document.getElementById('collection-image-picker');
    if (!container) return;

    const images = metadataManager.getImages();
    const searchInput = document.getElementById('collection-image-search');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

    let filtered = images;
    if (searchTerm) {
        filtered = images.filter(img =>
            (img.title || '').toLowerCase().includes(searchTerm) ||
            (img.filename || '').toLowerCase().includes(searchTerm) ||
            (img.category || '').toLowerCase().includes(searchTerm)
        );
    }

    container.innerHTML = filtered.map(img => {
        const thumbUrl = resolveAssetUrl(`../images/${img.category}/thumbs/${img.filename}`);
        const isSelected = selectedIds.has(img.id);
        const title = escapeHtml(img.title || img.filename);

        return `
            <div class="picker-item ${isSelected ? 'selected' : ''}" data-image-id="${img.id}" onclick="togglePickerItem(this, ${img.id})" title="${title}">
                <img src="${thumbUrl}" alt="${title}" loading="lazy" onerror="this.style.background='#ddd'">
                ${isSelected ? '<div class="picker-check">&#10003;</div>' : ''}
            </div>
        `;
    }).join('');
}

/**
 * Toggle an image's selection in the picker.
 */
function togglePickerItem(el, imageId) {
    el.classList.toggle('selected');
    const isSelected = el.classList.contains('selected');
    const check = el.querySelector('.picker-check');

    if (isSelected && !check) {
        el.insertAdjacentHTML('beforeend', '<div class="picker-check">&#10003;</div>');
    } else if (!isSelected && check) {
        check.remove();
    }
}

/**
 * Get selected image IDs from the picker.
 */
function getPickerSelectedIds() {
    const items = document.querySelectorAll('#collection-image-picker .picker-item.selected');
    return Array.from(items).map(el => parseInt(el.dataset.imageId));
}

/**
 * Save the current editor form into the working collections array.
 */
function saveCollectionEditor() {
    const name = document.getElementById('collection-name-input').value.trim();
    const emoji = document.getElementById('collection-emoji-input').value.trim();

    if (!name) {
        showToast('Collection name is required', 'warning');
        return;
    }
    if (!emoji) {
        showToast('Emoji is required', 'warning');
        return;
    }

    const imageIds = getPickerSelectedIds();
    if (imageIds.length === 0) {
        showToast('Select at least one image', 'warning');
        return;
    }

    if (editingCollectionId) {
        // Update existing
        const idx = workingCollections.findIndex(c => c.id === editingCollectionId);
        if (idx >= 0) {
            workingCollections[idx].name = name;
            workingCollections[idx].emoji = emoji;
            workingCollections[idx].imageIds = imageIds;
        }
    } else {
        // Create new
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        workingCollections.push({
            id: id || 'collection_' + Date.now(),
            name,
            emoji,
            imageIds,
            active: workingCollections.length === 0 // First collection is active by default
        });
    }

    collectionsDirty = true;
    hideCollectionEditor();
    renderCollectionsList();
    showToast(`Collection "${name}" updated (unsaved)`, 'info');
}

/**
 * Set a collection as the active one (or deactivate it).
 */
function setActiveCollection(collectionId) {
    const collection = workingCollections.find(c => c.id === collectionId);
    if (!collection) return;

    if (collection.active) {
        // Deactivate
        collection.active = false;
    } else {
        // Activate this one, deactivate all others
        workingCollections.forEach(c => { c.active = false; });
        collection.active = true;
    }

    collectionsDirty = true;
    renderCollectionsList();
}

/**
 * Delete a collection from the working array.
 */
function deleteCollection(collectionId) {
    const collection = workingCollections.find(c => c.id === collectionId);
    if (!collection) return;

    if (!confirm(`Delete collection "${collection.name}"?`)) return;

    workingCollections = workingCollections.filter(c => c.id !== collectionId);
    collectionsDirty = true;
    renderCollectionsList();
    showToast(`Collection "${collection.name}" removed (unsaved)`, 'info');
}

/**
 * Save all collections to the Cloud Function.
 */
async function saveAllCollections() {
    const btn = document.getElementById('collections-save-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving...';
    }

    try {
        const fn = firebase.functions().httpsCallable('adminSaveFeaturedCollections');
        await fn({ collections: workingCollections });

        // Update local metadata
        const localData = metadataManager.getData();
        if (localData) localData.featuredCollections = JSON.parse(JSON.stringify(workingCollections));

        collectionsDirty = false;
        showToast('Collections saved! Changes will appear after deploy.', 'success');

        if (btn) {
            btn.textContent = 'Saved!';
            setTimeout(() => { btn.textContent = 'Save All'; btn.disabled = false; }, 2000);
        }
    } catch (error) {
        console.error('Save collections error:', error);
        showToast('Failed to save collections: ' + error.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Save All'; }
    }
}

/**
 * Filter the image picker by search term.
 */
function filterCollectionImages() {
    const selectedIds = new Set(getPickerSelectedIds());
    renderImagePicker(selectedIds);
}

// Expose globally
window.openCollectionsModal = openCollectionsModal;
window.closeCollectionsModal = closeCollectionsModal;
window.editCollection = editCollection;
window.newCollection = newCollection;
window.saveCollectionEditor = saveCollectionEditor;
window.setActiveCollection = setActiveCollection;
window.deleteCollection = deleteCollection;
window.saveAllCollections = saveAllCollections;
window.togglePickerItem = togglePickerItem;
window.filterCollectionImages = filterCollectionImages;
window.hideCollectionEditor = hideCollectionEditor;

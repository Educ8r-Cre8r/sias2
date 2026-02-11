/**
 * SIAS Admin Dashboard — Hotspot Position Editor
 * Drag-and-drop interface for repositioning image hotspot markers.
 */

const hotspotEditorState = {
    active: false,
    imageId: null,
    image: null,
    hotspots: [],
    originalHotspots: null,
    selectedHotspotId: null,
    isDragging: false,
    hasUnsavedChanges: false
};

/**
 * Initialize the hotspot editor for a given image
 */
async function initHotspotEditor(imageId) {
    const image = metadataManager.getImageById(imageId);
    if (!image) {
        showToast('Image not found', 'error');
        return;
    }

    hotspotEditorState.active = true;
    hotspotEditorState.imageId = imageId;
    hotspotEditorState.image = image;
    hotspotEditorState.selectedHotspotId = null;
    hotspotEditorState.isDragging = false;
    hotspotEditorState.hasUnsavedChanges = false;

    const container = document.getElementById('hotspot-editor-container');
    if (!container) return;
    container.classList.remove('hidden');
    container.innerHTML = '<div class="hotspot-editor"><p class="text-muted">Loading hotspots...</p></div>';

    // Load hotspot data
    const data = await loadHotspotData(image);
    hotspotEditorState.hotspots = data.hotspots;
    hotspotEditorState.originalHotspots = JSON.parse(JSON.stringify(data.hotspots));

    renderHotspotEditor();
}

/**
 * Fetch hotspot JSON for an image
 */
async function loadHotspotData(image) {
    const nameNoExt = image.filename.replace(/\.[^/.]+$/, '');
    const hotspotPath = `../hotspots/${image.category}/${nameNoExt}.json`;
    try {
        const response = await fetch(hotspotPath);
        if (!response.ok) return { hotspots: [] };
        return await response.json();
    } catch (e) {
        console.error('Failed to load hotspots:', e);
        return { hotspots: [] };
    }
}

/**
 * Render the full hotspot editor UI
 */
function renderHotspotEditor() {
    const { image, hotspots } = hotspotEditorState;
    const container = document.getElementById('hotspot-editor-container');
    if (!container || !image) return;

    const noHotspots = hotspots.length === 0;

    container.innerHTML = `
        <div class="hotspot-editor">
            <div class="hotspot-editor-header">
                <h3>Edit Hotspot Positions</h3>
                <button class="btn btn-small btn-outline" onclick="closeHotspotEditor()">Close Editor</button>
            </div>
            ${noHotspots
                ? '<p class="text-muted">No hotspots exist for this image. Use Re-process to generate hotspots with AI.</p>'
                : `
                    <p class="hotspot-editor-hint">Drag hotspot markers to reposition them. Click a marker to view its details and edit coordinates manually.</p>
                    <div class="hotspot-editor-workspace">
                        <div class="hotspot-editor-image-wrapper" id="hotspot-image-wrapper">
                            <img id="hotspot-editor-img" src="../${image.imagePath}" alt="${escapeHtml(image.title)}"
                                 draggable="false"
                                 onerror="this.src='../${image.thumbPath || image.imagePath}'">
                        </div>
                        <div class="hotspot-editor-sidebar" id="hotspot-editor-sidebar">
                            <p class="text-muted">Click a marker to view details.</p>
                        </div>
                    </div>
                    <div class="hotspot-editor-actions">
                        <span id="hotspot-save-status" class="text-muted" style="margin-right: auto;"></span>
                        <button class="btn btn-outline" onclick="revertHotspots()">Revert All</button>
                        <button class="btn btn-primary" id="hotspot-save-btn" onclick="saveHotspots()">Save Hotspots</button>
                    </div>
                `
            }
        </div>
    `;

    if (!noHotspots) {
        renderEditorMarkers();
    }
}

/**
 * Render draggable hotspot markers on the image
 */
function renderEditorMarkers() {
    const wrapper = document.getElementById('hotspot-image-wrapper');
    if (!wrapper) return;

    // Remove existing markers
    wrapper.querySelectorAll('.hotspot-editor-marker').forEach(m => m.remove());

    hotspotEditorState.hotspots.forEach(hotspot => {
        const marker = document.createElement('div');
        marker.className = 'hotspot-editor-marker';
        if (hotspot.id === hotspotEditorState.selectedHotspotId) {
            marker.classList.add('selected');
        }
        marker.style.left = hotspot.x;
        marker.style.top = hotspot.y;
        marker.textContent = hotspot.id;
        marker.dataset.hotspotId = hotspot.id;

        marker.addEventListener('mousedown', (e) => onMarkerMouseDown(e, hotspot.id));
        marker.addEventListener('touchstart', (e) => onMarkerTouchStart(e, hotspot.id), { passive: false });

        wrapper.appendChild(marker);
    });
}

// ─── Drag & Drop: Mouse ──────────────────────────────

function onMarkerMouseDown(e, hotspotId) {
    e.preventDefault();
    e.stopPropagation();

    hotspotEditorState.isDragging = true;
    hotspotEditorState.selectedHotspotId = hotspotId;

    const marker = e.target.closest('.hotspot-editor-marker');
    if (marker) marker.classList.add('dragging');

    // Highlight selected
    document.querySelectorAll('.hotspot-editor-marker').forEach(m => {
        m.classList.toggle('selected', parseInt(m.dataset.hotspotId) === hotspotId);
    });

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
}

function onDragMove(e) {
    if (!hotspotEditorState.isDragging) return;
    updateHotspotPosition(e.clientX, e.clientY);
}

function onDragEnd() {
    finishDrag();
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
}

// ─── Drag & Drop: Touch ──────────────────────────────

function onMarkerTouchStart(e, hotspotId) {
    e.preventDefault();

    hotspotEditorState.isDragging = true;
    hotspotEditorState.selectedHotspotId = hotspotId;

    const marker = e.target.closest('.hotspot-editor-marker');
    if (marker) marker.classList.add('dragging');

    document.querySelectorAll('.hotspot-editor-marker').forEach(m => {
        m.classList.toggle('selected', parseInt(m.dataset.hotspotId) === hotspotId);
    });

    document.addEventListener('touchmove', onTouchDragMove, { passive: false });
    document.addEventListener('touchend', onTouchDragEnd);
}

function onTouchDragMove(e) {
    e.preventDefault();
    if (!hotspotEditorState.isDragging || !e.touches[0]) return;
    updateHotspotPosition(e.touches[0].clientX, e.touches[0].clientY);
}

function onTouchDragEnd() {
    finishDrag();
    document.removeEventListener('touchmove', onTouchDragMove);
    document.removeEventListener('touchend', onTouchDragEnd);
}

// ─── Shared Drag Helpers ─────────────────────────────

function updateHotspotPosition(clientX, clientY) {
    const wrapper = document.getElementById('hotspot-image-wrapper');
    if (!wrapper) return;

    const rect = wrapper.getBoundingClientRect();
    let xPercent = ((clientX - rect.left) / rect.width) * 100;
    let yPercent = ((clientY - rect.top) / rect.height) * 100;

    // Clamp to 0–100
    xPercent = Math.max(0, Math.min(100, xPercent));
    yPercent = Math.max(0, Math.min(100, yPercent));

    const hotspot = hotspotEditorState.hotspots.find(
        h => h.id === hotspotEditorState.selectedHotspotId
    );
    if (!hotspot) return;

    hotspot.x = Math.round(xPercent) + '%';
    hotspot.y = Math.round(yPercent) + '%';

    // Move marker directly for smooth performance
    const marker = wrapper.querySelector(
        `[data-hotspot-id="${hotspotEditorState.selectedHotspotId}"]`
    );
    if (marker) {
        marker.style.left = hotspot.x;
        marker.style.top = hotspot.y;
    }

    updateCoordinateDisplay(hotspot);
    hotspotEditorState.hasUnsavedChanges = true;
}

function finishDrag() {
    hotspotEditorState.isDragging = false;

    document.querySelectorAll('.hotspot-editor-marker.dragging').forEach(
        m => m.classList.remove('dragging')
    );

    selectHotspot(hotspotEditorState.selectedHotspotId);
}

// ─── Sidebar: Selected Hotspot ───────────────────────

function selectHotspot(hotspotId) {
    hotspotEditorState.selectedHotspotId = hotspotId;
    const hotspot = hotspotEditorState.hotspots.find(h => h.id === hotspotId);

    // Update marker visuals
    document.querySelectorAll('.hotspot-editor-marker').forEach(m => {
        m.classList.toggle('selected', parseInt(m.dataset.hotspotId) === hotspotId);
    });

    const sidebar = document.getElementById('hotspot-editor-sidebar');
    if (!sidebar) return;

    if (!hotspot) {
        sidebar.innerHTML = '<p class="text-muted">Click a marker to view details.</p>';
        return;
    }

    sidebar.innerHTML = `
        <div class="hotspot-detail-card">
            <div class="hotspot-detail-number">${hotspot.id}</div>
            <h4>${escapeHtml(hotspot.label)}</h4>
            <div class="hotspot-coord-fields">
                <div class="hotspot-coord-field">
                    <label>X</label>
                    <input type="number" id="hotspot-x-input" value="${parseInt(hotspot.x)}"
                           min="0" max="100" step="1" onchange="onCoordManualChange()">
                    <span>%</span>
                </div>
                <div class="hotspot-coord-field">
                    <label>Y</label>
                    <input type="number" id="hotspot-y-input" value="${parseInt(hotspot.y)}"
                           min="0" max="100" step="1" onchange="onCoordManualChange()">
                    <span>%</span>
                </div>
            </div>
            <div class="hotspot-detail-fact">
                <strong>Fact:</strong>
                <p>${escapeHtml(hotspot.fact || '')}</p>
            </div>
            ${hotspot.vocabulary ? `
                <div class="hotspot-detail-vocab">
                    <strong>Vocabulary:</strong> ${escapeHtml(hotspot.vocabulary.term || '')}
                    <p class="text-muted">${escapeHtml(hotspot.vocabulary.definition || '')}</p>
                </div>
            ` : ''}
        </div>
    `;
}

function updateCoordinateDisplay(hotspot) {
    const xInput = document.getElementById('hotspot-x-input');
    const yInput = document.getElementById('hotspot-y-input');
    if (xInput) xInput.value = parseInt(hotspot.x);
    if (yInput) yInput.value = parseInt(hotspot.y);
}

function onCoordManualChange() {
    const hotspot = hotspotEditorState.hotspots.find(
        h => h.id === hotspotEditorState.selectedHotspotId
    );
    if (!hotspot) return;

    const xInput = document.getElementById('hotspot-x-input');
    const yInput = document.getElementById('hotspot-y-input');

    let x = parseInt(xInput.value) || 0;
    let y = parseInt(yInput.value) || 0;
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));

    hotspot.x = x + '%';
    hotspot.y = y + '%';

    hotspotEditorState.hasUnsavedChanges = true;
    renderEditorMarkers();
}

// ─── Save / Revert / Close ──────────────────────────

async function saveHotspots() {
    const { imageId, hotspots } = hotspotEditorState;
    if (!hotspots || hotspots.length === 0) return;

    // Validate coordinates
    for (const h of hotspots) {
        const x = parseInt(h.x);
        const y = parseInt(h.y);
        if (isNaN(x) || isNaN(y) || x < 0 || x > 100 || y < 0 || y > 100) {
            showToast(`Hotspot ${h.id} has invalid coordinates`, 'error');
            return;
        }
    }

    const saveBtn = document.getElementById('hotspot-save-btn');
    const statusEl = document.getElementById('hotspot-save-status');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
    if (statusEl) { statusEl.textContent = 'Saving hotspot positions to GitHub...'; }

    try {
        const updateFn = firebase.functions().httpsCallable('adminUpdateHotspots');
        const result = await updateFn({ imageId, hotspots });

        if (result.data && result.data.success) {
            hotspotEditorState.hasUnsavedChanges = false;
            hotspotEditorState.originalHotspots = JSON.parse(JSON.stringify(hotspots));
            showToast('Hotspot positions saved!', 'success');
            if (statusEl) statusEl.textContent = '';
        }
    } catch (error) {
        console.error('Save hotspots error:', error);
        showToast('Failed to save hotspots: ' + (error.message || 'Unknown error'), 'error');
        if (statusEl) statusEl.textContent = 'Save failed.';
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Hotspots'; }
    }
}

function revertHotspots() {
    if (!hotspotEditorState.originalHotspots) return;
    hotspotEditorState.hotspots = JSON.parse(JSON.stringify(hotspotEditorState.originalHotspots));
    hotspotEditorState.hasUnsavedChanges = false;
    hotspotEditorState.selectedHotspotId = null;
    renderEditorMarkers();
    selectHotspot(null);
    showToast('Hotspot positions reverted', 'info');
}

function closeHotspotEditor() {
    if (hotspotEditorState.hasUnsavedChanges) {
        if (!confirm('You have unsaved hotspot changes. Close editor anyway?')) return;
    }

    hotspotEditorState.active = false;
    hotspotEditorState.imageId = null;
    hotspotEditorState.image = null;
    hotspotEditorState.hotspots = [];
    hotspotEditorState.originalHotspots = null;
    hotspotEditorState.selectedHotspotId = null;
    hotspotEditorState.isDragging = false;
    hotspotEditorState.hasUnsavedChanges = false;

    const container = document.getElementById('hotspot-editor-container');
    if (container) {
        container.innerHTML = '';
        container.classList.add('hidden');
    }
}

// ─── Global Exports ──────────────────────────────────

window.initHotspotEditor = initHotspotEditor;
window.saveHotspots = saveHotspots;
window.revertHotspots = revertHotspots;
window.closeHotspotEditor = closeHotspotEditor;
window.onCoordManualChange = onCoordManualChange;

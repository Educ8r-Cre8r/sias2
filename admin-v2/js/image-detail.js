/**
 * SIAS Admin Dashboard — Image Detail Modal
 * Shows comprehensive details for a single image.
 */

let editModeActive = false;
let editImageId = null;
let editKeywords = [];
let editNgssStandards = {};

// PDF Viewer state
let pdfPreviewTab = 'lesson';
let pdfPreviewGrade = 'kindergarten';
let pdfPreviewImage = null;

const PDF_GRADE_LEVELS = [
    { key: 'kindergarten', label: 'K' },
    { key: 'first-grade', label: '1st' },
    { key: 'second-grade', label: '2nd' },
    { key: 'third-grade', label: '3rd' },
    { key: 'fourth-grade', label: '4th' },
    { key: 'fifth-grade', label: '5th' },
    { key: 'edp', label: 'EDP' }
];

const NGSS_GRADE_LEVELS = [
    { key: 'kindergarten', label: 'Kindergarten' },
    { key: 'grade1', label: '1st Grade' },
    { key: 'grade2', label: '2nd Grade' },
    { key: 'grade3', label: '3rd Grade' },
    { key: 'grade4', label: '4th Grade' },
    { key: 'grade5', label: '5th Grade' }
];

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

    // Build NGSS standards HTML (per-grade breakdown)
    let ngssHtml = '<span class="text-na">No standards</span>';
    if (image.ngssStandards && typeof image.ngssStandards === 'object') {
        const hasAny = Object.values(image.ngssStandards).some(arr => Array.isArray(arr) && arr.length > 0);
        if (hasAny) {
            ngssHtml = NGSS_GRADE_LEVELS.map(grade => {
                const standards = image.ngssStandards[grade.key] || [];
                const chips = standards.map(s => `<span class="detail-tag">${escapeHtml(s)}</span>`).join('');
                return `
                    <details class="ngss-grade-details" ${standards.length > 0 ? 'open' : ''}>
                        <summary class="ngss-grade-summary">${grade.label} (${standards.length})</summary>
                        <div class="detail-tags ngss-grade-tags">${chips || '<span class="text-na">None</span>'}</div>
                    </details>`;
            }).join('');
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
                <img class="detail-image" src="${resolveAssetUrl('../' + image.imagePath)}" alt="${escapeHtml(image.title)}"
                     onerror="this.src='${resolveAssetUrl('../' + (image.thumbPath || image.imagePath))}'">
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
                    <button class="btn btn-secondary btn-small" onclick="initHotspotEditor(${image.id})">Edit Hotspots</button>
                </div>
                <div class="button-help-text">
                    <p><strong>Edit Info</strong> — Change the image title, keywords, and NGSS standards</p>
                    <p><strong>Re-process</strong> — Regenerate all educational content, lesson guides, and hotspots using AI</p>
                    <p><strong>Delete Image</strong> — Permanently remove this image and all associated files</p>
                    ${image.hasContent ? `<p><strong>Edit Content</strong> — Edit educational content for any grade level and regenerate the lesson guide PDF</p>` : ''}
                    <p><strong>Edit Hotspots</strong> — Drag hotspot markers to reposition them on the image</p>
                </div>

                <div class="detail-section">
                    <h3>Associated Files (${totalFiles})</h3>
                    <p style="font-size: 0.8rem; color: var(--danger); margin: 4px 0 10px;">The count reflects content-facing files only. Any associated Firestore ratings, views, and/or comments will also be deleted.</p>
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
                    <details style="margin-bottom: 8px;">
                        <summary style="cursor: pointer; font-size: 0.85rem;">5E Lessons (${files.fiveE ? files.fiveE.length : 0})</summary>
                        <ul class="audit-file-list" style="margin-top: 4px;">${files.fiveE ? fileListHtml(files.fiveE) : ''}</ul>
                    </details>
                </div>

                ${image.hasContent ? `
                <div class="detail-section">
                    <h3>Preview PDFs</h3>
                    <div class="pdf-preview-tabs">
                        <button class="pdf-tab" onclick="openPdfViewer(${image.id}, 'lesson')">Lesson PDFs</button>
                        <button class="pdf-tab" onclick="openPdfViewer(${image.id}, '5e')">5E Lesson PDFs</button>
                    </div>
                </div>
                ` : ''}
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

                <div class="detail-section" id="detail-ngss-section">
                    <h3>NGSS Standards</h3>
                    <div id="detail-ngss-container">${ngssHtml}</div>
                </div>
            </div>
        </div>
        <div id="content-editor-container" class="hidden"></div>
        <div id="hotspot-editor-container" class="hidden"></div>
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

    // Deep copy NGSS standards for editing
    editNgssStandards = {};
    NGSS_GRADE_LEVELS.forEach(grade => {
        editNgssStandards[grade.key] = [...(image.ngssStandards?.[grade.key] || [])];
    });

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

    // Replace NGSS standards with editable tags
    renderEditableNgss();
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
 * Render editable NGSS standards with per-grade add/remove
 */
function renderEditableNgss() {
    const container = document.getElementById('detail-ngss-container');
    if (!container) return;

    const gradesHtml = NGSS_GRADE_LEVELS.map(grade => {
        const standards = editNgssStandards[grade.key] || [];
        const chipsHtml = standards.map((s, i) =>
            `<span class="detail-tag keyword-editable">${escapeHtml(s)}<button class="keyword-remove-btn" onclick="removeNgssStandard('${grade.key}', ${i})" title="Remove">&times;</button></span>`
        ).join('');

        return `
            <details class="ngss-grade-details" open>
                <summary class="ngss-grade-summary">${grade.label} (${standards.length})</summary>
                <div class="detail-tags ngss-grade-tags">
                    ${chipsHtml}
                    <div class="keyword-add-row">
                        <input type="text"
                            id="add-ngss-input-${grade.key}"
                            class="edit-input edit-input-small"
                            placeholder="e.g. K-LS1-1"
                            onkeydown="if(event.key==='Enter'){event.preventDefault();addNgssStandard('${grade.key}');}">
                        <button class="btn btn-small btn-outline" onclick="addNgssStandard('${grade.key}')">+</button>
                    </div>
                </div>
            </details>`;
    }).join('');

    container.innerHTML = gradesHtml;
}

/**
 * Add an NGSS standard to a specific grade level
 */
function addNgssStandard(gradeKey) {
    const input = document.getElementById('add-ngss-input-' + gradeKey);
    if (!input) return;
    const val = input.value.trim().toUpperCase();
    if (!val) return;

    if (!editNgssStandards[gradeKey]) {
        editNgssStandards[gradeKey] = [];
    }
    if (editNgssStandards[gradeKey].includes(val)) {
        showToast('Standard already exists for this grade', 'info');
        input.value = '';
        return;
    }

    editNgssStandards[gradeKey].push(val);
    input.value = '';
    renderEditableNgss();
    const newInput = document.getElementById('add-ngss-input-' + gradeKey);
    if (newInput) newInput.focus();
}

/**
 * Remove an NGSS standard from a specific grade level
 */
function removeNgssStandard(gradeKey, index) {
    if (editNgssStandards[gradeKey]) {
        editNgssStandards[gradeKey].splice(index, 1);
    }
    renderEditableNgss();
}

/**
 * Cancel edit mode and restore display
 */
function cancelEditMode() {
    editModeActive = false;
    editKeywords = [];
    editNgssStandards = {};
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
            keywords: editKeywords,
            ngssStandards: editNgssStandards
        });

        // Optimistic local update
        metadataManager.updateImageLocally(editImageId, {
            title: newTitle,
            keywords: [...editKeywords],
            ngssStandards: JSON.parse(JSON.stringify(editNgssStandards))
        });

        showToast('Image metadata saved!', 'success');
        editModeActive = false;

        // Refresh the modal to show updated data
        showDetailModal(editImageId);
        editImageId = null;
        editKeywords = [];
        editNgssStandards = {};

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

// ===================================
// PDF Viewer Functions (canvas-based via PDF.js)
// ===================================

let pdfDoc = null;
let pdfCurrentPage = 1;
let pdfTotalPages = 0;
let pdfRendering = false;

/**
 * Get the Storage URL for a PDF
 */
function getPdfUrl(image, tab, grade) {
    const nameNoExt = image.filename.replace(/\.[^.]+$/, '');
    const category = image.category;
    let path;
    if (tab === '5e') {
        path = `5e_lessons/${category}/${nameNoExt}-${grade}.pdf`;
    } else {
        path = `pdfs/${category}/${nameNoExt}-${grade}.pdf`;
    }
    return resolveAssetUrl(path);
}

/**
 * Open the full-screen PDF viewer modal
 */
function openPdfViewer(imageId, tab) {
    const image = metadataManager.getImageById(imageId);
    if (!image) return;

    pdfPreviewImage = image;
    pdfPreviewTab = tab || 'lesson';
    pdfPreviewGrade = 'kindergarten';

    renderPdfViewerShell();
    document.getElementById('pdf-viewer-modal').classList.remove('hidden');
    loadPdf();
}

/**
 * Close the PDF viewer modal
 */
function closePdfViewer() {
    document.getElementById('pdf-viewer-modal').classList.add('hidden');
    pdfDoc = null;
    pdfCurrentPage = 1;
    pdfTotalPages = 0;
}

/**
 * Render the PDF viewer modal shell (header + canvas container)
 */
function renderPdfViewerShell() {
    const body = document.getElementById('pdf-viewer-body');
    if (!body || !pdfPreviewImage) return;

    const url = getPdfUrl(pdfPreviewImage, pdfPreviewTab, pdfPreviewGrade);

    const tabsHtml = `
        <button class="pdf-tab ${pdfPreviewTab === 'lesson' ? 'active' : ''}" onclick="switchPdfTab('lesson')">Lesson PDFs</button>
        <button class="pdf-tab ${pdfPreviewTab === '5e' ? 'active' : ''}" onclick="switchPdfTab('5e')">5E Lesson PDFs</button>
    `;

    const pillsHtml = PDF_GRADE_LEVELS.map(g => {
        const isEdp = g.key === 'edp';
        const hiddenClass = (isEdp && pdfPreviewTab === '5e') ? ' hidden' : '';
        const activeClass = (g.key === pdfPreviewGrade) ? ' active' : '';
        return `<button class="pdf-grade${activeClass}${hiddenClass}" data-grade="${g.key}" onclick="switchPdfGrade('${g.key}')">${g.label}</button>`;
    }).join('');

    body.innerHTML = `
        <div class="pdf-viewer-header">
            <div class="pdf-preview-tabs">${tabsHtml}</div>
            <div class="pdf-grade-pills">${pillsHtml}</div>
            <div class="pdf-page-nav">
                <button class="btn btn-small btn-outline" onclick="pdfPrevPage()" id="pdf-prev-btn" disabled>&lsaquo; Prev</button>
                <span id="pdf-page-info">Loading...</span>
                <button class="btn btn-small btn-outline" onclick="pdfNextPage()" id="pdf-next-btn" disabled>Next &rsaquo;</button>
            </div>
            <a class="pdf-download-link" href="${url}" target="_blank">Download</a>
        </div>
        <div class="pdf-canvas-container" id="pdf-canvas-container">
            <canvas id="pdf-canvas"></canvas>
        </div>
    `;
}

/**
 * Load a PDF document and render the first page
 */
async function loadPdf() {
    const url = getPdfUrl(pdfPreviewImage, pdfPreviewTab, pdfPreviewGrade);

    // Show loading state
    const pageInfo = document.getElementById('pdf-page-info');
    if (pageInfo) pageInfo.textContent = 'Loading...';

    try {
        if (!window.pdfjsLib) {
            // PDF.js not loaded yet — wait briefly
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        if (!window.pdfjsLib) {
            throw new Error('PDF.js library not loaded');
        }

        pdfDoc = await window.pdfjsLib.getDocument(url).promise;
        pdfTotalPages = pdfDoc.numPages;
        pdfCurrentPage = 1;
        updatePageControls();
        renderPdfPage(pdfCurrentPage);
    } catch (err) {
        console.error('PDF load error:', err);
        const container = document.getElementById('pdf-canvas-container');
        if (container) {
            container.innerHTML = `
                <div style="padding: 60px; text-align: center; color: var(--text-secondary);">
                    <p>Unable to load PDF.</p>
                    <a href="${url}" target="_blank" class="btn btn-primary btn-small" style="margin-top: 12px;">Open in New Tab</a>
                </div>
            `;
        }
    }
}

/**
 * Render a specific page of the loaded PDF to the canvas
 */
async function renderPdfPage(pageNum) {
    if (!pdfDoc || pdfRendering) return;
    pdfRendering = true;

    try {
        const page = await pdfDoc.getPage(pageNum);
        const canvas = document.getElementById('pdf-canvas');
        const container = document.getElementById('pdf-canvas-container');
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d');

        // Scale to fit container width, with high-res for retina
        const containerWidth = container.clientWidth - 40; // 20px padding each side
        const viewport = page.getViewport({ scale: 1 });
        const scale = containerWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale: scale * (window.devicePixelRatio || 1) });

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        canvas.style.width = (containerWidth) + 'px';
        canvas.style.height = (viewport.height * scale) + 'px';

        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
    } catch (err) {
        console.error('PDF render error:', err);
    } finally {
        pdfRendering = false;
    }
}

/**
 * Update page navigation controls
 */
function updatePageControls() {
    const pageInfo = document.getElementById('pdf-page-info');
    const prevBtn = document.getElementById('pdf-prev-btn');
    const nextBtn = document.getElementById('pdf-next-btn');

    if (pageInfo) pageInfo.textContent = `Page ${pdfCurrentPage} of ${pdfTotalPages}`;
    if (prevBtn) prevBtn.disabled = pdfCurrentPage <= 1;
    if (nextBtn) nextBtn.disabled = pdfCurrentPage >= pdfTotalPages;
}

function pdfPrevPage() {
    if (pdfCurrentPage <= 1 || pdfRendering) return;
    pdfCurrentPage--;
    updatePageControls();
    renderPdfPage(pdfCurrentPage);
    const container = document.getElementById('pdf-canvas-container');
    if (container) container.scrollTop = 0;
}

function pdfNextPage() {
    if (pdfCurrentPage >= pdfTotalPages || pdfRendering) return;
    pdfCurrentPage++;
    updatePageControls();
    renderPdfPage(pdfCurrentPage);
    const container = document.getElementById('pdf-canvas-container');
    if (container) container.scrollTop = 0;
}

/**
 * Switch between Lesson and 5E tabs
 */
function switchPdfTab(tab) {
    pdfPreviewTab = tab;
    if (tab === '5e' && pdfPreviewGrade === 'edp') {
        pdfPreviewGrade = 'kindergarten';
    }
    renderPdfViewerShell();
    loadPdf();
}

/**
 * Switch to a different grade level
 */
function switchPdfGrade(grade) {
    pdfPreviewGrade = grade;
    renderPdfViewerShell();
    loadPdf();
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
    editNgssStandards = {};
}

// Expose globally
window.showDetailModal = showDetailModal;
window.closeDetailModal = closeDetailModal;
window.enterEditMode = enterEditMode;
window.cancelEditMode = cancelEditMode;
window.saveImageMetadata = saveImageMetadata;
window.addKeywordTag = addKeywordTag;
window.removeKeywordTag = removeKeywordTag;
window.addNgssStandard = addNgssStandard;
window.removeNgssStandard = removeNgssStandard;
window.openPdfViewer = openPdfViewer;
window.closePdfViewer = closePdfViewer;
window.switchPdfTab = switchPdfTab;
window.switchPdfGrade = switchPdfGrade;
window.pdfPrevPage = pdfPrevPage;
window.pdfNextPage = pdfNextPage;

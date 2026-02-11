/**
 * SIAS Admin Dashboard — Upload Manager (Bulk Upload Support)
 * Handles multi-image upload to Firebase Storage with drag-drop, validation,
 * progress tracking, and duplicate detection.
 *
 * Upload path: uploads/{category}/{filename}
 * The existing queueImage Cloud Function auto-detects uploads and
 * processQueue handles all content generation automatically.
 */

let uploadCategory = null;
let uploadFiles = []; // Array of { file, valid, error, status, duplicate }
let isUploading = false;

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB (matches storage.rules)

/**
 * Toggle the upload section collapsed/expanded
 */
function toggleUploadSection() {
    const section = document.querySelector('.upload-section');
    if (section) section.classList.toggle('collapsed');
}

/**
 * Select upload category
 */
function selectUploadCategory(category) {
    uploadCategory = category;

    // Update pill states
    document.querySelectorAll('.upload-category-pills .pill').forEach(pill => {
        pill.classList.toggle('selected', pill.dataset.uploadCategory === category);
    });

    updateUploadButton();
    clearUploadError();

    // Re-check duplicates if files already selected
    if (uploadFiles.length > 0) {
        checkDuplicates();
        renderFileList();
    }
}

/**
 * Handle drag over the dropzone
 */
function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    const dropzone = document.getElementById('upload-dropzone');
    if (dropzone) dropzone.classList.add('drag-over');
}

/**
 * Handle drag leave the dropzone
 */
function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    const dropzone = document.getElementById('upload-dropzone');
    if (dropzone) dropzone.classList.remove('drag-over');
}

/**
 * Handle file drop on the dropzone
 */
function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();

    const dropzone = document.getElementById('upload-dropzone');
    if (dropzone) dropzone.classList.remove('drag-over');

    if (isUploading) return;

    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
        processSelectedFiles(files);
    }
}

/**
 * Handle file input change
 */
function handleFileSelect(event) {
    if (isUploading) return;

    const files = event.target.files;
    if (files && files.length > 0) {
        processSelectedFiles(files);
    }
}

/**
 * Process selected files — validate each and build the list
 */
function processSelectedFiles(fileList) {
    clearUploadError();

    for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];

        // Check for duplicate filename in current selection
        const alreadySelected = uploadFiles.some(f => f.file.name === file.name);
        if (alreadySelected) continue;

        const entry = { file, valid: true, error: null, status: 'pending', duplicate: false };

        // Validate file type
        if (!ALLOWED_TYPES.includes(file.type)) {
            entry.valid = false;
            entry.error = 'Invalid type';
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            entry.valid = false;
            entry.error = `Too large (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
        }

        uploadFiles.push(entry);
    }

    // Check for duplicates in gallery
    checkDuplicates();
    renderFileList();
    updateUploadButton();

    // Reset file input so same files can be re-selected
    const fileInput = document.getElementById('upload-file-input');
    if (fileInput) fileInput.value = '';
}

/**
 * Check all selected files against existing gallery for duplicates
 */
function checkDuplicates() {
    const images = metadataManager.getImages();
    let duplicateCount = 0;

    for (const entry of uploadFiles) {
        const match = images.find(img =>
            img.filename && img.filename.toLowerCase() === entry.file.name.toLowerCase()
        );
        entry.duplicate = !!match;
        if (match) duplicateCount++;
    }

    const warning = document.getElementById('upload-duplicate-warning');
    const warningText = document.getElementById('upload-duplicate-text');
    if (warning && warningText) {
        if (duplicateCount > 0) {
            warningText.textContent = `${duplicateCount} file${duplicateCount > 1 ? 's' : ''} already exist${duplicateCount === 1 ? 's' : ''} in the gallery. Duplicates will be moved to the duplicates folder and skipped.`;
            warning.classList.remove('hidden');
        } else {
            warning.classList.add('hidden');
        }
    }
}

/**
 * Render the file list UI
 */
function renderFileList() {
    const container = document.getElementById('upload-file-list-container');
    const listEl = document.getElementById('upload-file-list');
    const countEl = document.getElementById('upload-file-count');

    if (!container || !listEl) return;

    if (uploadFiles.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    // Count valid files
    const validFiles = uploadFiles.filter(f => f.valid);
    const invalidFiles = uploadFiles.filter(f => !f.valid);
    const totalSize = validFiles.reduce((sum, f) => sum + f.file.size, 0);
    const totalMB = (totalSize / (1024 * 1024)).toFixed(1);

    let countText = `${validFiles.length} valid file${validFiles.length !== 1 ? 's' : ''} (${totalMB} MB)`;
    if (invalidFiles.length > 0) {
        countText += ` · ${invalidFiles.length} invalid`;
    }
    if (countEl) countEl.textContent = countText;

    // Render file rows
    listEl.innerHTML = uploadFiles.map((entry, index) => {
        const sizeMB = (entry.file.size / (1024 * 1024)).toFixed(2);
        const statusIcon = entry.status === 'uploaded' ? '✅'
            : entry.status === 'failed' ? '❌'
            : entry.status === 'uploading' ? '⬆️'
            : entry.valid ? '📷' : '⚠️';

        const statusText = entry.status === 'uploaded' ? 'Uploaded'
            : entry.status === 'failed' ? 'Failed'
            : entry.status === 'uploading' ? 'Uploading...'
            : !entry.valid ? entry.error
            : entry.duplicate ? 'Duplicate'
            : 'Ready';

        const statusClass = !entry.valid ? 'file-invalid'
            : entry.duplicate ? 'file-duplicate'
            : entry.status === 'uploaded' ? 'file-uploaded'
            : entry.status === 'failed' ? 'file-failed'
            : 'file-ready';

        const removeBtn = !isUploading && entry.status === 'pending'
            ? `<button class="btn-file-remove" onclick="removeFile(${index})" title="Remove">✕</button>`
            : '';

        return `<div class="upload-file-row ${statusClass}">
            <span class="file-icon">${statusIcon}</span>
            <span class="file-name" title="${entry.file.name}">${entry.file.name}</span>
            <span class="file-size">${sizeMB} MB</span>
            <span class="file-status">${statusText}</span>
            ${removeBtn}
        </div>`;
    }).join('');
}

/**
 * Remove a file from the list by index
 */
function removeFile(index) {
    if (isUploading) return;
    uploadFiles.splice(index, 1);
    checkDuplicates();
    renderFileList();
    updateUploadButton();
}

/**
 * Clear all selected files
 */
function clearUploadFiles() {
    if (isUploading) return;
    uploadFiles = [];

    const container = document.getElementById('upload-file-list-container');
    const fileInput = document.getElementById('upload-file-input');
    const duplicateWarning = document.getElementById('upload-duplicate-warning');

    if (container) container.classList.add('hidden');
    if (fileInput) fileInput.value = '';
    if (duplicateWarning) duplicateWarning.classList.add('hidden');

    clearUploadError();
    updateUploadButton();
}

/**
 * Update upload button enabled/disabled state and text
 */
function updateUploadButton() {
    const btn = document.getElementById('upload-btn');
    if (!btn) return;

    const validCount = uploadFiles.filter(f => f.valid).length;
    btn.disabled = !(uploadCategory && validCount > 0) || isUploading;

    if (validCount > 0) {
        btn.textContent = `Upload ${validCount} File${validCount !== 1 ? 's' : ''} & Process`;
    } else {
        btn.textContent = 'Upload & Process';
    }
}

/**
 * Show upload error message
 */
function showUploadError(message) {
    const errorEl = document.getElementById('upload-error');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }
}

/**
 * Clear upload error message
 */
function clearUploadError() {
    const errorEl = document.getElementById('upload-error');
    if (errorEl) errorEl.classList.add('hidden');
}

/**
 * Start the bulk upload to Firebase Storage (sequential)
 */
async function startUpload() {
    if (!uploadCategory) {
        showUploadError('Please select a category first.');
        return;
    }

    const validFiles = uploadFiles.filter(f => f.valid);
    if (validFiles.length === 0) {
        showUploadError('No valid files to upload.');
        return;
    }

    if (!storage) {
        showUploadError('Firebase Storage not initialized. Please refresh the page.');
        return;
    }

    clearUploadError();
    isUploading = true;

    // Hide dropzone and button, show bulk progress
    const btn = document.getElementById('upload-btn');
    const dropzone = document.getElementById('upload-dropzone');
    const bulkProgress = document.getElementById('upload-bulk-progress');
    const bulkStatus = document.getElementById('upload-bulk-status');
    const bulkCounter = document.getElementById('upload-bulk-counter');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressText = document.getElementById('upload-progress-text');
    const duplicateWarning = document.getElementById('upload-duplicate-warning');

    if (btn) btn.classList.add('hidden');
    if (dropzone) dropzone.style.display = 'none';
    if (duplicateWarning) duplicateWarning.classList.add('hidden');
    if (bulkProgress) bulkProgress.classList.remove('hidden');

    let successCount = 0;
    let failCount = 0;
    const total = validFiles.length;

    // Upload files sequentially
    for (let i = 0; i < validFiles.length; i++) {
        const entry = validFiles[i];
        const sanitizedName = entry.file.name.replace(/\s+/g, '_');

        // Update UI
        entry.status = 'uploading';
        if (bulkStatus) bulkStatus.textContent = `Uploading "${sanitizedName}"...`;
        if (bulkCounter) bulkCounter.textContent = `${i + 1} of ${total}`;
        renderFileList();

        try {
            // Upload to Firebase Storage
            const storagePath = `uploads/${uploadCategory}/${sanitizedName}`;
            const storageRef = storage.ref(storagePath);

            await new Promise((resolve, reject) => {
                const uploadTask = storageRef.put(entry.file);

                uploadTask.on('state_changed',
                    (snapshot) => {
                        const fileProgress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                        // Overall progress: completed files + current file progress
                        const overallProgress = Math.round(((i + fileProgress / 100) / total) * 100);
                        if (progressBar) progressBar.style.width = overallProgress + '%';
                        if (progressText) progressText.textContent = `${sanitizedName}: ${fileProgress}%`;
                    },
                    (error) => reject(error),
                    () => resolve()
                );
            });

            entry.status = 'uploaded';
            successCount++;

        } catch (error) {
            console.error(`Upload error for ${entry.file.name}:`, error);
            entry.status = 'failed';
            entry.error = error.message || 'Upload failed';
            failCount++;
        }

        renderFileList();
    }

    // All done
    isUploading = false;
    if (progressBar) progressBar.style.width = '100%';
    if (bulkProgress) bulkProgress.classList.add('hidden');

    // Show success
    const successEl = document.getElementById('upload-success');
    const successText = document.getElementById('upload-success-text');

    if (successText) {
        let msg = `${successCount} image${successCount !== 1 ? 's' : ''} uploaded!`;
        if (failCount > 0) {
            msg += ` (${failCount} failed)`;
        }
        successText.textContent = msg;
    }
    if (successEl) successEl.classList.remove('hidden');

    const categoryName = getCategoryName(uploadCategory);
    showToast(`${successCount} image${successCount !== 1 ? 's' : ''} uploaded to ${categoryName}!`, 'success', 5000);
}

/**
 * Reset the upload UI back to initial state (after success or to try again)
 */
function resetUpload() {
    uploadFiles = [];
    isUploading = false;

    // Reset file input
    const fileInput = document.getElementById('upload-file-input');
    if (fileInput) fileInput.value = '';

    // Hide everything
    const successEl = document.getElementById('upload-success');
    const fileListContainer = document.getElementById('upload-file-list-container');
    const bulkProgress = document.getElementById('upload-bulk-progress');
    const duplicateWarning = document.getElementById('upload-duplicate-warning');
    const dropzone = document.getElementById('upload-dropzone');
    const btn = document.getElementById('upload-btn');
    const progressBar = document.getElementById('upload-progress-bar');

    if (successEl) successEl.classList.add('hidden');
    if (fileListContainer) fileListContainer.classList.add('hidden');
    if (bulkProgress) bulkProgress.classList.add('hidden');
    if (duplicateWarning) duplicateWarning.classList.add('hidden');
    if (dropzone) dropzone.style.display = '';
    if (btn) {
        btn.classList.remove('hidden');
        btn.disabled = true;
        btn.textContent = 'Upload & Process';
    }
    if (progressBar) progressBar.style.width = '0%';

    clearUploadError();

    // Keep category selection (convenient for uploading multiple batches to same category)
    updateUploadButton();
}

// Expose globally
window.toggleUploadSection = toggleUploadSection;
window.selectUploadCategory = selectUploadCategory;
window.handleDragOver = handleDragOver;
window.handleDragLeave = handleDragLeave;
window.handleDrop = handleDrop;
window.handleFileSelect = handleFileSelect;
window.clearUploadFiles = clearUploadFiles;
window.removeFile = removeFile;
window.startUpload = startUpload;
window.resetUpload = resetUpload;

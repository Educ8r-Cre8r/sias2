/**
 * SIAS Admin Dashboard — Upload Manager
 * Handles image upload to Firebase Storage with drag-drop, validation,
 * progress tracking, and duplicate detection.
 *
 * Upload path: uploads/{category}/{filename}
 * The existing queueImage Cloud Function auto-detects uploads and
 * processQueue handles all content generation automatically.
 */

let uploadCategory = null;
let uploadFile = null;
let uploadTask = null;

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

    // Update preview meta if file is already selected
    updatePreviewMeta();
    updateUploadButton();
    clearUploadError();
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

    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
        processSelectedFile(files[0]);
    }
}

/**
 * Handle file input change
 */
function handleFileSelect(event) {
    const files = event.target.files;
    if (files && files.length > 0) {
        processSelectedFile(files[0]);
    }
}

/**
 * Process the selected file — validate and show preview
 */
function processSelectedFile(file) {
    clearUploadError();

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
        showUploadError('Invalid file type. Please select a JPEG, PNG, or WebP image.');
        return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        showUploadError(`File too large (${sizeMB} MB). Maximum size is 2 MB.`);
        return;
    }

    uploadFile = file;

    // Show preview
    const preview = document.getElementById('upload-preview');
    const previewImg = document.getElementById('upload-preview-img');
    const previewName = document.getElementById('upload-preview-name');

    if (preview) {
        // Create thumbnail preview
        const reader = new FileReader();
        reader.onload = function(e) {
            if (previewImg) previewImg.src = e.target.result;
        };
        reader.readAsDataURL(file);

        if (previewName) previewName.textContent = file.name;
        updatePreviewMeta();
        preview.classList.remove('hidden');
    }

    // Check for duplicates
    checkDuplicate(file.name);

    updateUploadButton();
}

/**
 * Update the preview meta text (file size + category)
 */
function updatePreviewMeta() {
    const previewMeta = document.getElementById('upload-preview-meta');
    if (!previewMeta || !uploadFile) return;

    const sizeMB = (uploadFile.size / (1024 * 1024)).toFixed(2);
    const categoryLabel = uploadCategory ? getCategoryName(uploadCategory) : 'No category selected';
    previewMeta.textContent = `${sizeMB} MB — ${categoryLabel}`;
}

/**
 * Check if a file with this name already exists in the gallery
 */
function checkDuplicate(filename) {
    const warning = document.getElementById('upload-duplicate-warning');
    const warningText = document.getElementById('upload-duplicate-text');
    if (!warning || !warningText) return;

    const images = metadataManager.getImages();
    const match = images.find(img => {
        return img.filename && img.filename.toLowerCase() === filename.toLowerCase();
    });

    if (match) {
        const catName = getCategoryName(match.category);
        warningText.textContent =
            `An image named "${filename}" already exists in ${catName} (ID: ${match.id}). ` +
            `Uploading will move the new file to the duplicates folder and skip processing.`;
        warning.classList.remove('hidden');
    } else {
        warning.classList.add('hidden');
    }
}

/**
 * Clear the selected file
 */
function clearUploadFile() {
    uploadFile = null;

    const preview = document.getElementById('upload-preview');
    const fileInput = document.getElementById('upload-file-input');
    const duplicateWarning = document.getElementById('upload-duplicate-warning');

    if (preview) preview.classList.add('hidden');
    if (fileInput) fileInput.value = '';
    if (duplicateWarning) duplicateWarning.classList.add('hidden');

    clearUploadError();
    updateUploadButton();
}

/**
 * Update upload button enabled/disabled state
 */
function updateUploadButton() {
    const btn = document.getElementById('upload-btn');
    if (btn) {
        btn.disabled = !(uploadCategory && uploadFile);
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
 * Start the upload to Firebase Storage
 */
async function startUpload() {
    // Final validation
    if (!uploadCategory) {
        showUploadError('Please select a category first.');
        return;
    }
    if (!uploadFile) {
        showUploadError('Please select an image file.');
        return;
    }
    if (!storage) {
        showUploadError('Firebase Storage not initialized. Please refresh the page.');
        return;
    }

    clearUploadError();

    // Hide the button and preview, show progress
    const btn = document.getElementById('upload-btn');
    const preview = document.getElementById('upload-preview');
    const progressContainer = document.getElementById('upload-progress');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressText = document.getElementById('upload-progress-text');
    const duplicateWarning = document.getElementById('upload-duplicate-warning');
    const dropzone = document.getElementById('upload-dropzone');

    if (btn) btn.classList.add('hidden');
    if (duplicateWarning) duplicateWarning.classList.add('hidden');
    if (dropzone) dropzone.style.display = 'none';
    if (progressContainer) progressContainer.classList.remove('hidden');

    // Upload to Firebase Storage at uploads/{category}/{filename}
    const storagePath = `uploads/${uploadCategory}/${uploadFile.name}`;
    const storageRef = storage.ref(storagePath);

    try {
        uploadTask = storageRef.put(uploadFile);

        // Track progress
        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                if (progressBar) progressBar.style.width = progress + '%';
                if (progressText) progressText.textContent = progress + '% uploading...';
            },
            (error) => {
                // Upload failed
                console.error('Upload error:', error);
                resetUploadUI();

                if (error.code === 'storage/unauthorized') {
                    showUploadError('Upload failed: Not authorized. Make sure you are signed in as admin.');
                } else if (error.code === 'storage/canceled') {
                    showUploadError('Upload cancelled.');
                } else {
                    showUploadError('Upload failed: ' + (error.message || 'Unknown error'));
                }
            },
            () => {
                // Upload successful
                if (progressBar) progressBar.style.width = '100%';
                if (progressText) progressText.textContent = '100% complete!';

                // Show success state after a brief delay
                setTimeout(() => {
                    if (progressContainer) progressContainer.classList.add('hidden');
                    if (preview) preview.classList.add('hidden');

                    const successEl = document.getElementById('upload-success');
                    if (successEl) successEl.classList.remove('hidden');

                    showToast(`"${uploadFile.name}" uploaded to ${getCategoryName(uploadCategory)}!`, 'success', 5000);
                }, 500);
            }
        );
    } catch (error) {
        console.error('Upload error:', error);
        resetUploadUI();
        showUploadError('Upload failed: ' + (error.message || 'Unknown error'));
    }
}

/**
 * Reset the upload UI back to initial state (after success or to try again)
 */
function resetUpload() {
    uploadFile = null;
    uploadTask = null;

    // Reset file input
    const fileInput = document.getElementById('upload-file-input');
    if (fileInput) fileInput.value = '';

    // Hide success, preview, progress
    const successEl = document.getElementById('upload-success');
    const preview = document.getElementById('upload-preview');
    const progressContainer = document.getElementById('upload-progress');
    const duplicateWarning = document.getElementById('upload-duplicate-warning');
    const dropzone = document.getElementById('upload-dropzone');
    const btn = document.getElementById('upload-btn');

    if (successEl) successEl.classList.add('hidden');
    if (preview) preview.classList.add('hidden');
    if (progressContainer) progressContainer.classList.add('hidden');
    if (duplicateWarning) duplicateWarning.classList.add('hidden');
    if (dropzone) dropzone.style.display = '';
    if (btn) {
        btn.classList.remove('hidden');
        btn.disabled = true;
    }

    // Reset progress bar
    const progressBar = document.getElementById('upload-progress-bar');
    if (progressBar) progressBar.style.width = '0%';

    clearUploadError();

    // Keep category selection (convenient for uploading multiple to same category)
    updateUploadButton();
}

/**
 * Reset just the upload UI elements (for error recovery, keeps file + category)
 */
function resetUploadUI() {
    const btn = document.getElementById('upload-btn');
    const progressContainer = document.getElementById('upload-progress');
    const dropzone = document.getElementById('upload-dropzone');
    const progressBar = document.getElementById('upload-progress-bar');

    if (btn) btn.classList.remove('hidden');
    if (progressContainer) progressContainer.classList.add('hidden');
    if (dropzone) dropzone.style.display = '';
    if (progressBar) progressBar.style.width = '0%';

    updateUploadButton();
}

// Expose globally
window.toggleUploadSection = toggleUploadSection;
window.selectUploadCategory = selectUploadCategory;
window.handleDragOver = handleDragOver;
window.handleDragLeave = handleDragLeave;
window.handleDrop = handleDrop;
window.handleFileSelect = handleFileSelect;
window.clearUploadFile = clearUploadFile;
window.startUpload = startUpload;
window.resetUpload = resetUpload;

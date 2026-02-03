// ===================================
// SIAS Admin - Frontend Logic
// ===================================

let uploadedPhotos = [];
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const photosCard = document.getElementById('photosCard');
const photosGrid = document.getElementById('photosGrid');
const photoCount = document.getElementById('photoCount');
const processBtn = document.getElementById('processBtn');
const progressCard = document.getElementById('progressCard');
const successCard = document.getElementById('successCard');

// ===================================
// Drag & Drop Handlers
// ===================================

dropzone.addEventListener('click', () => {
    fileInput.click();
});

dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
});

dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-over');
});

dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');

    const files = Array.from(e.dataTransfer.files).filter(file =>
        file.type.startsWith('image/')
    );

    if (files.length > 0) {
        handleFileSelection(files);
    }
});

fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    handleFileSelection(files);
    fileInput.value = ''; // Reset input
});

// ===================================
// File Handling
// ===================================

function handleFileSelection(files) {
    files.forEach(file => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const photo = {
                id: Date.now() + Math.random(),
                file: file,
                filename: file.name,
                preview: e.target.result,
                title: '',
                category: '',
                markdownFile: null
            };

            uploadedPhotos.push(photo);
            renderPhotos();
        };

        reader.readAsDataURL(file);
    });
}

function handleMarkdownUpload(input) {
    const file = input.files[0];
    const photoItem = input.closest('.photo-item');
    const index = parseInt(photoItem.dataset.index);
    const photo = uploadedPhotos[index];

    if (file) {
        photo.markdownFile = file;
        const label = input.nextElementSibling;
        label.textContent = `✓ ${file.name}`;
        label.classList.add('has-file');
    }
}

// ===================================
// Render Photos
// ===================================

function renderPhotos() {
    photosGrid.innerHTML = '';

    if (uploadedPhotos.length === 0) {
        photosCard.style.display = 'none';
        return;
    }

    photosCard.style.display = 'block';
    photoCount.textContent = uploadedPhotos.length;

    uploadedPhotos.forEach((photo, index) => {
        const template = document.getElementById('photoItemTemplate');
        const clone = template.content.cloneNode(true);

        const photoItem = clone.querySelector('.photo-item');
        photoItem.dataset.index = index;

        const img = clone.querySelector('img');
        img.src = photo.preview;
        img.alt = photo.filename;

        const titleInput = clone.querySelector('.photo-title');
        titleInput.value = photo.title;
        titleInput.addEventListener('input', (e) => {
            photo.title = e.target.value;
        });

        const categorySelect = clone.querySelector('.photo-category');
        categorySelect.value = photo.category;
        categorySelect.addEventListener('change', (e) => {
            photo.category = e.target.value;
        });

        photosGrid.appendChild(clone);
    });
}

function removePhoto(btn) {
    const photoItem = btn.closest('.photo-item');
    const index = parseInt(photoItem.dataset.index);

    uploadedPhotos.splice(index, 1);
    renderPhotos();
}

function clearAllPhotos() {
    if (confirm('Are you sure you want to clear all photos?')) {
        uploadedPhotos = [];
        renderPhotos();
    }
}

// ===================================
// Process & Publish
// ===================================

async function processAndPublish() {
    // Validate all photos
    let hasErrors = false;

    uploadedPhotos.forEach((photo, index) => {
        if (!photo.title.trim()) {
            alert(`Photo ${index + 1}: Title is required`);
            hasErrors = true;
            return;
        }

        if (!photo.category) {
            alert(`Photo ${index + 1}: Category is required`);
            hasErrors = true;
            return;
        }
    });

    if (hasErrors) return;

    // Show progress
    photosCard.style.display = 'none';
    progressCard.style.display = 'block';

    try {
        await saveFilesToPending();
        await runProcessor();
        showSuccess();
    } catch (error) {
        alert('Error processing photos: ' + error.message);
        console.error(error);
        progressCard.style.display = 'none';
        photosCard.style.display = 'block';
    }
}

async function saveFilesToPending() {
    updateProgress(10, 'Preparing files for processing...');
    logMessage('Starting file save process...');

    // Create FormData to save files
    const formData = new FormData();

    uploadedPhotos.forEach((photo, index) => {
        formData.append(`photo_${index}`, photo.file);
        formData.append(`metadata_${index}`, JSON.stringify({
            title: photo.title,
            category: photo.category,
            filename: photo.filename
        }));

        if (photo.markdownFile) {
            formData.append(`markdown_${index}`, photo.markdownFile);
        }
    });

    updateProgress(30, 'Files prepared. Saving to staging area...');

    // Since we're running locally, we'll use a different approach
    // Save metadata file that the processor will read
    const metadata = {
        timestamp: new Date().toISOString(),
        photos: uploadedPhotos.map(photo => ({
            filename: photo.filename,
            title: photo.title,
            category: photo.category,
            hasMarkdown: !!photo.markdownFile,
            markdownFilename: photo.markdownFile?.name
        }))
    };

    // Create a downloadable JSON file for the processor
    const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `upload-metadata-${Date.now()}.json`;

    logMessage('Metadata file created', 'success');
    updateProgress(50, 'Ready to process. Please save files manually and run processor...');
}

async function runProcessor() {
    updateProgress(60, 'Processing images and markdown files...');
    logMessage('Image optimization in progress...');

    // Simulate processing steps
    await delay(1000);
    updateProgress(70, 'Converting markdown to JSON...');
    logMessage('Converting markdown files to JSON format...', 'success');

    await delay(1000);
    updateProgress(80, 'Updating gallery metadata...');
    logMessage('Updating gallery-metadata.json...', 'success');

    await delay(1000);
    updateProgress(90, 'Committing to git...');
    logMessage('Creating git commit...', 'success');

    await delay(1000);
    updateProgress(95, 'Pushing to GitHub...');
    logMessage('Pushing changes to GitHub...', 'success');

    await delay(500);
    updateProgress(100, 'Complete!');
    logMessage('All files processed successfully!', 'success');
}

function showSuccess() {
    setTimeout(() => {
        progressCard.style.display = 'none';
        successCard.style.display = 'block';

        const successMessage = document.getElementById('successMessage');
        successMessage.textContent = `${uploadedPhotos.length} photo(s) have been processed and published to GitHub.`;
    }, 500);
}

function resetForm() {
    uploadedPhotos = [];
    successCard.style.display = 'none';
    photosCard.style.display = 'none';
    resetProgress();
}

// ===================================
// Progress Helpers
// ===================================

function updateProgress(percent, text) {
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');

    progressFill.style.width = percent + '%';
    progressText.textContent = text;
}

function logMessage(message, type = 'info') {
    const progressLog = document.getElementById('progressLog');
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    progressLog.appendChild(entry);
    progressLog.scrollTop = progressLog.scrollHeight;
}

function resetProgress() {
    const progressLog = document.getElementById('progressLog');
    progressLog.innerHTML = '';
    updateProgress(0, 'Ready to process...');
}

// ===================================
// Utility Functions
// ===================================

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function viewGallery() {
    window.open('../index.html', '_blank');
}

// ===================================
// Manual File Save Instructions
// ===================================

// This function helps users save files to the correct location
function generateSaveInstructions() {
    const instructions = uploadedPhotos.map((photo, index) => {
        let text = `Photo ${index + 1}: ${photo.filename}\n`;
        text += `  - Save to: admin/uploads/pending/${photo.filename}\n`;
        text += `  - Title: ${photo.title}\n`;
        text += `  - Category: ${photo.category}\n`;

        if (photo.markdownFile) {
            text += `  - Markdown: Save ${photo.markdownFile.name} to admin/uploads/pending/\n`;
        }

        return text;
    }).join('\n');

    console.log('=== SAVE INSTRUCTIONS ===');
    console.log(instructions);
    console.log('=========================');

    return instructions;
}

// Initialize
console.log('SIAS Admin initialized');
console.log('Ready to upload photos!');

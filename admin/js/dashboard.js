// ===================================
// SIAS Admin Dashboard
// Complete upload and manage in one
// ===================================

const API_BASE = 'http://localhost:3333/api';
let uploadedPhotos = [];
let allPhotos = [];
let currentFilter = 'all';
let photoToDelete = null;

// ===================================
// Tab Switching
// ===================================

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    if (tabName === 'upload') {
        document.getElementById('uploadTab').classList.add('active');
    } else if (tabName === 'manage') {
        document.getElementById('manageTab').classList.add('active');
        loadPhotos(); // Load photos when switching to manage tab
    }
}

// ===================================
// UPLOAD TAB - Drag & Drop
// ===================================

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');

dropzone.addEventListener('click', () => fileInput.click());

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
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) handleFileSelection(files);
});

fileInput.addEventListener('change', (e) => {
    handleFileSelection(Array.from(e.target.files));
    fileInput.value = '';
});

function handleFileSelection(files) {
    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            uploadedPhotos.push({
                id: Date.now() + Math.random(),
                file: file,
                filename: file.name,
                preview: e.target.result,
                title: '',
                category: '',
                markdownFile: null
            });
            renderUploadPhotos();
        };
        reader.readAsDataURL(file);
    });
}

function renderUploadPhotos() {
    const photosCard = document.getElementById('photosCard');
    const photosGrid = document.getElementById('photosGrid');
    const photoCount = document.getElementById('photoCount');

    if (uploadedPhotos.length === 0) {
        photosCard.style.display = 'none';
        return;
    }

    photosCard.style.display = 'block';
    photoCount.textContent = uploadedPhotos.length;
    photosGrid.innerHTML = '';

    uploadedPhotos.forEach((photo, index) => {
        const template = document.getElementById('photoItemTemplate');
        const clone = template.content.cloneNode(true);
        const item = clone.querySelector('.photo-item');

        item.dataset.index = index;
        item.querySelector('img').src = photo.preview;
        item.querySelector('.photo-title').value = photo.title;
        item.querySelector('.photo-category').value = photo.category;

        item.querySelector('.photo-title').addEventListener('input', (e) => {
            photo.title = e.target.value;
        });

        item.querySelector('.photo-category').addEventListener('change', (e) => {
            photo.category = e.target.value;
        });

        item.querySelector('.markdown-file').addEventListener('change', (e) => {
            photo.markdownFile = e.target.files[0] || null;
        });

        photosGrid.appendChild(clone);
    });
}

function removePhoto(btn) {
    const index = parseInt(btn.closest('.photo-item').dataset.index);
    uploadedPhotos.splice(index, 1);
    renderUploadPhotos();
}

function clearAllPhotos() {
    if (confirm('Clear all photos?')) {
        uploadedPhotos = [];
        renderUploadPhotos();
    }
}

// ===================================
// Upload Photos to Server
// ===================================

async function uploadPhotos() {
    console.log('Upload button clicked!');
    console.log('Photos to upload:', uploadedPhotos.length);

    // Validate
    for (let photo of uploadedPhotos) {
        console.log('Validating photo:', photo.title, 'Category:', photo.category, 'Markdown:', photo.markdownFile?.name);

        if (!photo.title.trim()) {
            alert('Please enter a title for all photos');
            return;
        }
        if (!photo.category) {
            alert('Please select a category for all photos');
            return;
        }
    }

    console.log('Validation passed, starting upload...');

    // Show progress
    document.getElementById('photosCard').style.display = 'none';
    document.getElementById('progressCard').style.display = 'block';

    updateProgress(10, 'Preparing upload...');
    logMessage('Starting upload process...');

    try {
        // Create FormData
        const formData = new FormData();

        const photosData = uploadedPhotos.map((photo, index) => {
            formData.append(`photo_${index}`, photo.file);
            if (photo.markdownFile) {
                formData.append(`markdown_${index}`, photo.markdownFile);
            }
            return {
                filename: photo.filename,
                title: photo.title,
                category: photo.category
            };
        });

        formData.append('photosData', JSON.stringify(photosData));

        updateProgress(30, 'Uploading files to server...');
        logMessage(`Uploading ${uploadedPhotos.length} photo(s)...`);

        // Upload to server
        console.log('Sending request to:', `${API_BASE}/upload`);
        const response = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            body: formData
        });

        console.log('Response status:', response.status);
        const result = await response.json();
        console.log('Server response:', result);

        if (result.success) {
            updateProgress(100, 'Complete!');
            logMessage(`✓ Successfully processed ${result.processed} photo(s)`, 'success');
            logMessage(`✓ Total gallery images: ${result.totalImages}`, 'success');
            logMessage('✓ Changes pushed to GitHub', 'success');

            setTimeout(() => {
                showSuccess(result);
            }, 500);
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Upload error:', error);
        console.error('Error stack:', error.stack);
        logMessage(`✗ Upload failed: ${error.message}`, 'error');
        alert('Upload failed: ' + error.message + '\n\nCheck browser console (F12) for details.\nMake sure the server is running (npm run serve)');
        document.getElementById('progressCard').style.display = 'none';
        document.getElementById('photosCard').style.display = 'block';
    }
}

function showSuccess(result) {
    document.getElementById('progressCard').style.display = 'none';
    document.getElementById('successCard').style.display = 'block';
    document.getElementById('successMessage').textContent =
        `${result.processed} photo(s) uploaded and published to GitHub! Total images: ${result.totalImages}`;
}

function resetUploadForm() {
    uploadedPhotos = [];
    document.getElementById('successCard').style.display = 'none';
    renderUploadPhotos();
    resetProgress();
}

function updateProgress(percent, text) {
    document.getElementById('progressFill').style.width = percent + '%';
    document.getElementById('progressText').textContent = text;
}

function logMessage(message, type = 'info') {
    const log = document.getElementById('progressLog');
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
}

function resetProgress() {
    document.getElementById('progressLog').innerHTML = '';
    updateProgress(0, '');
}

// ===================================
// MANAGE TAB - Photo Management
// ===================================

async function loadPhotos() {
    try {
        const response = await fetch(`${API_BASE}/photos`);
        const data = await response.json();

        if (data.success) {
            allPhotos = data.photos;
            updateStats(data);
            renderManagePhotos(allPhotos);
        }
    } catch (error) {
        console.error('Error loading photos:', error);
        document.getElementById('loadingState').innerHTML =
            '<p style="color: var(--danger);">Cannot connect to server. Make sure to run: npm run serve</p>';
    }
}

function updateStats(data) {
    document.getElementById('totalPhotos').textContent = data.totalImages;
    const categories = {};
    data.photos.forEach(p => categories[p.category] = (categories[p.category] || 0) + 1);
    document.getElementById('lifeScience').textContent = categories['life-science'] || 0;
    document.getElementById('earthScience').textContent = categories['earth-space-science'] || 0;
    document.getElementById('physicalScience').textContent = categories['physical-science'] || 0;
}

function renderManagePhotos(photos) {
    const loadingState = document.getElementById('loadingState');
    const photoGrid = document.getElementById('photoGrid');
    const emptyState = document.getElementById('emptyState');

    loadingState.style.display = 'none';

    if (photos.length === 0) {
        photoGrid.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';
    photoGrid.style.display = 'grid';
    photoGrid.innerHTML = '';

    photos.forEach(photo => {
        const card = createPhotoCard(photo);
        photoGrid.appendChild(card);
    });
}

function createPhotoCard(photo) {
    const card = document.createElement('div');
    card.className = 'photo-card';

    const categoryClass =
        photo.category === 'life-science' ? 'badge-life' :
        photo.category === 'earth-space-science' ? 'badge-earth' : 'badge-physical';

    const categoryLabel =
        photo.category === 'life-science' ? '🌱 Life Science' :
        photo.category === 'earth-space-science' ? '🌍 Earth & Space' : '🧪 Physical Science';

    // Encode image path to handle spaces and special characters
    const encodedImagePath = encodeURIComponent(photo.imagePath).replace(/%2F/g, '/');

    card.innerHTML = `
        <img src="/${encodedImagePath}" alt="${photo.title}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect fill=%22%23ddd%22 width=%22200%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23999%22%3EImage%3C/text%3E%3C/svg%3E'">
        <div class="photo-card-body">
            <div class="photo-card-title">${photo.title}</div>
            <div class="photo-card-meta">
                <span class="category-badge ${categoryClass}">${categoryLabel}</span>
                <div style="margin-top: 8px; font-size: 0.8rem;">ID: ${photo.id}</div>
            </div>
            <div class="photo-card-actions">
                <button class="btn btn-secondary btn-icon" onclick="viewPhoto(${photo.id})">👁️ View</button>
                <button class="btn btn-danger btn-icon" onclick="deletePhoto(${photo.id}, '${photo.title.replace(/'/g, "\\'")}')">🗑️ Delete</button>
            </div>
        </div>
    `;

    return card;
}

function filterCategory(category, button) {
    currentFilter = category;
    document.querySelectorAll('[data-filter]').forEach(btn => {
        btn.classList.remove('active', 'btn-primary');
        btn.classList.add('btn-secondary');
    });
    button.classList.remove('btn-secondary');
    button.classList.add('active', 'btn-primary');

    const filtered = category === 'all' ? allPhotos : allPhotos.filter(p => p.category === category);
    renderManagePhotos(filtered);
}

// Search
document.getElementById('searchInput')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allPhotos.filter(p =>
        p.title.toLowerCase().includes(term) || p.filename.toLowerCase().includes(term)
    );
    renderManagePhotos(filtered);
});

function viewPhoto(id) {
    const photo = allPhotos.find(p => p.id === id);
    if (photo) window.open(`../${photo.imagePath}`, '_blank');
}

// Delete
function deletePhoto(id, title) {
    photoToDelete = id;
    document.getElementById('deleteMessage').textContent =
        `Delete "${title}"? This will remove the image, content, and metadata. This cannot be undone.`;
    document.getElementById('deleteModal').style.display = 'flex';
}

function closeDeleteModal() {
    document.getElementById('deleteModal').style.display = 'none';
    photoToDelete = null;
}

async function confirmDelete() {
    if (!photoToDelete) return;

    try {
        const response = await fetch(`${API_BASE}/photos/${photoToDelete}`, { method: 'DELETE' });
        const result = await response.json();

        if (result.success) {
            allPhotos = allPhotos.filter(p => p.id !== photoToDelete);
            renderManagePhotos(allPhotos);
            updateStats({ totalImages: allPhotos.length, photos: allPhotos });
            showNotification('Photo deleted successfully!', 'success');
        } else {
            showNotification('Failed to delete photo', 'error');
        }
    } catch (error) {
        showNotification('Error deleting photo', 'error');
    } finally {
        closeDeleteModal();
    }
}

// ===================================
// Notifications
// ===================================

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        background: ${type === 'success' ? '#10b981' : '#ef4444'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 10px 15px rgba(0,0,0,0.1);
        z-index: 9999;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
    }
    .spinner {
        border: 3px solid #f3f3f3;
        border-top: 3px solid #4f46e5;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        animation: spin 1s linear infinite;
        margin: 0 auto;
    }
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    .modal {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }
    .modal-overlay {
        position: absolute;
        width: 100%;
        height: 100%;
    }
    .modal-content {
        background: white;
        border-radius: 16px;
        padding: 32px;
        max-width: 500px;
        position: relative;
        z-index: 1001;
    }
    .modal-footer {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        margin-top: 24px;
    }
`;
document.head.appendChild(style);

console.log('SIAS Admin Dashboard loaded');

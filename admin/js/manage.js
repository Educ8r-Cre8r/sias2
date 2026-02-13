// ===================================
// SIAS Admin - Photo Management
// ===================================

const API_BASE = 'http://localhost:3333/api';
let allPhotos = [];
let currentFilter = 'all';
let photoToDelete = null;

// ===================================
// Initialize
// ===================================

document.addEventListener('DOMContentLoaded', () => {
    loadPhotos();
    setupSearch();
});

// ===================================
// Load Photos
// ===================================

async function loadPhotos() {
    try {
        const response = await fetch(`${API_BASE}/photos`);
        const data = await response.json();

        if (data.success) {
            allPhotos = data.photos;
            updateStats(data);
            renderPhotos(allPhotos);
        } else {
            showError('Failed to load photos');
        }
    } catch (error) {
        console.error('Error loading photos:', error);
        showError('Cannot connect to API server. Make sure to run: npm run serve');
    }
}

// ===================================
// Update Statistics
// ===================================

function updateStats(data) {
    document.getElementById('totalPhotos').textContent = data.totalImages;

    const categories = {};
    data.photos.forEach(photo => {
        categories[photo.category] = (categories[photo.category] || 0) + 1;
    });

    document.getElementById('lifeScience').textContent = categories['life-science'] || 0;
    document.getElementById('earthScience').textContent = categories['earth-space-science'] || 0;
    document.getElementById('physicalScience').textContent = categories['physical-science'] || 0;
}

// ===================================
// Render Photos
// ===================================

function renderPhotos(photos) {
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

// ===================================
// Create Photo Card
// ===================================

function createPhotoCard(photo) {
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.dataset.id = photo.id;
    card.dataset.category = photo.category;

    const categoryClass =
        photo.category === 'life-science' ? 'badge-life' :
        photo.category === 'earth-space-science' ? 'badge-earth' : 'badge-physical';

    const categoryLabel =
        photo.category === 'life-science' ? '🌱 Life Science' :
        photo.category === 'earth-space-science' ? '🌍 Earth & Space' : '🧪 Physical Science';

    card.innerHTML = `
        <img src="../${photo.imagePath}" alt="${photo.title}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect fill=%22%23ddd%22 width=%22200%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23999%22%3EImage%3C/text%3E%3C/svg%3E'">
        <div class="photo-card-body">
            <div class="photo-card-title">${photo.title}</div>
            <div class="photo-card-meta">
                <span class="category-badge ${categoryClass}">${categoryLabel}</span>
                <div style="margin-top: 8px; font-size: 0.8rem;">
                    ID: ${photo.id} | ${photo.filename}
                </div>
            </div>
            <div class="photo-card-actions">
                <button class="btn btn-secondary btn-icon" onclick="viewPhoto(${photo.id})" title="View full size">
                    👁️ View
                </button>
                <button class="btn btn-danger btn-icon" onclick="deletePhoto(${photo.id}, '${photo.title.replace(/'/g, "\\'")}')">
                    🗑️ Delete
                </button>
            </div>
        </div>
    `;

    return card;
}

// ===================================
// Filter by Category
// ===================================

function filterCategory(category, button) {
    currentFilter = category;

    // Update active button
    document.querySelectorAll('[data-filter]').forEach(btn => {
        btn.classList.remove('active', 'btn-primary');
        btn.classList.add('btn-secondary');
    });
    button.classList.remove('btn-secondary');
    button.classList.add('active', 'btn-primary');

    // Filter photos
    const filtered = category === 'all'
        ? allPhotos
        : allPhotos.filter(p => p.category === category);

    renderPhotos(filtered);
}

// ===================================
// Search
// ===================================

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    let searchTimeout;

    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            searchPhotos(e.target.value);
        }, 300);
    });
}

function searchPhotos(term) {
    if (!term.trim()) {
        filterCategory(currentFilter, document.querySelector(`[data-filter="${currentFilter}"]`));
        return;
    }

    const filtered = allPhotos.filter(photo =>
        photo.title.toLowerCase().includes(term.toLowerCase()) ||
        photo.filename.toLowerCase().includes(term.toLowerCase())
    );

    renderPhotos(filtered);
}

// ===================================
// View Photo
// ===================================

function viewPhoto(id) {
    const photo = allPhotos.find(p => p.id === id);
    if (photo) {
        window.open(`../${photo.imagePath}`, '_blank');
    }
}

// ===================================
// Delete Photo
// ===================================

function deletePhoto(id, title) {
    photoToDelete = id;
    document.getElementById('deleteMessage').textContent =
        `Are you sure you want to delete "${title}"? This will remove the image file, content file, and metadata entry. This action cannot be undone.`;
    document.getElementById('deleteModal').classList.add('show');
}

function closeDeleteModal() {
    document.getElementById('deleteModal').classList.remove('show');
    photoToDelete = null;
}

async function confirmDelete() {
    if (!photoToDelete) return;

    const modal = document.getElementById('deleteModal');
    const deleteBtn = modal.querySelector('.btn-danger');
    deleteBtn.disabled = true;
    deleteBtn.textContent = 'Deleting...';

    try {
        const response = await fetch(`${API_BASE}/photos/${photoToDelete}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            // Remove from array
            allPhotos = allPhotos.filter(p => p.id !== photoToDelete);

            // Reload display
            filterCategory(currentFilter, document.querySelector(`[data-filter="${currentFilter}"]`));
            updateStats({ totalImages: allPhotos.length, photos: allPhotos });

            // Show success message
            showSuccess('Photo deleted successfully!');
        } else {
            showError(result.error || 'Failed to delete photo');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showError('Failed to delete photo. Make sure API server is running.');
    } finally {
        closeDeleteModal();
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Delete';
    }
}

// ===================================
// Notifications
// ===================================

function showSuccess(message) {
    showNotification(message, 'success');
}

function showError(message) {
    showNotification(message, 'error');
}

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

// Add animations
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
`;
document.head.appendChild(style);

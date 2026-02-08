/**
 * Science In A Snapshot - Main JavaScript
 * Gallery functionality, category filtering, modal system, and content rendering
 */

// State management
const state = {
  galleryData: null,
  currentCategory: 'all',
  searchQuery: '',
  loadedContent: {}, // Cache for loaded educational content
  selectedGradeLevel: 'third-grade', // Default to third grade content
  visibleCount: 24, // Number of images currently visible
  filteredImages: [], // Current filtered image set
  ngssIndex: null, // NGSS standards index (loaded on demand)
  ngssFilter: null, // Active NGSS filter { type, code, imageIds }
  collectionFilter: false, // My Collection filter active
  featuredFilter: false // Featured Collection filter active
};

const IMAGES_PER_PAGE = 24;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  initializeRandomHeroImage();
  initializeApp();
  initializeParticles();
  initializeModalScrollButtons();
});

/**
 * Initialize random hero background image
 */
function initializeRandomHeroImage() {
  // Array of hero images
  const heroImages = [
    { webp: 'hero_images/webp/hero_img01.webp', jpg: 'hero_images/thumbs/hero_img01.jpg', original: 'hero_images/hero_img01.jpg' },
    { webp: 'hero_images/webp/hero_img02.webp', jpg: 'hero_images/thumbs/hero_img02.jpg', original: 'hero_images/hero_img02.jpg' },
    { webp: 'hero_images/webp/hero_img03.webp', jpg: 'hero_images/thumbs/hero_img03.jpg', original: 'hero_images/hero_img03.jpg' },
    { webp: 'hero_images/webp/hero_img04.webp', jpg: 'hero_images/thumbs/hero_img04.jpg', original: 'hero_images/hero_img04.jpg' },
    { webp: 'hero_images/webp/hero_img05.webp', jpg: 'hero_images/thumbs/hero_img05.jpg', original: 'hero_images/hero_img05.jpg' }
  ];

  // Get the last shown image from localStorage to avoid immediate repeats
  const lastShownImage = localStorage.getItem('lastHeroImage');

  // Filter out the last shown image if it exists
  let availableImages = heroImages;
  if (lastShownImage && heroImages.length > 1) {
    availableImages = heroImages.filter(img => img.original !== lastShownImage);
  }

  // Select a random image from available images
  const randomIndex = Math.floor(Math.random() * availableImages.length);
  const selectedImage = availableImages[randomIndex];

  // Store the selected image for next time
  localStorage.setItem('lastHeroImage', selectedImage.original);

  // Apply the background image with WebP support
  const heroBackground = document.getElementById('hero-background');
  if (heroBackground) {
    // Check WebP support and use optimized image
    const testWebP = new Image();
    testWebP.onload = function() {
      heroBackground.style.backgroundImage = `url('${selectedImage.webp}')`;
    };
    testWebP.onerror = function() {
      heroBackground.style.backgroundImage = `url('${selectedImage.jpg}')`;
    };
    testWebP.src = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
    // Set jpg immediately as fallback, webp will override if supported
    heroBackground.style.backgroundImage = `url('${selectedImage.jpg}')`;
    console.log('[Hero] Selected image:', selectedImage.original);
  }
}

/**
 * Initialize the application
 */
async function initializeApp() {
  updateCopyrightYear();
  setupEventListeners();
  showSkeletonPlaceholders(12);
  await loadGalleryData();
  computeRecentImages();
  updateCategoryBadges();
  updateFeaturedBadge();
  loadFiltersFromURL(); // Apply filters from URL if present
  renderGallery();
}

/**
 * Auto-update copyright year
 */
function updateCopyrightYear() {
  const currentYear = new Date().getFullYear();
  const yearElements = document.querySelectorAll('#current-year, #footer-year');
  yearElements.forEach(el => {
    el.textContent = currentYear;
  });
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Category filter buttons (exclude collection button — it has its own onclick)
  const filterButtons = document.querySelectorAll('.filter-btn:not(.collection-filter-btn):not(.featured-filter-btn)');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', handleCategoryFilter);
  });

  // Search input
  const searchInput = document.getElementById('gallery-search');
  if (searchInput) {
    searchInput.addEventListener('input', handleSearch);
  }

  // Grade level selector
  const gradeLevelSelect = document.getElementById('grade-level-select');
  if (gradeLevelSelect) {
    gradeLevelSelect.addEventListener('change', handleGradeLevelChange);
  }

  // Modal close events
  const modalOverlay = document.querySelector('.modal-overlay');
  const closeBtn = document.querySelector('.close-btn');

  if (modalOverlay) {
    modalOverlay.addEventListener('click', closeModal);
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
  }

  // NGSS search input
  const ngssInput = document.getElementById('ngss-search');
  if (ngssInput) {
    ngssInput.addEventListener('input', handleNGSSSearch);
    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
      const suggestionsEl = document.getElementById('ngss-suggestions');
      const ngssWrapper = document.querySelector('.ngss-search-wrapper');
      if (suggestionsEl && ngssWrapper && !ngssWrapper.contains(e.target)) {
        suggestionsEl.style.display = 'none';
      }
    });
  }

  // Keyboard events
  document.addEventListener('keydown', handleKeyboard);

  // Parallax effect on scroll
  window.addEventListener('scroll', handleParallax);

  // Scroll to gallery button visibility
  window.addEventListener('scroll', handleScrollToGalleryButton);

  // Back to Filters button visibility
  window.addEventListener('scroll', handleBackToFiltersButton);
}

/**
 * Load gallery metadata from JSON file
 */
async function loadGalleryData() {
  try {
    const response = await fetch('gallery-metadata.json');
    if (!response.ok) {
      throw new Error('Failed to load gallery data');
    }
    state.galleryData = await response.json();
    hideLoading();
  } catch (error) {
    console.error('Error loading gallery:', error);
    showError('Failed to load gallery. Please refresh the page.');
  }
}

/**
 * Update URL with current filter state (deep linking)
 */
function updateURL() {
  const params = new URLSearchParams();

  // Add category if not 'all'
  if (state.currentCategory !== 'all') {
    params.set('category', state.currentCategory);
  }

  // Add grade level if not the default 'third-grade'
  if (state.selectedGradeLevel !== 'third-grade') {
    params.set('grade', state.selectedGradeLevel);
  }

  // Add search query if present
  if (state.searchQuery) {
    params.set('search', state.searchQuery);
  }

  // Add collection filter if active
  if (state.collectionFilter) {
    params.set('collection', 'mine');
  }

  // Add featured filter if active
  if (state.featuredFilter) {
    params.set('featured', 'pollination');
  }

  // Update URL without reloading the page
  const newURL = params.toString() ? `?${params}` : window.location.pathname;
  window.history.pushState({}, '', newURL);
}

/**
 * Load filters from URL parameters on page load (deep linking)
 */
function loadFiltersFromURL() {
  const params = new URLSearchParams(window.location.search);

  // Apply category filter from URL
  if (params.has('category')) {
    const category = params.get('category');
    state.currentCategory = category;

    // Update UI to reflect the category (exclude collection button)
    document.querySelectorAll('.filter-btn:not(.collection-filter-btn):not(.featured-filter-btn)').forEach(btn => {
      if (btn.dataset.category === category) {
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
      }
    });
  }

  // Apply grade level from URL
  if (params.has('grade')) {
    const grade = params.get('grade');
    state.selectedGradeLevel = grade;

    // Update dropdown to reflect the grade level
    const gradeLevelSelect = document.getElementById('grade-level-select');
    if (gradeLevelSelect) {
      gradeLevelSelect.value = grade;
    }
  }

  // Apply search query from URL
  if (params.has('search')) {
    const search = params.get('search');
    state.searchQuery = search;

    // Update search input to reflect the query
    const searchInput = document.getElementById('gallery-search');
    if (searchInput) {
      searchInput.value = search;
    }
  }

  // Apply collection filter from URL
  if (params.get('collection') === 'mine') {
    state.collectionFilter = true;
    const collectionBtn = document.getElementById('my-collection-btn');
    if (collectionBtn) {
      collectionBtn.classList.add('active');
      collectionBtn.setAttribute('aria-pressed', 'true');
    }
  }

  // Apply featured filter from URL
  if (params.get('featured') === 'pollination') {
    state.featuredFilter = true;
    const featuredBtn = document.getElementById('featured-pollination-btn');
    if (featuredBtn) {
      featuredBtn.classList.add('active');
      featuredBtn.setAttribute('aria-pressed', 'true');
    }
  }
}

/**
 * Determine if an image is "recently added"
 * Currently uses the top N highest IDs as a proxy for recency.
 * TODO: Switch to dateAdded field when available in gallery-metadata.json
 */
const RECENT_IMAGE_COUNT = 6; // Number of images considered "new"
let recentImageIds = new Set();

function computeRecentImages() {
  if (!state.galleryData || !state.galleryData.images) return;
  const sorted = [...state.galleryData.images].sort((a, b) => b.id - a.id);
  recentImageIds = new Set(sorted.slice(0, RECENT_IMAGE_COUNT).map(img => img.id));
}

/**
 * Show skeleton loading placeholders in the gallery grid
 */
function showSkeletonPlaceholders(count = 12) {
  const galleryGrid = document.getElementById('gallery-grid');
  if (!galleryGrid) return;

  galleryGrid.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const skeleton = document.createElement('div');
    skeleton.className = 'gallery-item skeleton-card';
    skeleton.setAttribute('aria-hidden', 'true');
    skeleton.innerHTML = `
      <div class="skeleton-image shimmer"></div>
      <div class="skeleton-info">
        <div class="skeleton-title shimmer"></div>
        <div class="skeleton-category shimmer"></div>
      </div>
      <div class="skeleton-stats">
        <div class="skeleton-bar shimmer"></div>
      </div>
    `;
    galleryGrid.appendChild(skeleton);
  }
}

/**
 * Update category filter badges with image counts
 */
function updateCategoryBadges() {
  if (!state.galleryData || !state.galleryData.images) return;

  const images = state.galleryData.images;
  const counts = {
    'all': images.length,
    'life-science': 0,
    'earth-space-science': 0,
    'physical-science': 0
  };

  images.forEach(img => {
    if (counts.hasOwnProperty(img.category)) {
      counts[img.category]++;
    }
  });

  document.querySelectorAll('.filter-btn:not(.collection-filter-btn):not(.featured-filter-btn)').forEach(btn => {
    const category = btn.dataset.category;
    const count = counts[category] || 0;

    // Remove existing badge if any
    const existingBadge = btn.querySelector('.category-badge');
    if (existingBadge) existingBadge.remove();

    // Add badge
    const badge = document.createElement('span');
    badge.className = 'category-badge';
    badge.textContent = count;
    btn.appendChild(badge);
  });
}

/**
 * Render gallery items
 */
function renderGallery() {
  const galleryGrid = document.getElementById('gallery-grid');
  const emptyState = document.getElementById('empty-state');

  if (!state.galleryData || !state.galleryData.images) {
    showEmptyState('No images available.');
    return;
  }

  // Filter images based on category and search
  let filteredImages = state.galleryData.images;

  if (state.currentCategory !== 'all') {
    filteredImages = filteredImages.filter(
      img => img.category === state.currentCategory
    );
  }

  if (state.searchQuery) {
    const query = state.searchQuery.toLowerCase();
    filteredImages = filteredImages.filter(img =>
      img.title.toLowerCase().includes(query) ||
      img.filename.toLowerCase().includes(query) ||
      img.category.toLowerCase().includes(query) ||
      (Array.isArray(img.keywords) && img.keywords.some(kw => kw.toLowerCase().includes(query)))
    );
  }

  // Apply NGSS standard filter
  if (state.ngssFilter && state.ngssFilter.imageIds.length > 0) {
    const ngssIds = new Set(state.ngssFilter.imageIds);
    filteredImages = filteredImages.filter(img => ngssIds.has(img.id));
  }

  // Apply My Collection filter
  if (state.collectionFilter && typeof isPhotoFavorited === 'function') {
    filteredImages = filteredImages.filter(img => isPhotoFavorited(img.id));
  }

  // Apply Featured Collection filter (keyword-based)
  if (state.featuredFilter) {
    filteredImages = filteredImages.filter(img =>
      Array.isArray(img.keywords) && img.keywords.some(kw => kw.toLowerCase() === 'pollination')
    );
  }

  // Store filtered images in state for Load More
  state.filteredImages = filteredImages;

  // Clear grid
  galleryGrid.innerHTML = '';

  // Remove existing Load More button
  const existingLoadMore = document.getElementById('load-more-container');
  if (existingLoadMore) {
    existingLoadMore.remove();
  }

  if (filteredImages.length === 0) {
    if (state.collectionFilter) {
      showEmptyState('Your collection is empty. Open a photo\'s lesson content and tap the heart to add it to your collection!');
    } else if (state.featuredFilter) {
      showEmptyState('No photos found for this featured collection.');
    } else {
      showEmptyState('No images found matching your criteria.');
    }
    return;
  }

  // Hide empty state
  if (emptyState) {
    emptyState.style.display = 'none';
  }

  // Render only up to visibleCount images
  const imagesToShow = filteredImages.slice(0, state.visibleCount);
  imagesToShow.forEach(image => {
    const item = createGalleryItem(image);
    galleryGrid.appendChild(item);
  });

  // Show Load More button if there are more images
  updateLoadMoreButton();

  // Initialize tutorial hints for first-time users
  initializeTutorialHints();

  // Load ratings and views for all photos
  if (typeof loadAllStats === 'function') {
    loadAllStats();
  }

  // Load comment counts for gallery cards
  if (typeof loadAllCommentCounts === 'function') {
    loadAllCommentCounts();
  }
}

/**
 * Load more images into the gallery
 */
function loadMoreImages() {
  const galleryGrid = document.getElementById('gallery-grid');
  const previousCount = state.visibleCount;
  state.visibleCount += IMAGES_PER_PAGE;

  // Get the next batch of images
  const nextBatch = state.filteredImages.slice(previousCount, state.visibleCount);

  // Append new images with fade-in animation
  nextBatch.forEach((image, index) => {
    const item = createGalleryItem(image);
    item.style.opacity = '0';
    item.style.transform = 'translateY(20px)';
    item.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    galleryGrid.appendChild(item);

    // Stagger the fade-in
    setTimeout(() => {
      item.style.opacity = '1';
      item.style.transform = 'translateY(0)';
    }, index * 50);
  });

  // Update Load More button
  updateLoadMoreButton();

  // Load ratings for new photos
  if (typeof loadAllStats === 'function') {
    loadAllStats();
  }

  // Load comment counts for gallery cards
  if (typeof loadAllCommentCounts === 'function') {
    loadAllCommentCounts();
  }
}

/**
 * Update the Load More button visibility and count
 */
function updateLoadMoreButton() {
  const galleryGrid = document.getElementById('gallery-grid');
  const totalImages = state.filteredImages.length;
  const showing = Math.min(state.visibleCount, totalImages);
  const remaining = totalImages - showing;

  // Remove existing button
  const existingContainer = document.getElementById('load-more-container');
  if (existingContainer) {
    existingContainer.remove();
  }

  // Only show button if there are more images to load
  if (remaining > 0) {
    const container = document.createElement('div');
    container.id = 'load-more-container';
    container.className = 'load-more-container';

    const nextBatchSize = Math.min(IMAGES_PER_PAGE, remaining);

    container.innerHTML = `
      <p class="load-more-count">Showing ${showing} of ${totalImages} images</p>
      <button class="load-more-btn" onclick="loadMoreImages()" aria-label="Load more images">
        <span>Load More</span>
        <span class="load-more-badge">${nextBatchSize}</span>
      </button>
    `;

    // Insert after the gallery grid
    galleryGrid.parentNode.insertBefore(container, galleryGrid.nextSibling);
  }
}

/**
 * Create a gallery item element
 */
function createGalleryItem(image) {
  const item = document.createElement('div');
  item.className = 'gallery-item';
  item.dataset.category = image.category;
  item.dataset.photoId = image.id;
  item.setAttribute('role', 'listitem');

  const categoryName = getCategoryDisplayName(image.category);
  const categoryIcon = getCategoryIcon(image.category);

  const isRecent = recentImageIds.has(image.id);

  item.innerHTML = `
    <div class="image-container" style="background-image: url('${image.placeholderPath || image.imagePath}'); background-size: cover; background-position: center;">
      ${isRecent ? '<span class="new-badge">✨ New</span>' : ''}
      <picture>
        ${image.webpPath ? `<source srcset="${image.webpPath}" type="image/webp">` : ''}
        <img
          src="${image.thumbPath || image.imagePath}"
          alt="${image.title}"
          width="400"
          height="280"
          loading="lazy"
          decoding="async"
          onerror="this.src='${image.imagePath}'"
        />
      </picture>
    </div>
    <div class="item-info">
      <div class="item-text">
        <p class="item-title">${image.title}</p>
        <p class="item-category">
          <span>${categoryIcon}</span>
          ${categoryName}
        </p>
      </div>
      <button
        class="notebook-icon-btn"
        onclick="openModal(${image.id})"
        aria-label="View educational content for ${image.title}"
        title="View lesson content"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
        </svg>
      </button>
    </div>
    <div class="card-stats">
      <span class="badge badge-views" data-tooltip="Views"><span class="badge-icon">👁</span> <span class="views-count">0</span></span>
      <span class="badge badge-rating" data-tooltip="Rating"><span class="badge-icon">⭐</span> <span class="rating-value">0.0</span></span>
      <span class="badge badge-comments" data-tooltip="Comments"><span class="badge-icon">💬</span> <span class="comment-count" data-comment-photo-id="${image.id}">0</span></span>
    </div>
  `;

  // Add click handler to image for image viewer modal
  const imgElement = item.querySelector('.image-container img');
  imgElement.style.cursor = 'pointer';
  imgElement.onclick = () => {
    openImageModal(image.imagePath, image.title, image);
    handleTutorialInteraction();
  };

  // Add click handler to notebook button for tutorial tracking
  const notebookBtn = item.querySelector('.notebook-icon-btn');
  const originalOnclick = notebookBtn.onclick;
  notebookBtn.onclick = (e) => {
    handleTutorialInteraction();
    openModal(image.id);
  };

  return item;
}

/**
 * Get category display name
 */
function getCategoryDisplayName(category) {
  const names = {
    'life-science': 'Life Science',
    'earth-space-science': 'Earth & Space Science',
    'physical-science': 'Physical Science'
  };
  return names[category] || category;
}

/**
 * Get category icon
 */
function getCategoryIcon(category) {
  const icons = {
    'life-science': '🌱',
    'earth-space-science': '🌍',
    'physical-science': '⚗️'
  };
  return icons[category] || '📷';
}

/**
 * Handle category filter button click
 */
function handleCategoryFilter(event) {
  const button = event.currentTarget;
  const category = button.dataset.category;

  // Update active state (exclude collection button)
  document.querySelectorAll('.filter-btn:not(.collection-filter-btn):not(.featured-filter-btn)').forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-pressed', 'false');
  });

  button.classList.add('active');
  button.setAttribute('aria-pressed', 'true');

  // Update state, reset pagination, clear NGSS filter, and re-render
  state.currentCategory = category;
  state.visibleCount = IMAGES_PER_PAGE;
  if (state.ngssFilter) {
    state.ngssFilter = null;
    const activeFilter = document.getElementById('ngss-active-filter');
    if (activeFilter) activeFilter.style.display = 'none';
  }
  // Clear collection filter when switching categories
  if (typeof clearCollectionFilter === 'function') {
    clearCollectionFilter();
  }
  // Clear featured filter when switching categories
  clearFeaturedFilter();
  updateURL(); // Update URL to reflect new filter state
  renderGallery();
}

/**
 * Handle search input
 */
function handleSearch(event) {
  state.searchQuery = event.target.value;
  state.visibleCount = IMAGES_PER_PAGE;
  // Clear NGSS filter when text searching
  if (state.ngssFilter) {
    state.ngssFilter = null;
    const activeFilter = document.getElementById('ngss-active-filter');
    if (activeFilter) activeFilter.style.display = 'none';
  }
  // Clear collection filter when searching
  if (typeof clearCollectionFilter === 'function') {
    clearCollectionFilter();
  }
  // Clear featured filter when searching
  clearFeaturedFilter();
  updateURL(); // Update URL to reflect new search query
  renderGallery();
}

/**
 * ============================================
 * NGSS Standards Search System
 * ============================================
 */

/**
 * Load NGSS index (lazy, on first interaction)
 */
async function loadNGSSIndex() {
  if (state.ngssIndex) return state.ngssIndex;
  try {
    const response = await fetch('ngss-index.json');
    if (!response.ok) throw new Error('NGSS index not found');
    state.ngssIndex = await response.json();
    return state.ngssIndex;
  } catch (error) {
    console.error('Failed to load NGSS index:', error);
    return null;
  }
}

/**
 * Handle NGSS search input with autocomplete suggestions
 */
async function handleNGSSSearch(event) {
  const query = event.target.value.trim();
  const suggestionsEl = document.getElementById('ngss-suggestions');
  const clearBtn = document.getElementById('ngss-clear-btn');

  // Show/hide clear button
  clearBtn.style.display = query.length > 0 ? 'flex' : 'none';

  if (query.length < 1) {
    suggestionsEl.style.display = 'none';
    return;
  }

  const index = await loadNGSSIndex();
  if (!index) return;

  // Search across all standards
  const q = query.toLowerCase();
  const matches = index.allStandards.filter(std =>
    std.toLowerCase().includes(q)
  ).slice(0, 10); // Limit to 10 suggestions

  if (matches.length === 0) {
    suggestionsEl.innerHTML = '<div class="ngss-no-results">No matching standards found</div>';
    suggestionsEl.style.display = 'block';
    return;
  }

  suggestionsEl.innerHTML = matches.map(std => {
    // Parse the type and code
    const [type, ...codeParts] = std.split(': ');
    const code = codeParts.join(': ');
    const count = getImageCountForStandard(index, type, code);

    return `<div class="ngss-suggestion" onclick="selectNGSSStandard('${type}', '${code.replace(/'/g, "\\'")}')">
      <span class="ngss-suggestion-type ngss-type-${type.toLowerCase()}">${type}</span>
      <span class="ngss-suggestion-code">${code}</span>
      <span class="ngss-suggestion-count">${count} image${count !== 1 ? 's' : ''}</span>
    </div>`;
  }).join('');

  suggestionsEl.style.display = 'block';
}

/**
 * Get image count for a given standard
 */
function getImageCountForStandard(index, type, code) {
  if (type === 'PE') return (index.performanceExpectations[code] || []).length;
  if (type === 'DCI') return (index.disciplinaryCoreIdeas[code] || []).length;
  if (type === 'CCC') return (index.crosscuttingConcepts[code] || []).length;
  return 0;
}

/**
 * Select an NGSS standard and filter gallery
 */
function selectNGSSStandard(type, code) {
  const index = state.ngssIndex;
  if (!index) return;

  let imageIds = [];
  if (type === 'PE') imageIds = index.performanceExpectations[code] || [];
  else if (type === 'DCI') imageIds = index.disciplinaryCoreIdeas[code] || [];
  else if (type === 'CCC') imageIds = index.crosscuttingConcepts[code] || [];

  // Set the NGSS filter
  state.ngssFilter = { type, code, imageIds };
  state.visibleCount = IMAGES_PER_PAGE;

  // Clear text search and reset category to 'all'
  state.searchQuery = '';
  const searchInput = document.getElementById('gallery-search');
  if (searchInput) searchInput.value = '';

  state.currentCategory = 'all';
  document.querySelectorAll('.filter-btn:not(.collection-filter-btn):not(.featured-filter-btn)').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === 'all');
    btn.setAttribute('aria-pressed', btn.dataset.category === 'all' ? 'true' : 'false');
  });

  // Update UI
  const suggestionsEl = document.getElementById('ngss-suggestions');
  const ngssInput = document.getElementById('ngss-search');
  const activeFilter = document.getElementById('ngss-active-filter');
  const clearBtn = document.getElementById('ngss-clear-btn');

  suggestionsEl.style.display = 'none';
  ngssInput.value = '';
  clearBtn.style.display = 'none';

  // Show active filter pill
  activeFilter.innerHTML = `
    <span class="ngss-filter-pill">
      <span class="ngss-type-${type.toLowerCase()}">${type}</span>
      <strong>${code}</strong>
      <span class="ngss-filter-count">${imageIds.length} image${imageIds.length !== 1 ? 's' : ''}</span>
      <button class="ngss-filter-remove" onclick="clearNGSSSearch()" aria-label="Remove NGSS filter">✕</button>
    </span>
  `;
  activeFilter.style.display = 'flex';

  renderGallery();
}

/**
 * Clear NGSS search filter
 */
function clearNGSSSearch() {
  state.ngssFilter = null;
  state.visibleCount = IMAGES_PER_PAGE;

  const ngssInput = document.getElementById('ngss-search');
  const suggestionsEl = document.getElementById('ngss-suggestions');
  const activeFilter = document.getElementById('ngss-active-filter');
  const clearBtn = document.getElementById('ngss-clear-btn');

  if (ngssInput) ngssInput.value = '';
  if (suggestionsEl) suggestionsEl.style.display = 'none';
  if (activeFilter) activeFilter.style.display = 'none';
  if (clearBtn) clearBtn.style.display = 'none';

  renderGallery();
}

/**
 * Handle grade level selection change
 */
function handleGradeLevelChange(event) {
  state.selectedGradeLevel = event.target.value;
  updateURL(); // Update URL to reflect new grade level

  // If a modal is currently open, reload its content with the new grade level
  const modal = document.getElementById('educational-modal');
  if (modal && modal.style.display === 'flex') {
    const modalTitle = document.getElementById('modal-title');
    const imageTitle = modalTitle ? modalTitle.textContent : '';

    // Find the image by title and reload content
    const image = state.galleryData.images.find(img => img.title === imageTitle);
    if (image) {
      const modalBody = document.getElementById('modal-body');
      // Show loading state while fetching new grade level content
      modalBody.innerHTML = `
        <div class="loading-content">
          <div class="spinner"></div>
          <p>Loading ${event.target.options[event.target.selectedIndex].text} content...</p>
        </div>
      `;
      // Load new grade level content (will use cache if already loaded)
      loadEducationalContent(image, modalBody);
    }
  }
}

/**
 * Open modal with educational content
 */
async function openModal(imageId) {
  const modal = document.getElementById('educational-modal');
  const modalBody = document.getElementById('modal-body');
  const image = state.galleryData.images.find(img => img.id === imageId);

  if (!image) {
    console.error('Image not found:', imageId);
    return;
  }

  // Record view (Firebase) - await so the count is updated before we read it
  if (typeof recordPhotoView === 'function') {
    await recordPhotoView(image.id);
  }

  // Show modal
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden'; // Prevent background scrolling

  // Reset scroll position and hide scroll-to-top button
  modalBody.scrollTop = 0;
  const scrollBtn = document.querySelector('.modal-scroll-top-btn');
  if (scrollBtn) {
    scrollBtn.classList.remove('visible');
  }

  // Update modal header
  document.querySelector('.modal-thumbnail').src = image.imagePath;
  document.querySelector('.modal-thumbnail').alt = image.title;
  document.getElementById('modal-title').textContent = image.title;

  const categoryName = getCategoryDisplayName(image.category);
  const categoryIcon = getCategoryIcon(image.category);
  document.querySelector('.modal-category').innerHTML = `
    <span>${categoryIcon}</span>
    ${categoryName}
  `;

  // Add stats container if it doesn't exist
  let statsContainer = document.querySelector('.modal-stats');
  if (!statsContainer) {
    const modalHeader = document.querySelector('.modal-header');
    statsContainer = document.createElement('div');
    statsContainer.className = 'modal-stats';
    statsContainer.innerHTML = `
      <div class="stars-display">
        <div class="stars">
          <span class="star empty">☆</span>
          <span class="star empty">☆</span>
          <span class="star empty">☆</span>
          <span class="star empty">☆</span>
          <span class="star empty">☆</span>
        </div>
        <span class="rating-text">0.0 (0)</span>
      </div>
      <button class="lesson-pdf-btn" aria-label="Download lesson guide as PDF" title="Download two-page teacher lesson guide as PDF">
        📄 Download Lesson Guide
      </button>
      <button id="modal-favorite-btn" class="modal-favorite-btn" onclick="toggleFavorite(this.dataset.photoId)" aria-label="Add to My Collection" title="Add to My Collection">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>
        <span class="favorite-label">Favorite</span>
      </button>
      <div class="views-count">0 Views</div>
    `;
    modalHeader.parentNode.insertBefore(statsContainer, modalBody);
  }

  // Update favorite button state for this photo
  const favoriteBtn = document.getElementById('modal-favorite-btn');
  if (favoriteBtn) {
    favoriteBtn.dataset.photoId = image.id;
    const isFav = typeof isPhotoFavorited === 'function' && isPhotoFavorited(image.id);
    if (isFav) {
      favoriteBtn.classList.add('favorited');
      favoriteBtn.setAttribute('aria-label', 'Remove from My Collection');
      favoriteBtn.title = 'Remove from My Collection';
    } else {
      favoriteBtn.classList.remove('favorited');
      favoriteBtn.setAttribute('aria-label', 'Add to My Collection');
      favoriteBtn.title = 'Add to My Collection';
    }
  }

  // Update download button to open pre-generated PDF
  const pdfBtn = statsContainer.querySelector('.lesson-pdf-btn');
  if (pdfBtn) {
    pdfBtn.onclick = () => {
      const baseFilename = image.filename.replace(/\.[^/.]+$/, ''); // strip extension
      const gradeKey = state.selectedGradeLevel; // read at click time for grade changes
      const pdfPath = `pdfs/${image.category}/${baseFilename}-${gradeKey}.pdf`;
      window.open(pdfPath, '_blank');
    };
  }

  // Load and display ratings/views
  if (typeof getRatings === 'function' && typeof getViews === 'function') {
    const ratings = await getRatings(image.id);
    const views = await getViews(image.id);
    updateModalStats(ratings, views);
  }

  // Show loading state
  modalBody.innerHTML = `
    <div class="loading-content">
      <div class="spinner"></div>
      <p>Loading educational content...</p>
    </div>
  `;

  // Load educational content
  await loadEducationalContent(image, modalBody);

  // Add interactive rating stars at the end of content
  if (typeof generateInteractiveStarsHTML === 'function') {
    const ratingHTML = await generateInteractiveStarsHTML(image.id);
    const ratingContainer = document.createElement('div');
    ratingContainer.innerHTML = ratingHTML;
    modalBody.appendChild(ratingContainer);
  }

  // Add comment section at the end of content
  if (typeof generateCommentSectionHTML === 'function') {
    const commentHTML = generateCommentSectionHTML(image.id);
    const commentContainer = document.createElement('div');
    commentContainer.id = 'modal-comment-section';
    commentContainer.innerHTML = commentHTML;
    modalBody.appendChild(commentContainer);
    if (typeof setupCommentListeners === 'function') {
      setupCommentListeners(image.id);
    }
    if (typeof loadComments === 'function') {
      loadComments(image.id);
    }
  }

  // Focus management for accessibility
  modal.querySelector('.close-btn').focus();
  trapFocus(modal);
}

/**
 * Load and render educational content
 */
async function loadEducationalContent(image, modalBody) {
  try {
    // Generate cache key based on image ID and grade level
    const cacheKey = `${image.id}-${state.selectedGradeLevel}`;

    // Check cache first
    if (state.loadedContent[cacheKey]) {
      renderContent(state.loadedContent[cacheKey], modalBody);
      return;
    }

    // Construct the grade-specific content file path
    // Example: content/life-science/mushroom.json → content/life-science/mushroom-kindergarten.json
    const baseFile = image.contentFile.replace('.json', '');
    const gradeContentFile = `${baseFile}-${state.selectedGradeLevel}.json`;

    // Try to load grade-specific file first
    let response = await fetch(gradeContentFile);

    // If grade-specific file doesn't exist, fall back to original file
    if (!response.ok) {
      console.log(`Grade-specific file not found: ${gradeContentFile}, falling back to ${image.contentFile}`);
      response = await fetch(image.contentFile);
    }

    if (!response.ok) {
      throw new Error('Content not found');
    }

    const contentData = await response.json();

    // Cache the content with grade-specific key
    state.loadedContent[cacheKey] = contentData;

    // Render the content
    renderContent(contentData, modalBody);

  } catch (error) {
    console.error('Error loading content:', error);
    modalBody.innerHTML = `
      <div class="error-message">
        <p><strong>⚠️ Content Not Available</strong></p>
        <p>Educational content for this image hasn't been generated yet.</p>
        <p>Please check back later or contact the site administrator.</p>
      </div>
    `;
  }
}

/**
 * Render educational content in modal
 */
function renderContent(contentData, modalBody) {
  // Content is directly in the contentData.content field
  // (Each grade level has its own JSON file with content at the root)
  let markdownContent = contentData.content;

  // Parse NGSS links before markdown conversion
  markdownContent = parseNGSSLinks(markdownContent);

  // Convert markdown to HTML using Marked.js
  let html = marked.parse(markdownContent);

  // Process custom XML tags
  html = renderCustomTags(html);

  // Extract discussion questions for the quick-access card
  const discussionCard = extractDiscussionCard(markdownContent);

  // Update modal body with discussion card pinned at top
  modalBody.innerHTML = discussionCard + html;

  // Add animated class to trigger staggered animations
  modalBody.classList.remove('animated'); // Remove if exists
  void modalBody.offsetWidth; // Force reflow to restart animations
  modalBody.classList.add('animated');

  // Smooth scroll to top of modal body
  modalBody.scrollTop = 0;
}

/**
 * Extract discussion questions from markdown content and build a quick-access card
 */
function extractDiscussionCard(markdownContent) {
  // Find the Discussion Questions section
  const discussionMatch = markdownContent.match(/##\s*💬\s*Discussion Questions\s*\n([\s\S]*?)(?=\n##\s|$)/);
  if (!discussionMatch) return '';

  const questionsBlock = discussionMatch[1].trim();
  // Parse numbered questions - match lines starting with number + period or number + asterisks
  const questionLines = questionsBlock.split('\n').filter(line => /^\d+\.\s/.test(line.trim()));

  if (questionLines.length === 0) return '';

  const questionsHtml = questionLines.map(line => {
    // Clean markdown formatting: remove ** wrappers and extract question text
    let cleaned = line.replace(/^\d+\.\s*/, '').trim();
    // Remove outer bold wrappers
    cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1');
    // Split at Bloom's/DOK annotation if present
    const parts = cleaned.split(/\s*\(Bloom['']s:/);
    const questionText = parts[0].trim();
    const metaText = parts[1] ? '(' + 'Bloom\'s:' + parts[1] : '';

    return `<li>
      <span class="dq-text">${questionText}</span>
      ${metaText ? `<span class="dq-meta">${metaText}</span>` : ''}
    </li>`;
  }).join('');

  return `
    <div class="discussion-quick-card collapsed">
      <div class="dqc-header" onclick="this.parentElement.classList.toggle('collapsed')">
        <span class="dqc-icon">💬</span>
        <span class="dqc-title">Discussion Questions</span>
        <span class="dqc-count">${questionLines.length}</span>
        <span class="dqc-toggle">▾</span>
      </div>
      <ol class="dqc-list">${questionsHtml}</ol>
    </div>
  `;
}

/**
 * Parse NGSS links into clickable HTML links
 */
function parseNGSSLinks(content) {
  // Pattern: [[NGSS:TYPE:CODE]]
  // Example: [[NGSS:DCI:3-LS4.D]] or [[NGSS:CCC:Patterns]]
  return content.replace(
    /\[\[NGSS:(DCI|CCC|PE):([^\]]+)\]\]/g,
    (match, type, code) => {
      const url = generateNGSSUrl(type, code);
      return `<a href="${url}" class="ngss-link" target="_blank" rel="noopener noreferrer">${code}</a>`;
    }
  );
}

/**
 * Generate NGSS URL based on type and code
 */
function generateNGSSUrl(type, code) {
  const baseUrl = 'https://www.nextgenscience.org';

  if (type === 'DCI') {
    // Disciplinary Core Ideas
    // Example: 3-LS4.D → /dci-arrangement/3-ls4-biological-evolution-unity-and-diversity
    const topicCode = code.split('.')[0].toLowerCase();
    return `${baseUrl}/dci-arrangement/${topicCode}`;
  } else if (type === 'CCC') {
    // Crosscutting Concepts
    // Example: Patterns → /crosscutting-concepts/patterns
    const conceptSlug = code.toLowerCase().replace(/\s+/g, '-');
    return `${baseUrl}/crosscutting-concepts/${conceptSlug}`;
  } else if (type === 'PE') {
    // Performance Expectations
    // Example: 3-PS1-1 → /pe/3-ps1-1-matter-and-its-interactions
    const peCode = code.toLowerCase();
    return `${baseUrl}/pe/${peCode}`;
  }

  // Fallback
  return `${baseUrl}/search?keys=${encodeURIComponent(code)}`;
}

/**
 * Render custom XML tags as styled HTML elements
 */
function renderCustomTags(html) {
  // Pedagogical tips
  html = html.replace(
    /<pedagogical-tip>([\s\S]*?)<\/pedagogical-tip>/g,
    '<div class="pedagogical-tip">$1</div>'
  );

  // UDL strategies
  html = html.replace(
    /<udl-suggestions>([\s\S]*?)<\/udl-suggestions>/g,
    '<div class="udl-strategies">$1</div>'
  );

  return html;
}

/**
 * Close modal
 */
function closeModal() {
  const modal = document.getElementById('educational-modal');
  
  // Clean up hotspots
  cleanupHotspots();
  
  modal.style.display = 'none';
  document.body.style.overflow = ''; // Restore scrolling
  releaseFocus();
}

/**
 * Handle keyboard events
 */
function handleKeyboard(event) {
  const educationalModal = document.getElementById('educational-modal');
  const imageModal = document.getElementById('image-modal');
  const overviewModal = document.getElementById('overview-modal');
  const arkansasModal = document.getElementById('arkansas-modal');
  const visionaryModal = document.getElementById('visionary-modal');

  // ESC key closes modals
  if (event.key === 'Escape') {
    // Close educational modal if open
    if (educationalModal && educationalModal.style.display === 'flex') {
      closeModal();
    }
    // Close image modal if open
    if (imageModal && imageModal.classList.contains('active')) {
      closeImageModal();
    }
    // Close overview modal if open
    if (overviewModal && overviewModal.classList.contains('active')) {
      closeOverviewModal();
    }
    // Close Arkansas modal if open
    if (arkansasModal && arkansasModal.classList.contains('active')) {
      closeArkansasPortal();
    }
    // Close visionary modal if open
    if (visionaryModal && visionaryModal.classList.contains('active')) {
      closeVisionaryModal();
    }
  }
}

/**
 * Trap focus within modal for accessibility
 */
function trapFocus(modal) {
  const focusableElements = modal.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  modal.addEventListener('keydown', function handleTabKey(e) {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  });
}

/**
 * Release focus trap
 */
function releaseFocus() {
  // Could restore focus to previously focused element if needed
}

/**
 * Handle parallax scroll effect
 */
function handleParallax() {
  const parallaxBg = document.querySelector('.parallax-background');
  if (!parallaxBg) return;

  const scrolled = window.pageYOffset;
  const rate = scrolled * 0.5;

  parallaxBg.style.transform = `translate3d(0, ${rate}px, 0)`;
}

/**
 * Smooth scroll to gallery section
 */
function scrollToGallery() {
  const gallerySection = document.getElementById('gallery-section');
  if (gallerySection) {
    gallerySection.scrollIntoView({ behavior: 'smooth' });
  }
}

/**
 * Show loading state
 */
function showLoading() {
  const loadingState = document.getElementById('loading-state');
  if (loadingState) {
    loadingState.style.display = 'block';
  }
}

/**
 * Hide loading state
 */
function hideLoading() {
  const loadingState = document.getElementById('loading-state');
  if (loadingState) {
    loadingState.style.display = 'none';
  }
}

/**
 * Show empty state message
 */
function showEmptyState(message) {
  const emptyState = document.getElementById('empty-state');
  const galleryGrid = document.getElementById('gallery-grid');

  if (galleryGrid) {
    galleryGrid.innerHTML = '';
  }

  if (emptyState) {
    emptyState.textContent = message;
    emptyState.style.display = 'block';
  }
}

/**
 * Show error message
 */
function showError(message) {
  const galleryGrid = document.getElementById('gallery-grid');
  if (galleryGrid) {
    galleryGrid.innerHTML = `
      <div class="error-message" style="
        grid-column: 1 / -1;
        text-align: center;
        padding: 2rem;
        color: #d32f2f;
      ">
        <p><strong>⚠️ Error</strong></p>
        <p>${message}</p>
      </div>
    `;
  }
  hideLoading();
}

/**
 * Open image viewer modal
 */
/**
 * Open image modal with aspect ratio-based sizing
 */
function openImageModal(imagePath, altText, imageData = null) {
  const modal = document.getElementById('image-modal');
  const modalImage = document.getElementById('modal-image');
  const modalTitle = document.getElementById('image-modal-title');
  const modalContent = modal.querySelector('.image-modal-content');

  if (!modal || !modalImage || !modalTitle) return;

  // Set title
  modalTitle.textContent = altText;

  // Create temporary image to get dimensions
  const tempImg = new Image();

  tempImg.onload = function() {
    const imgWidth = this.naturalWidth;
    const imgHeight = this.naturalHeight;
    const aspectRatio = imgWidth / imgHeight;

    // Calculate optimal modal size based on aspect ratio
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const headerHeight = 100; // Approximate header height
    const padding = 40; // Total padding

    let modalWidth, modalHeight;

    if (aspectRatio > 1) {
      // Landscape image
      modalWidth = Math.min(viewportWidth * 0.9, 1200);
      modalHeight = (modalWidth / aspectRatio) + headerHeight + padding;
    } else {
      // Portrait or square image
      modalHeight = Math.min(viewportHeight * 0.9, 900);
      modalWidth = ((modalHeight - headerHeight - padding) * aspectRatio);
    }

    // Ensure modal fits within viewport
    if (modalHeight > viewportHeight * 0.95) {
      modalHeight = viewportHeight * 0.95;
      modalWidth = ((modalHeight - headerHeight - padding) * aspectRatio);
    }

    if (modalWidth > viewportWidth * 0.95) {
      modalWidth = viewportWidth * 0.95;
      modalHeight = (modalWidth / aspectRatio) + headerHeight + padding;
    }

    // Apply dimensions
    modalContent.style.maxWidth = `${modalWidth}px`;
    modalContent.style.maxHeight = `${modalHeight}px`;

    // Set image source and show modal
    modalImage.src = imagePath;
    modalImage.alt = altText;

    modal.classList.add('active');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Hide toggle button until hotspots are loaded
    const toggleBtn = document.getElementById('hotspot-toggle-btn');
    if (toggleBtn) {
      toggleBtn.style.display = 'none';
    }

    // Load hotspots if image data is available
    if (imageData) {
      // Wait for modal image to be fully loaded
      if (modalImage.complete) {
        loadHotspotsForImageModal(imageData, modalImage);
      } else {
        modalImage.addEventListener('load', () => {
          loadHotspotsForImageModal(imageData, modalImage);
        }, { once: true });
      }
    }

    // Focus management
    const closeBtn = modal.querySelector('.close-btn');
    if (closeBtn) {
      closeBtn.focus();
    }
  };

  tempImg.onerror = function() {
    // Fallback to default behavior if image fails to load
    modalImage.src = imagePath;
    modalImage.alt = altText;
    modal.classList.add('active');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  tempImg.src = imagePath;
}

/**
 * Close image viewer modal
 */
function closeImageModal() {
  const modal = document.getElementById('image-modal');

  if (!modal) return;

  // Clean up hotspots
  cleanupHotspots();

  modal.classList.remove('active');
  modal.style.display = 'none';
  document.body.style.overflow = '';
}

/**
 * Open overview video modal
 */
function openOverviewModal() {
  const modal = document.getElementById('overview-modal');
  const videoIframe = document.getElementById('overview-video');

  if (!modal || !videoIframe) return;

  // Convert Google Drive link to embeddable format
  const driveUrl = 'https://drive.google.com/file/d/1E2xFdHB4cmy9XlSva7CTzVhFZ5_MJO-v/preview';
  videoIframe.src = driveUrl;

  modal.classList.add('active');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // Focus management for accessibility
  const closeBtn = modal.querySelector('.close-btn');
  if (closeBtn) {
    closeBtn.focus();
  }
}

/**
 * Close overview video modal
 */
function closeOverviewModal() {
  const modal = document.getElementById('overview-modal');
  const videoIframe = document.getElementById('overview-video');

  if (!modal) return;

  modal.classList.remove('active');
  modal.style.display = 'none';
  document.body.style.overflow = '';

  // Stop video playback by clearing src
  if (videoIframe) {
    videoIframe.src = '';
  }
}

/**
 * Open Arkansas Portal modal
 */
function openArkansasPortal() {
  const modal = document.getElementById('arkansas-modal');
  const iframe = document.getElementById('arkansas-iframe');

  if (!modal || !iframe) return;

  iframe.src = 'https://portal.arkansas.gov/';
  modal.classList.add('active');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // Focus management for accessibility
  const closeBtn = modal.querySelector('.close-btn');
  if (closeBtn) {
    closeBtn.focus();
  }
}

/**
 * Close Arkansas Portal modal
 */
function closeArkansasPortal() {
  const modal = document.getElementById('arkansas-modal');
  const iframe = document.getElementById('arkansas-iframe');

  if (!modal) return;

  modal.classList.remove('active');
  modal.style.display = 'none';
  document.body.style.overflow = '';

  // Clear iframe to stop any loading
  if (iframe) {
    iframe.src = '';
  }
}

/**
 * Open The Visionary modal
 */
function openVisionaryModal() {
  const modal = document.getElementById('visionary-modal');

  if (!modal) return;

  const modalBody = modal.querySelector('.visionary-modal-body');

  modal.classList.add('active');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // Trigger staggered animations
  if (modalBody) {
    modalBody.classList.remove('animated');
    void modalBody.offsetWidth; // Force reflow
    modalBody.classList.add('animated');
  }

  // Focus management for accessibility
  const closeBtn = modal.querySelector('.close-btn');
  if (closeBtn) {
    closeBtn.focus();
  }
}

/**
 * Close The Visionary modal
 */
function closeVisionaryModal() {
  const modal = document.getElementById('visionary-modal');

  if (!modal) return;

  modal.classList.remove('active');
  modal.style.display = 'none';
  document.body.style.overflow = '';
}

/**
 * Scroll smoothly to the gallery section
 */
function scrollToGallerySmooth() {
  const gallerySection = document.getElementById('gallery-section');
  if (gallerySection) {
    gallerySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/**
 * Show/hide scroll to gallery button based on scroll position
 */
function handleScrollToGalleryButton() {
  const scrollBtn = document.getElementById('scroll-to-gallery-btn');
  const gallerySection = document.getElementById('gallery-section');

  if (!scrollBtn || !gallerySection) return;

  const galleryTop = gallerySection.offsetTop;
  const scrollPosition = window.scrollY;

  // Show button when user has scrolled 300px past the start of the gallery
  if (scrollPosition > galleryTop + 300) {
    scrollBtn.classList.add('visible');
  } else {
    scrollBtn.classList.remove('visible');
  }
}

/**
 * Handle visibility of "Back to Filters" floating button
 */
function handleBackToFiltersButton() {
  const btn = document.getElementById('back-to-filters-btn');
  const filtersNav = document.querySelector('.category-filters');
  if (!btn || !filtersNav) return;

  const filtersBottom = filtersNav.getBoundingClientRect().bottom;
  // Show when filters are scrolled out of view
  if (filtersBottom < 0) {
    btn.classList.add('visible');
  } else {
    btn.classList.remove('visible');
  }
}

/**
 * Scroll smoothly to the category filters area
 */
function scrollToFilters() {
  const filtersNav = document.querySelector('.gallery-header');
  if (filtersNav) {
    filtersNav.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/**
 * Tutorial Hint System
 * Pulsing visual hints for first-time users
 */

/**
 * Initialize tutorial hints on first gallery item
 */
function initializeTutorialHints() {
  // Wait a moment for gallery to render
  setTimeout(() => {
    const firstItem = document.querySelector('.gallery-item');

    if (!firstItem) {
      console.log('[Tutorial] No gallery items found');
      return;
    }

    console.log('[Tutorial] Initializing pulsing hints on first item');

    // Add tutorial-active class to enable pulsing animation
    firstItem.classList.add('tutorial-active');
    console.log('[Tutorial] Pulsing animation enabled');
  }, 500);
}

/**
 * Handle tutorial interaction - keep hints visible permanently
 */
function handleTutorialInteraction() {
  // No longer needed - we keep the pulsing effect and tooltips permanently
  console.log('[Tutorial] User interacted with gallery');
}

/**
 * Reset tutorial (for testing or user preference)
 */
function resetTutorial() {
  localStorage.removeItem('galleryTutorialCompleted');
  location.reload();
}

/**
 * Initialize CSS-based particles for gallery background
 */
function initializeParticles() {
  const container = document.getElementById('particles-container');
  if (!container) {
    console.warn('[Particles] Container not found');
    return;
  }

  const particleCount = 400;

  // Create particles with varying properties
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';

    // Random position throughout the container
    const startX = Math.random() * 100;
    const startY = Math.random() * 100;
    particle.style.left = startX + '%';
    particle.style.top = startY + '%';

    // Random animation duration (4-8 seconds for faster motion)
    const duration = 6 + Math.random() * 4;
    particle.style.animationDuration = duration + 's';

    // Random delay to stagger animations
    const delay = Math.random() * 4;
    particle.style.animationDelay = delay + 's';

    // Random drift amounts for X and Y (increased range)
    const driftX = (Math.random() - 0.5) * 100; // -50px to +50px
    const driftY = (Math.random() - 0.5) * 100; // -50px to +50px
    particle.style.setProperty('--drift-x', driftX + 'px');
    particle.style.setProperty('--drift-y', driftY + 'px');

    // Slight size variation (4-6px)
    const size = 4 + Math.random() * 2;
    particle.style.width = size + 'px';
    particle.style.height = size + 'px';

    // Opacity variation (0.4-0.6 for better visibility)
    const opacity = 0.45 + Math.random() * 0.2;
    particle.style.opacity = opacity;

    container.appendChild(particle);
  }

  console.log('[Particles] Initialized', particleCount, 'CSS particles');
}

/**
 * Initialize modal scroll-to-top buttons
 */
function initializeModalScrollButtons() {
  const modalBody = document.getElementById('modal-body');
  const scrollBtn = document.querySelector('.modal-scroll-top-btn');

  if (!modalBody || !scrollBtn) {
    console.log('[Modal Scroll] Modal body or scroll button not found');
    return;
  }

  // Add scroll event listener to modal body
  modalBody.addEventListener('scroll', () => {
    console.log('[Modal Scroll] Scroll position:', modalBody.scrollTop);
    if (modalBody.scrollTop > 300) {
      scrollBtn.classList.add('visible');
      console.log('[Modal Scroll] Button shown');
    } else {
      scrollBtn.classList.remove('visible');
      console.log('[Modal Scroll] Button hidden');
    }
  });

  console.log('[Modal Scroll] Scroll-to-top button initialized');
}

/**
 * Scroll modal to top
 */
function scrollModalToTop(modalBodyId) {
  const modalBody = document.getElementById(modalBodyId);
  if (modalBody) {
    modalBody.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

/**
 * ==========================================
 * FEATURED COLLECTION FILTER
 * ==========================================
 */

/**
 * Toggle Featured Collection (Pollination) filter on/off
 */
function toggleFeaturedFilter() {
  const btn = document.getElementById('featured-pollination-btn');
  if (!btn) return;

  if (state.featuredFilter) {
    // Deactivate
    state.featuredFilter = false;
    btn.classList.remove('active');
    btn.setAttribute('aria-pressed', 'false');
  } else {
    // Activate
    state.featuredFilter = true;
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');

    // Clear other filters
    state.currentCategory = 'all';
    state.searchQuery = '';
    state.ngssFilter = null;
    state.collectionFilter = false;

    // Reset category buttons
    document.querySelectorAll('.filter-btn:not(.collection-filter-btn):not(.featured-filter-btn)').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    const allBtn = document.querySelector('.filter-btn[data-category="all"]');
    if (allBtn) {
      allBtn.classList.add('active');
      allBtn.setAttribute('aria-pressed', 'true');
    }

    // Clear collection button
    const collectionBtn = document.getElementById('my-collection-btn');
    if (collectionBtn) {
      collectionBtn.classList.remove('active');
      collectionBtn.setAttribute('aria-pressed', 'false');
    }

    // Clear search input
    const searchInput = document.getElementById('gallery-search');
    if (searchInput) searchInput.value = '';

    // Clear NGSS filter UI
    const activeFilter = document.getElementById('ngss-active-filter');
    if (activeFilter) activeFilter.style.display = 'none';
    const ngssInput = document.getElementById('ngss-search');
    if (ngssInput) ngssInput.value = '';
    const clearBtn = document.getElementById('ngss-clear-btn');
    if (clearBtn) clearBtn.style.display = 'none';
  }

  state.visibleCount = IMAGES_PER_PAGE;
  updateURL();
  renderGallery();
}

/**
 * Clear the featured filter (called when other filters are activated)
 */
function clearFeaturedFilter() {
  state.featuredFilter = false;
  const btn = document.getElementById('featured-pollination-btn');
  if (btn) {
    btn.classList.remove('active');
    btn.setAttribute('aria-pressed', 'false');
  }
}

/**
 * Update the Featured Collection badge with matching photo count
 */
function updateFeaturedBadge() {
  const badge = document.getElementById('featured-badge');
  if (!badge || !state.galleryData || !state.galleryData.images) return;

  const count = state.galleryData.images.filter(img =>
    Array.isArray(img.keywords) && img.keywords.some(kw => kw.toLowerCase() === 'pollination')
  ).length;

  badge.textContent = count;
  badge.style.display = count > 0 ? 'inline-flex' : 'none';
}

// Export functions for onclick handlers in HTML
window.openModal = openModal;
window.closeModal = closeModal;
window.scrollToGallery = scrollToGallery;
window.openImageModal = openImageModal;
window.closeImageModal = closeImageModal;
window.openOverviewModal = openOverviewModal;
window.closeOverviewModal = closeOverviewModal;
window.openArkansasPortal = openArkansasPortal;
window.closeArkansasPortal = closeArkansasPortal;
window.openVisionaryModal = openVisionaryModal;
window.closeVisionaryModal = closeVisionaryModal;
window.scrollToGallerySmooth = scrollToGallerySmooth;
window.scrollModalToTop = scrollModalToTop;
window.resetTutorial = resetTutorial; // Export for testing
window.toggleFeaturedFilter = toggleFeaturedFilter;
window.clearFeaturedFilter = clearFeaturedFilter;


/**
 * ==========================================
 * HOTSPOT FUNCTIONALITY
 * ==========================================
 */

// Track current open tooltip
let currentTooltip = null;

/**
 * Load and render hotspots for image modal
 */
async function loadHotspotsForImageModal(image, modalImage) {
  console.log('[Hotspots] Loading hotspots for image modal:', image);
  try {
    // Construct hotspot file path using filename without extension
    // Example: hotspots/life-science/IMG_2566.json
    const filenameWithoutExt = image.filename.replace(/\.[^/.]+$/, '');
    const hotspotFile = `hotspots/${image.category}/${filenameWithoutExt}.json`;
    
    console.log('[Hotspots] Fetching:', hotspotFile);
    const response = await fetch(hotspotFile);
    
    if (!response.ok) {
      // No hotspots available for this image
      console.log(`[Hotspots] No hotspots found for ${image.filename} (${response.status})`);
      return;
    }
    
    const hotspotData = await response.json();
    console.log('[Hotspots] Loaded data:', hotspotData);
    
    // Render hotspots on the image modal
    renderHotspotsOnImageModal(hotspotData.hotspots, modalImage);
    console.log('[Hotspots] Render complete');
    
  } catch (error) {
    console.error(`[Hotspots] Error loading hotspots for ${image.filename}:`, error);
  }
}

/**
 * Render hotspot markers on the modal thumbnail
 */
function renderHotspots(hotspots, image) {
  console.log('[Hotspots] Rendering', hotspots.length, 'hotspots');
  const modalHeader = document.querySelector('.modal-header');
  const modalThumbnail = document.querySelector('.modal-thumbnail');
  
  console.log('[Hotspots] Modal elements:', { modalHeader, modalThumbnail });
  
  if (!modalHeader || !modalThumbnail) {
    console.error('[Hotspots] Modal elements not found');
    return;
  }
  
  // Remove any existing hotspot container
  const existingContainer = document.querySelector('.hotspot-container');
  if (existingContainer) {
    existingContainer.remove();
  }
  
  // Create hotspot container
  const hotspotContainer = document.createElement('div');
  hotspotContainer.className = 'hotspot-container';
  
  // Position container relative to thumbnail
  const thumbnailRect = modalThumbnail.getBoundingClientRect();
  const headerRect = modalHeader.getBoundingClientRect();
  
  // Calculate offset from header
  hotspotContainer.style.top = `${thumbnailRect.top - headerRect.top}px`;
  hotspotContainer.style.left = `${thumbnailRect.left - headerRect.left}px`;
  hotspotContainer.style.width = `${thumbnailRect.width}px`;
  hotspotContainer.style.height = `${thumbnailRect.height}px`;
  
  // Create hotspot markers
  hotspots.forEach(hotspot => {
    const marker = document.createElement('div');
    marker.className = 'hotspot';
    marker.style.left = hotspot.x;
    marker.style.top = hotspot.y;
    marker.textContent = hotspot.id;
    marker.setAttribute('data-hotspot-id', hotspot.id);
    marker.setAttribute('role', 'button');
    marker.setAttribute('aria-label', `Hotspot ${hotspot.id}: ${hotspot.label}`);
    marker.setAttribute('tabindex', '0');
    
    // Click handler
    marker.addEventListener('click', (e) => {
      e.stopPropagation();
      showHotspotTooltip(hotspot, marker, hotspotContainer);
    });
    
    // Keyboard accessibility
    marker.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        showHotspotTooltip(hotspot, marker, hotspotContainer);
      }
    });
    
    hotspotContainer.appendChild(marker);
  });
  
  // Add container to modal header
  modalHeader.appendChild(hotspotContainer);
  
  // Update hotspot positions on window resize
  const resizeHandler = () => {
    const newThumbnailRect = modalThumbnail.getBoundingClientRect();
    const newHeaderRect = modalHeader.getBoundingClientRect();
    hotspotContainer.style.top = `${newThumbnailRect.top - newHeaderRect.top}px`;
    hotspotContainer.style.left = `${newThumbnailRect.left - newHeaderRect.left}px`;
    hotspotContainer.style.width = `${newThumbnailRect.width}px`;
    hotspotContainer.style.height = `${newThumbnailRect.height}px`;
  };
  
  window.addEventListener('resize', resizeHandler);
  
  // Clean up on modal close
  const modal = document.getElementById('educational-modal');
  const closeHandler = () => {
    window.removeEventListener('resize', resizeHandler);
    if (currentTooltip) {
      currentTooltip.remove();
      currentTooltip = null;
    }
  };
  
  // Store cleanup function for later use
  if (!modal._hotspotCleanup) {
    modal._hotspotCleanup = [];
  }
  modal._hotspotCleanup.push(closeHandler);
}

/**
 * Render hotspots on the image modal (large photo view)
 */
function renderHotspotsOnImageModal(hotspots, modalImage) {
  console.log('[Hotspots] Rendering', hotspots.length, 'hotspots on image modal');
  
  const imageModalBody = document.querySelector('.image-modal-body');
  
  if (!imageModalBody || !modalImage) {
    console.error('[Hotspots] Image modal elements not found');
    return;
  }
  
  // Remove any existing hotspot container
  const existingContainer = imageModalBody.querySelector('.hotspot-container');
  if (existingContainer) {
    existingContainer.remove();
  }
  
  // Create hotspot container
  const hotspotContainer = document.createElement('div');
  hotspotContainer.className = 'hotspot-container';
  hotspotContainer.style.position = 'absolute';
  hotspotContainer.style.top = '0';
  hotspotContainer.style.left = '0';
  hotspotContainer.style.width = '100%';
  hotspotContainer.style.height = '100%';
  hotspotContainer.style.pointerEvents = 'none';
  
  // Make image modal body relative for absolute positioning
  imageModalBody.style.position = 'relative';
  
  // Create hotspot markers
  hotspots.forEach(hotspot => {
    const marker = document.createElement('div');
    marker.className = 'hotspot';
    marker.style.left = hotspot.x;
    marker.style.top = hotspot.y;
    marker.textContent = hotspot.id;
    marker.setAttribute('data-hotspot-id', hotspot.id);
    marker.setAttribute('role', 'button');
    marker.setAttribute('aria-label', `Hotspot ${hotspot.id}: ${hotspot.label}`);
    marker.setAttribute('tabindex', '0');
    
    // Click handler
    marker.addEventListener('click', (e) => {
      e.stopPropagation();
      showHotspotTooltip(hotspot, marker, hotspotContainer);
    });
    
    // Keyboard accessibility
    marker.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        showHotspotTooltip(hotspot, marker, hotspotContainer);
      }
    });
    
    hotspotContainer.appendChild(marker);
  });
  
  // Add container to image modal body
  imageModalBody.appendChild(hotspotContainer);

  // Show the hotspot toggle button
  const toggleBtn = document.getElementById('hotspot-toggle-btn');
  if (toggleBtn) {
    toggleBtn.style.display = 'flex';
    toggleBtn.classList.remove('hotspots-hidden');
    // Reset icon to eye-open
    toggleBtn.querySelector('svg').innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
    toggleBtn.querySelector('span').textContent = 'Hotspots';
  }

  console.log('[Hotspots] Rendered on image modal');
}

/**
 * Show tooltip for a hotspot
 */
function showHotspotTooltip(hotspot, marker, container) {
  // Close existing tooltip
  if (currentTooltip) {
    currentTooltip.remove();
    // Remove active class from previous marker
    document.querySelectorAll('.hotspot.active').forEach(m => m.classList.remove('active'));
  }
  
  // Mark this hotspot as active
  marker.classList.add('active');
  
  // Create tooltip
  const tooltip = document.createElement('div');
  tooltip.className = 'hotspot-tooltip';
  tooltip.innerHTML = `
    <button class="hotspot-tooltip-close" aria-label="Close tooltip">&times;</button>
    <div class="hotspot-tooltip-header">
      <div class="hotspot-tooltip-number">${hotspot.id}</div>
      <div class="hotspot-tooltip-label">${hotspot.label}</div>
    </div>
    <div class="hotspot-tooltip-fact">${hotspot.fact}</div>
  `;
  
  // Position tooltip
  positionTooltip(tooltip, marker, container);
  
  // Add to container
  container.appendChild(tooltip);
  
  // Animate in
  setTimeout(() => tooltip.classList.add('show'), 10);
  
  // Close button handler
  const closeBtn = tooltip.querySelector('.hotspot-tooltip-close');
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeTooltip(tooltip, marker);
  });
  
  // Click outside to close
  const outsideClickHandler = (e) => {
    if (!tooltip.contains(e.target) && !marker.contains(e.target)) {
      closeTooltip(tooltip, marker);
      document.removeEventListener('click', outsideClickHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', outsideClickHandler), 10);
  
  // Store current tooltip
  currentTooltip = tooltip;
}

/**
 * Position tooltip relative to marker
 */
function positionTooltip(tooltip, marker, container) {
  const markerRect = marker.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  
  // Get marker position within container
  const markerX = markerRect.left - containerRect.left + markerRect.width / 2;
  const markerY = markerRect.top - containerRect.top + markerRect.height / 2;
  
  // Tooltip dimensions (approximate before render)
  const tooltipWidth = 300;
  const tooltipHeight = 200;
  const offset = 20;
  
  // Determine best position (prefer top, then bottom, then sides)
  let placement = 'top';
  let left = markerX;
  let top = markerY - offset;
  
  // Check if there's space on top
  if (markerY < tooltipHeight + offset) {
    placement = 'bottom';
    top = markerY + offset;
  }
  
  // Check horizontal boundaries
  if (left - tooltipWidth / 2 < 0) {
    // Not enough space on left, position to right of marker
    placement = 'right';
    left = markerX + offset;
    top = markerY;
  } else if (left + tooltipWidth / 2 > containerRect.width) {
    // Not enough space on right, position to left of marker
    placement = 'left';
    left = markerX - offset;
    top = markerY;
  }
  
  // Apply positioning
  tooltip.classList.add(`tooltip-${placement}`);
  
  switch (placement) {
    case 'top':
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
      tooltip.style.transform = 'translate(-50%, -100%)';
      break;
    case 'bottom':
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
      tooltip.style.transform = 'translate(-50%, 0)';
      break;
    case 'left':
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
      tooltip.style.transform = 'translate(-100%, -50%)';
      break;
    case 'right':
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
      tooltip.style.transform = 'translate(0, -50%)';
      break;
  }
}

/**
 * Close tooltip
 */
function closeTooltip(tooltip, marker) {
  tooltip.classList.remove('show');
  marker.classList.remove('active');
  setTimeout(() => {
    if (tooltip.parentNode) {
      tooltip.remove();
    }
    if (currentTooltip === tooltip) {
      currentTooltip = null;
    }
  }, 300);
}

/**
 * Clean up hotspots when modal closes
 */
function cleanupHotspots() {
  const modal = document.getElementById('educational-modal');
  if (modal && modal._hotspotCleanup) {
    modal._hotspotCleanup.forEach(cleanup => cleanup());
    modal._hotspotCleanup = [];
  }
  
  // Remove hotspot container
  const hotspotContainer = document.querySelector('.hotspot-container');
  if (hotspotContainer) {
    hotspotContainer.remove();
  }
  
  // Close any open tooltip
  if (currentTooltip) {
    currentTooltip.remove();
    currentTooltip = null;
  }

  // Hide the toggle button
  const toggleBtn = document.getElementById('hotspot-toggle-btn');
  if (toggleBtn) {
    toggleBtn.style.display = 'none';
  }
}

/**
 * Toggle hotspot visibility on image modal
 */
function toggleHotspots() {
  const container = document.querySelector('.image-modal-body .hotspot-container');
  const toggleBtn = document.getElementById('hotspot-toggle-btn');
  if (!container || !toggleBtn) return;

  const isHidden = container.classList.toggle('hotspots-hidden');
  toggleBtn.classList.toggle('hotspots-hidden', isHidden);

  // Close any open tooltip when hiding
  if (isHidden && currentTooltip) {
    currentTooltip.remove();
    currentTooltip = null;
    document.querySelectorAll('.hotspot.active').forEach(m => m.classList.remove('active'));
  }

  // Update button icon and text
  if (isHidden) {
    toggleBtn.querySelector('svg').innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';
    toggleBtn.querySelector('span').textContent = 'Show';
  } else {
    toggleBtn.querySelector('svg').innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
    toggleBtn.querySelector('span').textContent = 'Hotspots';
  }
}


/**
 * Copyright & Terms Modal Functions
 */
function openCopyrightModal() {
  const modal = document.getElementById('copyright-modal');
  if (modal) {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    // Focus on modal for accessibility
    modal.setAttribute('tabindex', '-1');
    modal.focus();
  }
}

function closeCopyrightModal() {
  const modal = document.getElementById('copyright-modal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
}

// Close modal on Escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const copyrightModal = document.getElementById('copyright-modal');
    if (copyrightModal && copyrightModal.style.display === 'flex') {
      closeCopyrightModal();
    }
    const contactModal = document.getElementById('contact-modal');
    if (contactModal && contactModal.style.display === 'flex') {
      closeContactModal();
    }
  }
});

/**
 * Contact Form Modal Functions
 */
function openContactModal() {
  const modal = document.getElementById('contact-modal');
  if (modal) {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    modal.setAttribute('tabindex', '-1');
    modal.focus();
  }
}

function closeContactModal() {
  const modal = document.getElementById('contact-modal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
}

async function handleContactSubmit(event) {
  event.preventDefault();

  const form = document.getElementById('contact-form');
  const submitBtn = document.getElementById('contact-submit-btn');
  const submitText = submitBtn.querySelector('.submit-text');
  const submitSpinner = submitBtn.querySelector('.submit-spinner');

  // Show loading state
  submitBtn.disabled = true;
  submitText.style.display = 'none';
  submitSpinner.style.display = 'flex';

  try {
    const formData = new FormData(form);
    const response = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (result.success) {
      // Show success
      form.style.display = 'none';
      document.querySelector('.contact-intro').style.display = 'none';
      document.getElementById('contact-success').style.display = 'block';
      document.getElementById('contact-error').style.display = 'none';
    } else {
      // Show error
      form.style.display = 'none';
      document.querySelector('.contact-intro').style.display = 'none';
      document.getElementById('contact-error').style.display = 'block';
      document.getElementById('contact-success').style.display = 'none';
    }
  } catch (error) {
    // Show error
    form.style.display = 'none';
    document.querySelector('.contact-intro').style.display = 'none';
    document.getElementById('contact-error').style.display = 'block';
    document.getElementById('contact-success').style.display = 'none';
  } finally {
    // Reset button
    submitBtn.disabled = false;
    submitText.style.display = 'inline';
    submitSpinner.style.display = 'none';
  }
}

function resetContactForm() {
  const form = document.getElementById('contact-form');
  form.reset();
  form.style.display = 'flex';
  document.querySelector('.contact-intro').style.display = 'block';
  document.getElementById('contact-success').style.display = 'none';
  document.getElementById('contact-error').style.display = 'none';
}

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
  selectedGradeLevel: 'third-grade' // Default to third grade content
};

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
    'hero_images/hero_img01.jpg',
    'hero_images/hero_img02.jpg',
    'hero_images/hero_img03.jpg',
    'hero_images/hero_img04.jpg',
    'hero_images/hero_img05.jpg'
  ];

  // Get the last shown image from localStorage to avoid immediate repeats
  const lastShownImage = localStorage.getItem('lastHeroImage');

  // Filter out the last shown image if it exists
  let availableImages = heroImages;
  if (lastShownImage && heroImages.length > 1) {
    availableImages = heroImages.filter(img => img !== lastShownImage);
  }

  // Select a random image from available images
  const randomIndex = Math.floor(Math.random() * availableImages.length);
  const selectedImage = availableImages[randomIndex];

  // Store the selected image for next time
  localStorage.setItem('lastHeroImage', selectedImage);

  // Apply the background image
  const heroBackground = document.getElementById('hero-background');
  if (heroBackground) {
    heroBackground.style.backgroundImage = `url('${selectedImage}')`;
    console.log('[Hero] Selected image:', selectedImage);
  }
}

/**
 * Initialize the application
 */
async function initializeApp() {
  updateCopyrightYear();
  setupEventListeners();
  await loadGalleryData();
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
  // Category filter buttons
  const filterButtons = document.querySelectorAll('.filter-btn');
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

  // Keyboard events
  document.addEventListener('keydown', handleKeyboard);

  // Parallax effect on scroll
  window.addEventListener('scroll', handleParallax);

  // Scroll to gallery button visibility
  window.addEventListener('scroll', handleScrollToGalleryButton);
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
      img.category.toLowerCase().includes(query)
    );
  }

  // Clear grid
  galleryGrid.innerHTML = '';

  if (filteredImages.length === 0) {
    showEmptyState('No images found matching your criteria.');
    return;
  }

  // Hide empty state
  if (emptyState) {
    emptyState.style.display = 'none';
  }

  // Render each image
  filteredImages.forEach(image => {
    const item = createGalleryItem(image);
    galleryGrid.appendChild(item);
  });

  // Initialize tutorial hints for first-time users
  initializeTutorialHints();

  // Load ratings and views for all photos
  if (typeof loadAllStats === 'function') {
    loadAllStats();
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

  item.innerHTML = `
    <div class="image-container">
      <img
        src="${image.imagePath}"
        alt="${image.title}"
        loading="lazy"
        onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'400\\' height=\\'300\\'%3E%3Crect fill=\\'%23f0f0f0\\' width=\\'400\\' height=\\'300\\'/%3E%3Ctext fill=\\'%23999\\' x=\\'50%25\\' y=\\'50%25\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\'%3EImage not found%3C/text%3E%3C/svg%3E'"
      />
    </div>
    <div class="item-info">
      <p class="item-category">
        <span>${categoryIcon}</span>
        ${categoryName}
      </p>
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
      <div class="views-count">0 Views</div>
    </div>
  `;

  // Add click handler to image for image viewer modal
  const imgElement = item.querySelector('.image-container img');
  imgElement.style.cursor = 'pointer';
  imgElement.onclick = () => {
    openImageModal(image.imagePath, image.title);
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

  // Update active state
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-pressed', 'false');
  });

  button.classList.add('active');
  button.setAttribute('aria-pressed', 'true');

  // Update state and re-render
  state.currentCategory = category;
  renderGallery();
}

/**
 * Handle search input
 */
function handleSearch(event) {
  state.searchQuery = event.target.value;
  renderGallery();
}

/**
 * Handle grade level selection change
 */
function handleGradeLevelChange(event) {
  state.selectedGradeLevel = event.target.value;

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

  // Record view (Firebase)
  if (typeof recordPhotoView === 'function') {
    recordPhotoView(image.id);
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
      <div class="views-count">0 Views</div>
    `;
    modalHeader.parentNode.insertBefore(statsContainer, modalBody);
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
    const ratingHTML = generateInteractiveStarsHTML(image.id);
    const ratingContainer = document.createElement('div');
    ratingContainer.innerHTML = ratingHTML;
    modalBody.appendChild(ratingContainer);
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

    // Load from JSON file
    const response = await fetch(gradeContentFile);

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
        <p>Educational content for this grade level hasn't been generated yet.</p>
        <p>Please try a different grade level or check back later.</p>
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

  // Update modal body
  modalBody.innerHTML = html;

  // Add animated class to trigger staggered animations
  modalBody.classList.remove('animated'); // Remove if exists
  void modalBody.offsetWidth; // Force reflow to restart animations
  modalBody.classList.add('animated');

  // Smooth scroll to top of modal body
  modalBody.scrollTop = 0;
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
function openImageModal(imagePath, altText) {
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
  const driveUrl = 'https://drive.google.com/file/d/1O49N8PM81pnE-VWd224BaSBvKp1ocDQo/preview';
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

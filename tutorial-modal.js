/**
 * Tutorial Carousel Modal - "How It Works"
 * Phase 2: Standalone carousel modal accessible anytime
 *
 * Self-contained module — no modifications to existing JS required.
 * Opens via: window.openTutorialModal()
 * Triggered from: footer "How It Works" link, or guided tour Step 10 "View Full Tutorial"
 */

(function () {
  'use strict';

  /* ============================================
     Constants
     ============================================ */
  var TOTAL_SLIDES = 10;
  var SWIPE_THRESHOLD = 50; // minimum px for a swipe gesture

  /* ============================================
     Slide Definitions
     ============================================ */
  var slides = [
    {
      title: 'Welcome to Science In A Snapshot!',
      icon: '\uD83D\uDC4B',
      description:
        'A growing library of science photos with grade-level educational content for K\u20135 teachers, aligned to the Next Generation Science Standards. Sign in with Google to unlock favorites, ratings, comments and downloadable lesson guides.',
      screenshot: null,
      screenshotAlt: 'The Science In A Snapshot homepage',
      centered: true,
    },
    {
      title: 'The Gallery',
      icon: '\uD83D\uDCF8',
      description:
        'Browse science photos across Life Science, Earth & Space Science, and Physical Science. New photos are added regularly \u2014 each one paired with AI-generated educational content you can use in your classroom.',
      screenshot: 'screenshots/slide02.png',
      screenshotAlt: 'The photo gallery grid showing science photos',
      centered: false,
    },
    {
      title: 'Category Filters',
      icon: '\uD83D\uDD0D',
      description:
        'Use the category buttons at the top of the gallery to narrow your view. Tap Life Science, Earth & Space Science, or Physical Science \u2014 or choose All to see everything.',
      screenshot: 'screenshots/slide03.png',
      screenshotAlt: 'Category filter buttons above the gallery',
      centered: false,
    },
    {
      title: 'The Notebook Icon',
      icon: '\uD83D\uDCD3',
      description:
        'This is the good stuff! Tap the notebook icon on any photo to open educational content \u2014 discussion questions, vocabulary, activities, teaching tips, and NGSS connections \u2014 all tailored to your selected grade level.',
      screenshot: 'screenshots/slide04.jpeg',
      screenshotAlt: 'A gallery card with the notebook icon highlighted',
      centered: false,
    },
    {
      title: 'Grade Level Selector',
      icon: '\uD83C\uDF93',
      description:
        'Select Kindergarten through 5th Grade and all educational content across the site adapts automatically. Try switching grades to see how the discussion questions, vocabulary, and activities change!',
      screenshot: 'screenshots/slide05.png',
      screenshotAlt: 'The grade level dropdown selector',
      centered: false,
    },
    {
      title: 'Search & NGSS Standards',
      icon: '\uD83D\uDD0E',
      description:
        'Search by keyword (like \u201Cerosion\u201D or \u201Cbutterfly\u201D) or by NGSS standard code (like 3-LS1-1) to jump straight to aligned content. The NGSS search supports standards, Disciplinary Core Ideas, and Crosscutting Concepts.',
      screenshot: 'screenshots/slide06.png',
      screenshotAlt: 'The search bar and NGSS search feature',
      centered: false,
    },
    {
      title: 'Favorites & My Collection',
      icon: '\u2764\uFE0F',
      description:
        'Tap the heart on any photo to add it to My Collection \u2014 your personal set of go-to resources. Use the My Collection filter to see just your saved photos. Requires sign-in.',
      screenshot: 'screenshots/slide07.png',
      screenshotAlt: 'A photo card with the heart/favorites icon',
      centered: false,
    },
    {
      title: 'Ratings & Comments',
      icon: '\u2B50',
      description:
        'Give photos a star rating and leave comments to share ideas, tips, or how you used a photo with other teachers. Your feedback helps the community. Requires sign-in.',
      screenshot: 'screenshots/slide08.png',
      screenshotAlt: 'Star rating and comment section on a photo',
      centered: false,
    },
    {
      title: 'Featured Collections',
      icon: '\uD83D\uDCA1',
      description:
        'Featured collections group photos by theme \u2014 like Pollination \u2014 for focused, ready-to-use lessons. Look for the Featured Collection button near the search bar.',
      screenshot: 'screenshots/slide09.png',
      screenshotAlt: 'The Featured Collection button',
      centered: false,
    },
    {
      title: "You\u2019re All Set!",
      icon: '\uD83C\uDF89',
      description:
        'Start exploring the gallery and discover science photos with ready-to-use educational content for your classroom. Happy teaching!',
      screenshot: null,
      screenshotAlt: null,
      centered: true,
      showDisclaimer: true,
    },
  ];

  /* ============================================
     State
     ============================================ */
  var currentSlide = 0;
  var modalEl = null;
  var isOpen = false;
  var touchStartX = 0;
  var touchEndX = 0;

  /* ============================================
     DOM Creation
     ============================================ */

  /**
   * Build the full modal DOM and append to document.body.
   * Called lazily on first open.
   */
  function createModal() {
    modalEl = document.createElement('div');
    modalEl.className = 'tutorial-modal';
    modalEl.setAttribute('role', 'dialog');
    modalEl.setAttribute('aria-modal', 'true');
    modalEl.setAttribute('aria-label', 'How Science In A Snapshot Works');
    modalEl.style.display = 'none';

    var html = '';

    // Overlay
    html += '<div class="tutorial-modal-overlay"></div>';

    // Content card
    html += '<div class="tutorial-modal-content">';

    // Header
    html += '<div class="tutorial-modal-header">';
    html += '<span class="tutorial-slide-counter" aria-live="polite">1 of ' + TOTAL_SLIDES + '</span>';
    html += '<button class="tutorial-close-btn" aria-label="Close tutorial">';
    html += '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
    html += '<line x1="18" y1="6" x2="6" y2="18"></line>';
    html += '<line x1="6" y1="6" x2="18" y2="18"></line>';
    html += '</svg>';
    html += '</button>';
    html += '</div>';

    // Slide container
    html += '<div class="tutorial-slide-container">';
    html += '<div class="tutorial-slide-track">';
    for (var i = 0; i < slides.length; i++) {
      html += buildSlideHTML(slides[i], i);
    }
    html += '</div>';
    html += '</div>';

    // Footer
    html += '<div class="tutorial-modal-footer">';
    html += '<button class="tutorial-nav-btn tutorial-prev-btn" disabled>';
    html += '&#8249; Back';
    html += '</button>';
    html += '<div class="tutorial-dots">';
    for (var j = 0; j < TOTAL_SLIDES; j++) {
      var dotClass = 'tutorial-dot';
      if (j === 0) dotClass += ' active';
      html += '<button class="' + dotClass + '" data-slide="' + j + '" aria-label="Go to slide ' + (j + 1) + '"';
      if (j === 0) html += ' aria-current="step"';
      html += '></button>';
    }
    html += '</div>';
    html += '<button class="tutorial-nav-btn tutorial-next-btn">';
    html += 'Next &#8250;';
    html += '</button>';
    html += '</div>';

    // Attribution
    html += '<div class="tutorial-attribution">';
    html += 'Alex Jones, M.Ed., Science and STEM Specialist';
    html += '</div>';

    html += '</div>'; // close content

    modalEl.innerHTML = html;
    document.body.appendChild(modalEl);

    // Bind events
    bindEvents();
  }

  /**
   * Build HTML for a single slide.
   */
  function buildSlideHTML(slide, index) {
    var centeredClass = slide.centered ? ' tutorial-slide-centered' : '';
    var html = '<div class="tutorial-slide' + centeredClass + '" data-slide="' + index + '"';
    if (index !== 0) html += ' aria-hidden="true"';
    html += '>';

    // Icon
    html += '<span class="tutorial-slide-icon">' + slide.icon + '</span>';

    // Title
    html += '<h3 class="tutorial-slide-title">' + escapeHtml(slide.title) + '</h3>';

    // Screenshot placeholder or real image
    if (slide.screenshot) {
      html += '<div class="tutorial-slide-screenshot has-image">';
      html += '<img src="' + escapeHtml(slide.screenshot) + '" alt="' + escapeHtml(slide.screenshotAlt || '') + '" loading="lazy">';
      html += '</div>';
    } else if (!slide.showDisclaimer && !slide.centered) {
      html += '<div class="tutorial-slide-screenshot">';
      html += '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">';
      html += '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>';
      html += '<circle cx="8.5" cy="8.5" r="1.5"></circle>';
      html += '<polyline points="21 15 16 10 5 21"></polyline>';
      html += '</svg>';
      html += '<span>Screenshot coming soon</span>';
      html += '</div>';
    }

    // Description
    html += '<p class="tutorial-slide-description">' + escapeHtml(slide.description) + '</p>';

    // AI Disclaimer (Slide 10)
    if (slide.showDisclaimer) {
      html += '<div class="tutorial-ai-notice">';
      html += '<span class="tutorial-ai-icon">\u26A0\uFE0F</span>';
      html += '<p><strong>AI-Generated Content:</strong> All educational content on this site is generated by AI and should be reviewed before classroom use.</p>';
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  /* ============================================
     Event Binding
     ============================================ */

  function bindEvents() {
    if (!modalEl) return;

    // Close button
    var closeBtn = modalEl.querySelector('.tutorial-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
    }

    // Overlay click
    var overlay = modalEl.querySelector('.tutorial-modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', closeModal);
    }

    // Next button
    var nextBtn = modalEl.querySelector('.tutorial-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        if (currentSlide === TOTAL_SLIDES - 1) {
          closeModal();
        } else {
          goNext();
        }
      });
    }

    // Previous button
    var prevBtn = modalEl.querySelector('.tutorial-prev-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', goPrev);
    }

    // Dot click navigation
    var dots = modalEl.querySelectorAll('.tutorial-dot');
    for (var i = 0; i < dots.length; i++) {
      dots[i].addEventListener('click', function () {
        var slideIndex = parseInt(this.getAttribute('data-slide'), 10);
        if (!isNaN(slideIndex)) {
          goToSlide(slideIndex);
        }
      });
    }

    // Touch/swipe support
    var container = modalEl.querySelector('.tutorial-slide-container');
    if (container) {
      container.addEventListener('touchstart', handleTouchStart, { passive: true });
      container.addEventListener('touchend', handleTouchEnd, { passive: true });
    }
  }

  /* ============================================
     Open / Close
     ============================================ */

  function openModal() {
    // Lazy create DOM on first open
    if (!modalEl) {
      createModal();
    }

    // Reset to first slide
    goToSlide(0);

    // Show modal
    modalEl.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Animate in (slight delay for transition)
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        modalEl.classList.add('active');
      });
    });

    // Bind keyboard
    document.addEventListener('keydown', handleKeyDown);

    // Focus close button
    var closeBtn = modalEl.querySelector('.tutorial-close-btn');
    if (closeBtn) {
      setTimeout(function () {
        try {
          closeBtn.focus({ preventScroll: true });
        } catch (e) {
          closeBtn.focus();
        }
      }, 350);
    }

    isOpen = true;
    console.log('[TutorialModal] Opened');
  }

  function closeModal() {
    if (!isOpen || !modalEl) return;

    modalEl.classList.remove('active');

    // Wait for fade-out animation
    setTimeout(function () {
      if (modalEl) {
        modalEl.style.display = 'none';
      }
      document.body.style.overflow = '';
    }, 300);

    // Unbind keyboard
    document.removeEventListener('keydown', handleKeyDown);

    isOpen = false;
    console.log('[TutorialModal] Closed');
  }

  /* ============================================
     Navigation
     ============================================ */

  function goToSlide(index) {
    if (index < 0 || index >= TOTAL_SLIDES) return;
    currentSlide = index;

    // Move slide track
    var track = modalEl.querySelector('.tutorial-slide-track');
    if (track) {
      track.style.transform = 'translateX(-' + (currentSlide * 100) + '%)';
    }

    // Update slide aria-hidden
    var allSlides = modalEl.querySelectorAll('.tutorial-slide');
    for (var i = 0; i < allSlides.length; i++) {
      allSlides[i].setAttribute('aria-hidden', i !== currentSlide ? 'true' : 'false');
    }

    // Update dots
    var dots = modalEl.querySelectorAll('.tutorial-dot');
    for (var j = 0; j < dots.length; j++) {
      dots[j].className = 'tutorial-dot';
      dots[j].removeAttribute('aria-current');
      if (j === currentSlide) {
        dots[j].classList.add('active');
        dots[j].setAttribute('aria-current', 'step');
      } else if (j < currentSlide) {
        dots[j].classList.add('completed');
      }
    }

    // Update counter
    var counter = modalEl.querySelector('.tutorial-slide-counter');
    if (counter) {
      counter.textContent = (currentSlide + 1) + ' of ' + TOTAL_SLIDES;
    }

    // Update button states
    var prevBtn = modalEl.querySelector('.tutorial-prev-btn');
    var nextBtn = modalEl.querySelector('.tutorial-next-btn');

    if (prevBtn) {
      prevBtn.disabled = (currentSlide === 0);
    }

    if (nextBtn) {
      if (currentSlide === TOTAL_SLIDES - 1) {
        nextBtn.innerHTML = 'Done &#10003;';
      } else {
        nextBtn.innerHTML = 'Next &#8250;';
      }
    }
  }

  function goNext() {
    if (currentSlide < TOTAL_SLIDES - 1) {
      goToSlide(currentSlide + 1);
    }
  }

  function goPrev() {
    if (currentSlide > 0) {
      goToSlide(currentSlide - 1);
    }
  }

  /* ============================================
     Keyboard Support
     ============================================ */

  function handleKeyDown(e) {
    if (!isOpen) return;

    switch (e.key) {
      case 'Escape':
        closeModal();
        break;
      case 'ArrowRight':
        goNext();
        break;
      case 'ArrowLeft':
        goPrev();
        break;
    }
  }

  /* ============================================
     Touch / Swipe Support
     ============================================ */

  function handleTouchStart(e) {
    touchStartX = e.changedTouches[0].screenX;
  }

  function handleTouchEnd(e) {
    touchEndX = e.changedTouches[0].screenX;
    var diff = touchStartX - touchEndX;
    if (Math.abs(diff) > SWIPE_THRESHOLD) {
      if (diff > 0) {
        goNext(); // swipe left = next
      } else {
        goPrev(); // swipe right = prev
      }
    }
  }

  /* ============================================
     Utility
     ============================================ */

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ============================================
     Public API
     ============================================ */
  window.openTutorialModal = openModal;
  window.closeTutorialModal = closeModal;
})();

/**
 * Lesson Snippet PDF Generator
 * Generates one-page teacher handouts from educational content using jsPDF
 */

// Cached logo base64
let _logoBase64 = null;

// ============================================================
// Section 1: Image Loading Utilities
// ============================================================

/**
 * Load the SIAS logo as base64 (lazy, cached)
 */
async function loadLogoBase64() {
  if (_logoBase64) return _logoBase64;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      _logoBase64 = canvas.toDataURL('image/png');
      resolve(_logoBase64);
    };
    img.onerror = () => resolve(null);
    img.src = 'sias_logo.png';
  });
}

/**
 * Load a photo as base64 JPEG (scaled down for PDF)
 */
async function loadPhotoBase64(imagePath) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxWidth = 300;
      const scale = Math.min(maxWidth / img.naturalWidth, 1);
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve({ data: canvas.toDataURL('image/jpeg', 0.8), width: canvas.width, height: canvas.height });
    };
    img.onerror = () => resolve(null);
    img.src = imagePath;
  });
}

// ============================================================
// Section 2: Markdown Section Parser
// ============================================================

/**
 * Extract specific sections from educational markdown content
 */
function parseLessonSections(markdownContent) {
  const sections = {};

  const patterns = {
    description:    /##\s*📸\s*Photo Description\s*\n([\s\S]*?)(?=\n##\s|$)/,
    discussion:     /##\s*💬\s*Discussion Questions\s*\n([\s\S]*?)(?=\n##\s|$)/,
    misconceptions: /##\s*🤔\s*Potential Student Misconceptions\s*\n([\s\S]*?)(?=\n##\s|$)/,
    ngss:           /##\s*🎓\s*NGSS Connections\s*\n([\s\S]*?)(?=\n##\s|$)/
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    const match = markdownContent.match(pattern);
    sections[key] = match ? match[1].trim() : null;
  }

  return sections;
}

/**
 * Strip markdown formatting for plain text PDF output
 */
function stripMarkdown(text) {
  if (!text) return '';
  return text
    // Remove NGSS wiki links → keep code only
    .replace(/\[\[NGSS:(DCI|CCC|PE):([^\]]+)\]\]/g, '$2')
    // Remove markdown bold/italic
    .replace(/\*\*\*(.*?)\*\*\*/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    // Remove markdown links [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove custom XML tags
    .replace(/<[^>]+>/g, '')
    // Clean up extra whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Format grade level slug to display name
 */
function formatGradeLabel(gradeLevel) {
  const labels = {
    'kindergarten': 'Kindergarten',
    'first-grade': '1st Grade',
    'second-grade': '2nd Grade',
    'third-grade': '3rd Grade',
    'fourth-grade': '4th Grade',
    'fifth-grade': '5th Grade'
  };
  return labels[gradeLevel] || gradeLevel;
}

/**
 * Format category slug to display name
 */
function formatCategoryLabel(category) {
  const labels = {
    'life-science': 'Life Science',
    'earth-space-science': 'Earth & Space Science',
    'physical-science': 'Physical Science'
  };
  return labels[category] || category;
}

// ============================================================
// Section 3: PDF Layout Engine
// ============================================================

/**
 * Add wrapped text to PDF with automatic line breaking
 * Returns new Y position after text
 */
function addWrappedText(doc, text, x, y, maxWidth, fontSize, maxLines) {
  doc.setFontSize(fontSize);
  const cleaned = stripMarkdown(text);
  const lines = doc.splitTextToSize(cleaned, maxWidth);
  const displayLines = maxLines ? lines.slice(0, maxLines) : lines;

  if (maxLines && lines.length > maxLines) {
    const lastLine = displayLines[maxLines - 1];
    displayLines[maxLines - 1] = lastLine.substring(0, lastLine.length - 3) + '...';
  }

  doc.text(displayLines, x, y);
  return y + (displayLines.length * (fontSize * 1.3));
}

/**
 * Add a section heading in blue
 */
function addSectionHeading(doc, title, x, y) {
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(46, 134, 171); // --color-primary
  doc.text(title, x, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(33, 33, 33);
  return y + 14;
}

/**
 * Main PDF generation function
 */
async function generateLessonPDF(image, contentData) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('portrait', 'pt', 'letter'); // 612 x 792 points

  const PAGE_WIDTH = 612;
  const PAGE_HEIGHT = 792;
  const MARGIN = 40;
  const CONTENT_WIDTH = PAGE_WIDTH - (2 * MARGIN);
  const FOOTER_ZONE = PAGE_HEIGHT - 45; // Reserve space for footer

  let y = MARGIN;

  // Parse content sections
  const sections = parseLessonSections(contentData.content);

  // --- HEADER ---
  const logo = await loadLogoBase64();
  if (logo) {
    // Logo: 604x234 original → scale to 90px wide
    const logoW = 90;
    const logoH = 90 * (234 / 604);
    doc.addImage(logo, 'PNG', MARGIN, y, logoW, logoH);
  }

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(33, 33, 33);
  const titleX = MARGIN + 100;
  doc.text(image.title, titleX, y + 16);

  // Subtitle: Grade + Category
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(117, 117, 117);
  const gradeLabel = formatGradeLabel(state.selectedGradeLevel);
  const categoryLabel = formatCategoryLabel(image.category);
  doc.text(`${gradeLabel}  |  ${categoryLabel}  |  Lesson Snippet`, titleX, y + 30);

  // Blue horizontal rule
  y += 45;
  doc.setDrawColor(46, 134, 171);
  doc.setLineWidth(1.5);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 15;

  // --- PHOTO + DESCRIPTION (side by side) ---
  const photo = await loadPhotoBase64(image.imagePath);
  const descText = sections.description || 'No description available.';

  if (photo) {
    // Scale photo to fit: max 130pt wide, max 100pt tall
    const maxPhotoW = 130;
    const maxPhotoH = 100;
    const photoScale = Math.min(maxPhotoW / photo.width, maxPhotoH / photo.height, 1);
    const photoW = photo.width * photoScale;
    const photoH = photo.height * photoScale;

    // Draw photo with thin border
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.rect(MARGIN, y, photoW + 4, photoH + 4);
    doc.addImage(photo.data, 'JPEG', MARGIN + 2, y + 2, photoW, photoH);

    // Description to the right of photo
    const descX = MARGIN + photoW + 16;
    const descWidth = CONTENT_WIDTH - photoW - 16;

    y = addSectionHeading(doc, 'Photo Description', descX, y + 10);
    doc.setFontSize(9);
    doc.setTextColor(68, 68, 68);
    const descLines = doc.splitTextToSize(stripMarkdown(descText), descWidth);
    const maxDescLines = 7;
    const showDescLines = descLines.slice(0, maxDescLines);
    doc.text(showDescLines, descX, y);

    const descEndY = y + (showDescLines.length * 11);
    const photoEndY = (y - 10) + photoH + 4;
    y = Math.max(descEndY, photoEndY) + 10;
  } else {
    // No photo — full-width description
    y = addSectionHeading(doc, 'Photo Description', MARGIN, y);
    doc.setFontSize(9);
    doc.setTextColor(68, 68, 68);
    y = addWrappedText(doc, descText, MARGIN, y, CONTENT_WIDTH, 9, 5);
    y += 8;
  }

  // --- DISCUSSION QUESTIONS ---
  if (sections.discussion && y < FOOTER_ZONE - 100) {
    y = addSectionHeading(doc, 'Discussion Questions', MARGIN, y);

    doc.setFontSize(9);
    doc.setTextColor(33, 33, 33);

    const qText = stripMarkdown(sections.discussion);
    const questions = qText.split(/\n(?=\d+\.)/).filter(q => q.trim());

    for (const q of questions) {
      if (y > FOOTER_ZONE - 30) break;

      const cleaned = q.trim();
      const lines = doc.splitTextToSize(cleaned, CONTENT_WIDTH - 10);
      const showLines = lines.slice(0, 3);

      // Indent numbered questions
      doc.text(showLines, MARGIN + 8, y);
      y += showLines.length * 11 + 4;
    }

    y += 6;
  }

  // --- STUDENT MISCONCEPTIONS ---
  if (sections.misconceptions && y < FOOTER_ZONE - 80) {
    y = addSectionHeading(doc, 'Student Misconceptions', MARGIN, y);

    doc.setFontSize(9);
    doc.setTextColor(33, 33, 33);

    const miscText = stripMarkdown(sections.misconceptions);
    // Split by numbered items
    const items = miscText.split(/\n(?=\d+\.)/).filter(m => m.trim());

    for (const item of items) {
      if (y > FOOTER_ZONE - 25) break;

      const cleaned = item.trim();
      const lines = doc.splitTextToSize(cleaned, CONTENT_WIDTH - 10);
      const showLines = lines.slice(0, 3);

      doc.text(showLines, MARGIN + 8, y);
      y += showLines.length * 11 + 4;
    }

    y += 6;
  }

  // --- NGSS STANDARDS ---
  if (sections.ngss && y < FOOTER_ZONE - 40) {
    y = addSectionHeading(doc, 'NGSS Connections', MARGIN, y);

    doc.setFontSize(8);
    doc.setTextColor(68, 68, 68);

    const ngssText = stripMarkdown(sections.ngss);
    const ngssLines = doc.splitTextToSize(ngssText, CONTENT_WIDTH);
    // Limit to fit remaining space
    const maxNgssLines = Math.min(ngssLines.length, Math.floor((FOOTER_ZONE - y - 10) / 10));
    const showNgss = ngssLines.slice(0, maxNgssLines);

    doc.text(showNgss, MARGIN, y);
    y += showNgss.length * 10;
  }

  // --- FOOTER ---
  addPDFFooter(doc, PAGE_WIDTH, PAGE_HEIGHT);

  // --- SAVE ---
  const safeTitle = image.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
  const gradeShort = formatGradeLabel(state.selectedGradeLevel).replace(/\s+/g, '');
  const filename = `${safeTitle}_${gradeShort}_Lesson_Snippet.pdf`;
  doc.save(filename);
}

/**
 * Render the footer bar
 */
function addPDFFooter(doc, pageWidth, pageHeight) {
  // Attribution line
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(150, 150, 150);
  const attribution = `Science In A Snapshot  |  \u00A9 ${new Date().getFullYear()} Alex Jones, M.Ed.  |  AI-Generated Content \u2014 Review Before Classroom Use`;
  doc.text(attribution, pageWidth / 2, pageHeight - 38, { align: 'center' });

  // Blue footer bar
  doc.setFillColor(46, 134, 171);
  doc.rect(0, pageHeight - 28, pageWidth, 28, 'F');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('FOR TEACHER USE ONLY', pageWidth / 2, pageHeight - 12, { align: 'center' });
}

// ============================================================
// Section 4: Public Entry Point
// ============================================================

/**
 * Download a lesson snippet PDF for the given image
 * Called from the modal download button
 */
async function downloadLessonPDF(imageId) {
  // Guard: check jsPDF loaded
  if (!window.jspdf) {
    alert('PDF library failed to load. Please check your internet connection and refresh the page.');
    return;
  }

  const image = state.galleryData.images.find(img => img.id === imageId);
  if (!image) {
    console.error('Image not found for PDF:', imageId);
    return;
  }

  const cacheKey = `${image.id}-${state.selectedGradeLevel}`;
  const contentData = state.loadedContent[cacheKey];
  if (!contentData) {
    alert('Content is still loading. Please wait a moment and try again.');
    return;
  }

  // Show generating state on button
  const btn = document.querySelector('.lesson-pdf-btn');
  if (btn) {
    btn.classList.add('generating');
    btn.innerHTML = '<span class="pdf-spinner"></span> Generating...';
  }

  try {
    await generateLessonPDF(image, contentData);
    console.log('PDF generated successfully for:', image.title);
  } catch (err) {
    console.error('PDF generation failed:', err);
    alert('PDF generation failed. Please try again.');
  } finally {
    // Restore button
    if (btn) {
      btn.classList.remove('generating');
      btn.innerHTML = '\uD83D\uDCC4 Download Lesson Snippet';
    }
  }
}

// Export for global access
window.downloadLessonPDF = downloadLessonPDF;

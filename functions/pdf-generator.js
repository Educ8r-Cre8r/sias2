/**
 * PDF Generator for Science In A Snapshot
 * Generates multi-page teacher lesson guide PDFs using PDFKit
 *
 * Shared module used by:
 *  - generate-pdfs.js (local batch script)
 *  - functions/index.js (Cloud Function pipeline)
 */

const PDFDocument = require('pdfkit');
const fs = require('fs').promises;
const path = require('path');

// Try to load sharp for image compression (available in functions/, optional elsewhere)
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  sharp = null; // sharp not available — will embed raw images
}

// ============================================================
// Constants
// ============================================================

const PAGE_WIDTH = 612;    // Letter width in points
const PAGE_HEIGHT = 792;   // Letter height in points
const MARGIN = 40;         // ~0.55 inch margins
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN; // 532
const FOOTER_HEIGHT = 48;  // Reserved for footer bar + attribution
const USABLE_HEIGHT = PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT; // ~704

// Font sizes — balanced for readability + fitting content in 2-3 pages
const FONT = {
  body: 9.5,
  sectionHeader: 11,
  headerTitle: 16,
  headerGrade: 11,
  headerSubtitle: 9,
  miniHeaderTitle: 11,
  calloutLabel: 9,
  calloutBody: 9,
  footerAttribution: 7,
  footerBar: 10,
  pageNumber: 7.5
};

// Color scheme (RGB arrays for PDFKit)
const COLORS = {
  primary: [46, 134, 171],       // #2E86AB
  headerText: [33, 33, 33],      // #212121
  bodyText: [68, 68, 68],        // #444444
  subtitleText: [117, 117, 117], // #757575
  lightGray: [150, 150, 150],    // #969696
  white: [255, 255, 255],

  sections: {
    photoDesc:        { bg: [227, 242, 253], text: [21, 101, 192] },   // #E3F2FD / #1565C0
    phenomena:        { bg: [232, 245, 233], text: [46, 125, 50] },    // #E8F5E9 / #2E7D32
    coreConcepts:     { bg: [241, 248, 233], text: [85, 139, 47] },    // #F1F8E9 / #558B2F
    zoomInOut:        { bg: [255, 248, 225], text: [245, 127, 23] },   // #FFF8E1 / #F57F17
    discussion:       { bg: [255, 243, 224], text: [230, 81, 0] },     // #FFF3E0 / #E65100
    misconceptions:   { bg: [255, 235, 238], text: [198, 40, 40] },    // #FFEBEE / #C62828
    extension:        { bg: [224, 247, 250], text: [0, 105, 92] },     // #E0F7FA / #00695C
    ngss:             { bg: [232, 234, 246], text: [40, 53, 147] },    // #E8EAF6 / #283593
    vocabulary:       { bg: [227, 242, 253], text: [13, 71, 161] },    // #E3F2FD / #0D47A1
    resources:        { bg: [245, 245, 245], text: [66, 66, 66] }      // #F5F5F5 / #424242
  },

  pedagogicalTip: { bg: [255, 248, 225], border: [249, 168, 37] },    // #FFF8E1 / #F9A825
  udlSuggestions:  { bg: [243, 229, 245], border: [142, 36, 170] }     // #F3E5F5 / #8E24AA
};

// Grade level display labels
const GRADE_LABELS = {
  'kindergarten': 'Kindergarten',
  'first-grade': '1st Grade',
  'second-grade': '2nd Grade',
  'third-grade': '3rd Grade',
  'fourth-grade': '4th Grade',
  'fifth-grade': '5th Grade'
};

// Category display labels
const CATEGORY_LABELS = {
  'life-science': 'Life Science',
  'earth-space-science': 'Earth & Space Science',
  'physical-science': 'Physical Science'
};

// ============================================================
// Markdown Parsing
// ============================================================

/**
 * Extract sections from educational markdown content.
 * Handles both content generation formats (older + newer).
 */
function parseSections(markdown) {
  if (!markdown) return {};

  const result = {};

  const patterns = [
    { key: 'photoDescription',    regex: /##\s*📸\s*Photo Description\s*\n([\s\S]*?)(?=\n##\s|$)/ },
    { key: 'phenomena',           regex: /##\s*🔬\s*Scientific Phenomena\s*\n([\s\S]*?)(?=\n##\s|$)/ },
    { key: 'coreConcepts',        regex: /##\s*📚\s*Core Science Concepts\s*\n([\s\S]*?)(?=\n##\s|$)/ },
    { key: 'zoomInOut',           regex: /##\s*🔍\s*Zoom In\s*\/\s*Zoom Out.*?\n([\s\S]*?)(?=\n##\s|$)/ },
    { key: 'misconceptions',      regex: /##\s*🤔\s*Potential Student Misconceptions\s*\n([\s\S]*?)(?=\n##\s|$)/ },
    { key: 'ngss',                regex: /##\s*🎓\s*NGSS Connections\s*\n([\s\S]*?)(?=\n##\s|$)/ },
    { key: 'discussion',          regex: /##\s*💬\s*Discussion Questions\s*\n([\s\S]*?)(?=\n##\s|$)/ },
    { key: 'vocabulary',          regex: /##\s*📖\s*(?:Science\s+)?Vocabulary\s*\n([\s\S]*?)(?=\n##\s|$)/ },
    { key: 'extensionActivities', regex: /##\s*🌡️?\s*Extension Activities\s*\n([\s\S]*?)(?=\n##\s|$)/ },
    { key: 'resources',           regex: /##\s*📚\s*External Resources\s*\n([\s\S]*?)(?=\n##\s|$)/ }
  ];

  for (const { key, regex } of patterns) {
    const match = markdown.match(regex);
    result[key] = match ? match[1].trim() : null;
  }

  // Extract pedagogical tip and UDL suggestions from core concepts
  if (result.coreConcepts) {
    const tipMatch = result.coreConcepts.match(/<pedagogical-tip>([\s\S]*?)<\/pedagogical-tip>/);
    const udlMatch = result.coreConcepts.match(/<udl-suggestions>([\s\S]*?)<\/udl-suggestions>/);
    result.pedagogicalTip = tipMatch ? tipMatch[1].trim() : null;
    result.udlSuggestions = udlMatch ? udlMatch[1].trim() : null;
    // Remove the tags from core concepts body
    result.coreConcepts = result.coreConcepts
      .replace(/<pedagogical-tip>[\s\S]*?<\/pedagogical-tip>/, '')
      .replace(/<udl-suggestions>[\s\S]*?<\/udl-suggestions>/, '')
      .trim();
  }

  return result;
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

// ============================================================
// PDF Rendering Helpers
// ============================================================

/**
 * Check if we need a new page. If so, add one and return the new Y position.
 * @param {PDFDocument} doc
 * @param {number} y - current Y position
 * @param {number} needed - how much vertical space is needed
 * @param {Object} headerOpts - header options for rendering mini header on new pages
 * @param {Object} state - mutable state object tracking page count
 * @returns {number} new Y position (on same or new page)
 */
function ensureSpace(doc, y, needed, headerOpts, state) {
  if (y + needed > USABLE_HEIGHT) {
    // Add footer to current page
    addFooter(doc, state.currentPage, state);
    state.currentPage++;
    doc.addPage();
    let newY = MARGIN;
    // Render mini header on continuation pages
    newY = renderHeader(doc, headerOpts, newY, true);
    return newY;
  }
  return y;
}

/**
 * Render a colored section header bar with title text
 * Returns new Y position after the header
 */
function renderSectionHeader(doc, title, y, colors) {
  const headerHeight = 22;
  const headerPadding = 5;

  // Draw colored background rectangle
  doc.save();
  doc.rect(MARGIN, y, CONTENT_WIDTH, headerHeight)
     .fill(colors.bg);

  // Draw title text
  doc.fillColor(colors.text)
     .font('Helvetica-Bold')
     .fontSize(FONT.sectionHeader)
     .text(title, MARGIN + 8, y + headerPadding, {
       width: CONTENT_WIDTH - 16,
       lineBreak: false
     });

  doc.restore();
  return y + headerHeight + 5;
}

/**
 * Render a callout box with left border accent (for tips and UDL)
 * Returns new Y position after the box
 */
function renderCalloutBox(doc, label, text, y, bgColor, borderColor) {
  const boxMargin = 10;
  const boxPadding = 8;
  const boxWidth = CONTENT_WIDTH - 2 * boxMargin;
  const textWidth = boxWidth - boxPadding * 2 - 5; // 5 for left border width

  const cleanText = stripMarkdown(text);

  // Measure text heights
  doc.font('Helvetica-Bold').fontSize(FONT.calloutLabel);
  const labelHeight = doc.heightOfString(label, { width: textWidth });
  doc.font('Helvetica').fontSize(FONT.calloutBody);
  const textHeight = doc.heightOfString(cleanText, { width: textWidth });
  const boxHeight = labelHeight + textHeight + boxPadding * 2 + 4;

  // Background fill
  doc.save();
  doc.rect(MARGIN + boxMargin, y, boxWidth, boxHeight).fill(bgColor);

  // Left border accent
  doc.rect(MARGIN + boxMargin, y, 4, boxHeight).fill(borderColor);

  // Label (bold)
  doc.fillColor([80, 80, 80])
     .font('Helvetica-Bold')
     .fontSize(FONT.calloutLabel)
     .text(label, MARGIN + boxMargin + boxPadding + 4, y + boxPadding, {
       width: textWidth
     });

  // Text (height-constrained to prevent auto-pagination)
  doc.font('Helvetica')
     .fontSize(FONT.calloutBody)
     .text(cleanText, MARGIN + boxMargin + boxPadding + 4, y + boxPadding + labelHeight + 4, {
       width: textWidth,
       height: textHeight + 2,
       ellipsis: true
     });

  doc.restore();
  return y + boxHeight + 8;
}

/**
 * Render wrapped body text with manual pagination.
 * Splits text into lines and renders them individually, creating new pages as needed.
 * CRITICAL: Each doc.text() call uses a height constraint to prevent PDFKit
 * from auto-paginating. We handle all page breaks ourselves.
 * Returns new Y position.
 */
function renderBodyText(doc, text, x, y, width, fontSize, headerOpts, state) {
  fontSize = fontSize || FONT.body;
  const cleanText = stripMarkdown(text);
  const lineGap = 3;

  doc.font('Helvetica').fontSize(fontSize).fillColor(COLORS.bodyText);

  // Split into individual lines for precise pagination
  const lines = cleanText.split('\n');
  const lineHeight = doc.currentLineHeight(true) + lineGap;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === '') {
      y += lineHeight * 0.5;
      continue;
    }

    const textHeight = doc.heightOfString(line, { width: width, lineGap: lineGap });
    const remainingSpace = USABLE_HEIGHT - y;

    // Check if we need a new page
    if (textHeight > remainingSpace && headerOpts && state) {
      addFooter(doc, state.currentPage, state);
      state.currentPage++;
      doc.addPage();
      y = MARGIN;
      y = renderHeader(doc, headerOpts, y, true);
      doc.font('Helvetica').fontSize(fontSize).fillColor(COLORS.bodyText);
    }

    // Render this line with height constraint to prevent auto-pagination
    const maxH = USABLE_HEIGHT - y;
    doc.text(line, x, y, {
      width: width,
      height: maxH > 0 ? maxH : lineHeight,
      lineGap: lineGap,
      ellipsis: true
    });
    y = doc.y;
  }

  return y + 6;
}

/**
 * Render the footer on a page: attribution line + blue bar + page number
 * Page number uses state.totalPages which is set after all content is laid out.
 */
function addFooter(doc, pageNum, state) {
  const footerY = PAGE_HEIGHT - FOOTER_HEIGHT;

  // Attribution line
  doc.font('Helvetica-Oblique')
     .fontSize(FONT.footerAttribution)
     .fillColor(COLORS.lightGray);
  const attribution = `Science In A Snapshot  |  \u00A9 ${new Date().getFullYear()} Alex Jones, M.Ed.  |  AI-Generated Content \u2014 Review Before Classroom Use`;
  doc.text(attribution, MARGIN, footerY, {
    width: CONTENT_WIDTH,
    align: 'center',
    lineBreak: false
  });

  // Blue footer bar
  const barY = footerY + 14;
  const barHeight = 26;
  doc.save();
  doc.rect(0, barY, PAGE_WIDTH, barHeight).fill(COLORS.primary);

  // "FOR TEACHER USE ONLY" text — all caps, centered, white, bold
  doc.font('Helvetica-Bold')
     .fontSize(FONT.footerBar)
     .fillColor(COLORS.white);
  doc.text('FOR TEACHER USE ONLY', 0, barY + 7, {
    width: PAGE_WIDTH,
    align: 'center',
    lineBreak: false
  });

  // Page number inside the blue bar, right-aligned
  const pageText = state.totalPages
    ? `Page ${pageNum} of ${state.totalPages}`
    : `Page ${pageNum}`;
  doc.font('Helvetica')
     .fontSize(FONT.pageNumber)
     .fillColor([200, 225, 240]); // light blue-white for contrast on blue bar
  doc.text(pageText, 0, barY + 9, {
    width: PAGE_WIDTH - MARGIN,
    align: 'right',
    lineBreak: false
  });
  doc.restore();
}

/**
 * Render the header: logo + title + grade/category + blue rule
 * Returns new Y position after the header
 */
function renderHeader(doc, options, y, mini) {
  const { title, category, gradeLevel, logoData } = options;
  const gradeLabel = GRADE_LABELS[gradeLevel] || gradeLevel;
  const categoryLabel = CATEGORY_LABELS[category] || category;

  // Logo
  if (logoData) {
    const logoW = mini ? 55 : 80;
    const logoH = logoW * (234 / 604); // Maintain aspect ratio (604x234 original)
    try {
      doc.image(logoData, MARGIN, y, { width: logoW, height: logoH });
    } catch (e) {
      // Logo failed to load — skip
    }
  }

  const textX = MARGIN + (mini ? 65 : 92);

  if (mini) {
    // Mini header for continuation pages
    doc.font('Helvetica-Bold')
       .fontSize(FONT.miniHeaderTitle)
       .fillColor(COLORS.headerText);
    doc.text(`${title} \u2014 ${gradeLabel} Lesson Guide`, textX, y + 4, {
      width: CONTENT_WIDTH - (textX - MARGIN),
      lineBreak: false
    });
    y += 24;
  } else {
    // Full header for page 1
    doc.font('Helvetica-Bold')
       .fontSize(FONT.headerTitle)
       .fillColor(COLORS.headerText);
    doc.text(title, textX, y + 2, {
      width: CONTENT_WIDTH - (textX - MARGIN) - 80,
      lineBreak: false
    });

    // Grade badge on the right
    doc.font('Helvetica-Bold')
       .fontSize(FONT.headerGrade)
       .fillColor(COLORS.primary);
    doc.text(gradeLabel, PAGE_WIDTH - MARGIN - 80, y + 4, {
      width: 80,
      align: 'right',
      lineBreak: false
    });

    // Subtitle
    doc.font('Helvetica')
       .fontSize(FONT.headerSubtitle)
       .fillColor(COLORS.subtitleText);
    doc.text(`${categoryLabel}  |  Lesson Guide`, textX, y + 22, {
      width: CONTENT_WIDTH - (textX - MARGIN),
      lineBreak: false
    });

    y += 40;
  }

  // Blue horizontal rule
  doc.save();
  doc.strokeColor(COLORS.primary)
     .lineWidth(mini ? 1 : 1.5)
     .moveTo(MARGIN, y)
     .lineTo(PAGE_WIDTH - MARGIN, y)
     .stroke();
  doc.restore();

  return y + (mini ? 8 : 12);
}

// ============================================================
// Main PDF Generation
// ============================================================

/**
 * Generate a lesson guide PDF (dynamically sized — typically 2-3 pages)
 *
 * @param {Object} options
 * @param {string} options.title - Image title
 * @param {string} options.category - Category slug
 * @param {string} options.gradeLevel - Grade key (e.g., "third-grade")
 * @param {string} options.markdownContent - Full markdown content
 * @param {string|Buffer} options.imagePath - Path to photo file OR Buffer
 * @param {string|Buffer} options.logoPath - Path to sias_logo.png OR Buffer
 * @returns {Promise<Buffer>} PDF file buffer
 */
async function generatePDF(options) {
  const { title, category, gradeLevel, markdownContent, imagePath, logoPath } = options;

  // Load and compress image data for PDF embedding
  let imageData = null;
  try {
    let rawImage;
    if (Buffer.isBuffer(imagePath)) {
      rawImage = imagePath;
    } else {
      rawImage = await fs.readFile(imagePath);
    }
    // Compress image: resize to max 400px wide, JPEG 75% quality
    if (sharp && rawImage) {
      imageData = await sharp(rawImage)
        .resize({ width: 400, withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer();
    } else {
      imageData = rawImage;
    }
  } catch (e) {
    // Image not found or processing failed — will generate without photo
  }

  // Load logo data
  let logoData = null;
  try {
    if (Buffer.isBuffer(logoPath)) {
      logoData = logoPath;
    } else {
      logoData = await fs.readFile(logoPath);
    }
  } catch (e) {
    // Logo not found — skip
  }

  // Parse content sections
  const sections = parseSections(markdownContent);

  // Header options (reused for continuation page headers)
  const headerOpts = { title, category, gradeLevel, logoData };

  // Page state tracker
  const state = { currentPage: 1, totalPages: null };

  // Create PDF document
  // Bottom margin must be small enough that PDFKit's auto-pagination threshold
  // (PAGE_HEIGHT - bottomMargin) is BELOW our entire footer zone.
  // Footer text goes as low as y≈767 + fontSize(10) ≈ 777.
  // With bottom=10, threshold = 782, safely past all footer content.
  // Body text uses explicit height constraints to stay above USABLE_HEIGHT (704).
  const doc = new PDFDocument({
    size: 'letter',
    margins: { top: MARGIN, bottom: 10, left: MARGIN, right: MARGIN },
    bufferPages: true,
    autoFirstPage: false
  });

  // Collect output chunks into a buffer
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));

  // ====== PAGE 1 ======
  doc.addPage();
  let y = MARGIN;

  // Full header
  y = renderHeader(doc, headerOpts, y, false);

  // --- Photo + Description (section header, then photo left + text right) ---
  const descText = sections.photoDescription || 'No description available.';

  y = renderSectionHeader(doc, 'Photo Description', y, COLORS.sections.photoDesc);

  if (imageData) {
    const photoStartY = y;
    const maxPhotoW = 160;
    const maxPhotoH = 120;

    try {
      // Photo (no border)
      doc.save();
      doc.image(imageData, MARGIN + 4, y + 2, {
        fit: [maxPhotoW, maxPhotoH],
        align: 'center',
        valign: 'center'
      });
      doc.restore();

      // Description text to the right of photo (height-constrained to photo height)
      const descX = MARGIN + maxPhotoW + 16;
      const descWidth = CONTENT_WIDTH - maxPhotoW - 16;
      doc.font('Helvetica')
         .fontSize(FONT.body)
         .fillColor(COLORS.bodyText);
      const descMaxH = maxPhotoH + 4; // match photo area height
      doc.text(stripMarkdown(descText), descX, y + 2, {
        width: descWidth,
        height: descMaxH,
        lineGap: 3,
        ellipsis: true
      });

      const photoEndY = photoStartY + maxPhotoH + 8;
      y = photoEndY + 8;
    } catch (e) {
      // Image embedding failed — fall through to text-only
      y = renderBodyText(doc, descText, MARGIN + 4, y, CONTENT_WIDTH - 8, null, headerOpts, state);
    }
  } else {
    // No photo — full width description
    y = renderBodyText(doc, descText, MARGIN + 4, y, CONTENT_WIDTH - 8, null, headerOpts, state);
  }

  // --- Scientific Phenomena ---
  if (sections.phenomena) {
    y = ensureSpace(doc, y, 60, headerOpts, state);
    y = renderSectionHeader(doc, 'Scientific Phenomena', y, COLORS.sections.phenomena);
    y = renderBodyText(doc, sections.phenomena, MARGIN + 4, y, CONTENT_WIDTH - 8, null, headerOpts, state);
  }

  // --- Core Science Concepts ---
  if (sections.coreConcepts) {
    y = ensureSpace(doc, y, 60, headerOpts, state);
    y = renderSectionHeader(doc, 'Core Science Concepts', y, COLORS.sections.coreConcepts);
    y = renderBodyText(doc, sections.coreConcepts, MARGIN + 4, y, CONTENT_WIDTH - 8, null, headerOpts, state);

    // Pedagogical Tip callout box
    if (sections.pedagogicalTip) {
      y = ensureSpace(doc, y, 50, headerOpts, state);
      y = renderCalloutBox(
        doc, 'Pedagogical Tip:', sections.pedagogicalTip, y,
        COLORS.pedagogicalTip.bg, COLORS.pedagogicalTip.border
      );
    }

    // UDL Suggestions callout box
    if (sections.udlSuggestions) {
      y = ensureSpace(doc, y, 50, headerOpts, state);
      y = renderCalloutBox(
        doc, 'UDL Suggestions:', sections.udlSuggestions, y,
        COLORS.udlSuggestions.bg, COLORS.udlSuggestions.border
      );
    }
  }

  // --- Zoom In / Zoom Out ---
  if (sections.zoomInOut) {
    y = ensureSpace(doc, y, 60, headerOpts, state);
    y = renderSectionHeader(doc, 'Zoom In / Zoom Out', y, COLORS.sections.zoomInOut);
    y = renderBodyText(doc, sections.zoomInOut, MARGIN + 4, y, CONTENT_WIDTH - 8, null, headerOpts, state);
  }

  // --- Discussion Questions ---
  if (sections.discussion) {
    y = ensureSpace(doc, y, 60, headerOpts, state);
    y = renderSectionHeader(doc, 'Discussion Questions', y, COLORS.sections.discussion);
    y = renderBodyText(doc, sections.discussion, MARGIN + 8, y, CONTENT_WIDTH - 16, null, headerOpts, state);
  }

  // --- Potential Student Misconceptions ---
  if (sections.misconceptions) {
    y = ensureSpace(doc, y, 60, headerOpts, state);
    y = renderSectionHeader(doc, 'Potential Student Misconceptions', y, COLORS.sections.misconceptions);
    y = renderBodyText(doc, sections.misconceptions, MARGIN + 4, y, CONTENT_WIDTH - 8, null, headerOpts, state);
  }

  // --- Extension Activities (newer content format) ---
  if (sections.extensionActivities) {
    y = ensureSpace(doc, y, 60, headerOpts, state);
    y = renderSectionHeader(doc, 'Extension Activities', y, COLORS.sections.extension);
    y = renderBodyText(doc, sections.extensionActivities, MARGIN + 4, y, CONTENT_WIDTH - 8, null, headerOpts, state);
  }

  // --- NGSS Connections ---
  if (sections.ngss) {
    y = ensureSpace(doc, y, 50, headerOpts, state);
    y = renderSectionHeader(doc, 'NGSS Connections', y, COLORS.sections.ngss);
    y = renderBodyText(doc, sections.ngss, MARGIN + 4, y, CONTENT_WIDTH - 8, null, headerOpts, state);
  }

  // --- Science Vocabulary ---
  if (sections.vocabulary) {
    y = ensureSpace(doc, y, 50, headerOpts, state);
    y = renderSectionHeader(doc, 'Science Vocabulary', y, COLORS.sections.vocabulary);
    y = renderBodyText(doc, sections.vocabulary, MARGIN + 4, y, CONTENT_WIDTH - 8, null, headerOpts, state);
  }

  // --- External Resources ---
  if (sections.resources) {
    y = ensureSpace(doc, y, 40, headerOpts, state);
    y = renderSectionHeader(doc, 'External Resources', y, COLORS.sections.resources);
    y = renderBodyText(doc, sections.resources, MARGIN + 4, y, CONTENT_WIDTH - 8, null, headerOpts, state);
  }

  // Add footer to the last page
  addFooter(doc, state.currentPage, state);

  // Now we know total page count — go back and update all footer page numbers
  const totalPages = state.currentPage;
  state.totalPages = totalPages;

  // Use bufferPages to go back and update page numbers with correct total
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    const footerY = PAGE_HEIGHT - FOOTER_HEIGHT;
    const barY = footerY + 14;
    // Overwrite old page number in blue bar with a blue rect, then redraw
    doc.save();
    doc.rect(PAGE_WIDTH - MARGIN - 100, barY, 100, 26).fill(COLORS.primary);
    doc.font('Helvetica')
       .fontSize(FONT.pageNumber)
       .fillColor([200, 225, 240]);
    doc.text(`Page ${i + 1} of ${totalPages}`, 0, barY + 9, {
      width: PAGE_WIDTH - MARGIN,
      align: 'right',
      lineBreak: false
    });
    doc.restore();
  }

  // Finalize and return buffer
  doc.end();

  return new Promise((resolve, reject) => {
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on('error', reject);
  });
}

module.exports = { generatePDF, parseSections, stripMarkdown };

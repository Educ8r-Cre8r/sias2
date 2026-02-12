/**
 * 5E Lesson Plan PDF Generator for Science In A Snapshot
 * Generates multi-page 5E instructional model lesson plan PDFs using PDFKit
 *
 * Each PDF is grade-specific, containing a full 5E lesson sequence
 * (Engage, Explore, Explain, Elaborate, Evaluate) based on one photo.
 *
 * Shared module used by:
 *  - generate-5e-pdfs.js (local batch script)
 *  - functions/index.js (Cloud Function pipeline)
 */

const PDFDocument = require('pdfkit');
const fs = require('fs').promises;
const path = require('path');

// Try to load sharp for image compression
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  sharp = null;
}

// ============================================================
// Constants (matching pdf-generator.js layout)
// ============================================================

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const FOOTER_HEIGHT = 48;
const USABLE_HEIGHT = PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT;

const FONT = {
  body: 9.5,
  sectionHeader: 11,
  headerTitle: 16,
  headerGrade: 11,
  headerSubtitle: 9,
  miniHeaderTitle: 11,
  calloutLabel: 9.5,
  calloutBody: 9,
  footerAttribution: 7,
  footerBar: 10,
  pageNumber: 7.5,
  phaseLabel: 10
};

const COLORS = {
  primary: [123, 31, 162],         // #7B1FA2 (purple for 5E)
  primaryLight: [156, 39, 176],    // #9C27B0
  headerText: [33, 33, 33],
  bodyText: [68, 68, 68],
  subtitleText: [117, 117, 117],
  lightGray: [150, 150, 150],
  white: [255, 255, 255],

  sections: {
    coreConcepts:      { bg: [243, 229, 245], text: [106, 27, 154] },   // purple
    lessonTitle:       { bg: [237, 231, 246], text: [81, 45, 168] },     // deep purple
    lessonOverview:    { bg: [232, 234, 246], text: [40, 53, 147] },     // indigo
    learningObjectives:{ bg: [227, 242, 253], text: [13, 71, 161] },     // blue
    engage:            { bg: [255, 243, 224], text: [230, 81, 0] },      // orange (warm start)
    explore:           { bg: [232, 245, 233], text: [46, 125, 50] },     // green (hands-on)
    explain:           { bg: [227, 242, 253], text: [21, 101, 192] },    // blue (knowledge)
    elaborate:         { bg: [224, 247, 250], text: [0, 105, 92] },      // teal (extend)
    evaluate:          { bg: [243, 229, 245], text: [142, 36, 170] },    // purple (assess)
    differentiation:   { bg: [255, 248, 225], text: [245, 127, 23] },    // amber
    extensions:        { bg: [241, 248, 233], text: [85, 139, 47] }      // light green
  }
};

const CATEGORY_LABELS = {
  'life-science': 'Life Science',
  'earth-space-science': 'Earth & Space Science',
  'physical-science': 'Physical Science'
};

const GRADE_LABELS = {
  'kindergarten': 'Kindergarten',
  'first-grade': '1st Grade',
  'second-grade': '2nd Grade',
  'third-grade': '3rd Grade',
  'fourth-grade': '4th Grade',
  'fifth-grade': '5th Grade'
};

// ============================================================
// 5E Content Parsing
// ============================================================

/**
 * Parse the structured markdown output from the 5E prompt.
 * Handles both ### and #### headers, and numbered/unnumbered 5E phases.
 */
function parse5ESections(markdown) {
  if (!markdown) return {};

  const result = {};

  // Top-level sections (### headers)
  const topPatterns = [
    { key: 'coreConcepts',      regex: /#{2,3}\s*Core Science Concepts[^\n]*\n([\s\S]*?)(?=\n#{2,3}\s|$)/ },
    { key: 'lessonTitle',       regex: /#{2,3}\s*Lesson Title[^\n]*\n([\s\S]*?)(?=\n#{2,3}\s|$)/ },
    { key: 'lessonOverview',    regex: /#{2,3}\s*Lesson Overview[^\n]*\n([\s\S]*?)(?=\n#{2,3}\s|$)/ },
    { key: 'learningObjectives',regex: /#{2,3}\s*Learning Objectives[^\n]*\n([\s\S]*?)(?=\n#{2,3}\s|$)/ },
    { key: 'differentiation',   regex: /#{2,3}\s*Differentiation[^\n]*\n([\s\S]*?)(?=\n#{2,3}\s|$)/ },
    { key: 'extensions',        regex: /#{2,3}\s*Extension Activities[^\n]*\n([\s\S]*?)(?=\n#{2,3}\s|$)/ }
  ];

  for (const { key, regex } of topPatterns) {
    const match = markdown.match(regex);
    result[key] = match ? match[1].trim() : null;
  }

  // 5E phase sections — match both "#### 1. ENGAGE" and "#### ENGAGE" patterns
  const phasePatterns = [
    { key: 'engage',    regex: /#{3,4}\s*(?:\d+\.\s*)?ENGAGE[^\n]*\n([\s\S]*?)(?=\n#{3,4}\s|$)/ },
    { key: 'explore',   regex: /#{3,4}\s*(?:\d+\.\s*)?EXPLORE[^\n]*\n([\s\S]*?)(?=\n#{3,4}\s|$)/ },
    { key: 'explain',   regex: /#{3,4}\s*(?:\d+\.\s*)?EXPLAIN[^\n]*\n([\s\S]*?)(?=\n#{3,4}\s|$)/ },
    { key: 'elaborate', regex: /#{3,4}\s*(?:\d+\.\s*)?ELABORATE[^\n]*\n([\s\S]*?)(?=\n#{3,4}\s|$)/ },
    { key: 'evaluate',  regex: /#{3,4}\s*(?:\d+\.\s*)?EVALUATE[^\n]*\n([\s\S]*?)(?=\n#{3,4}\s|$)/ }
  ];

  for (const { key, regex } of phasePatterns) {
    const match = markdown.match(regex);
    result[key] = match ? match[1].trim() : null;
  }

  return result;
}

/**
 * Strip markdown formatting for plain text PDF output
 */
function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*\*(.*?)\*\*\*/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ============================================================
// PDF Rendering Helpers
// ============================================================

function ensureSpace(doc, y, needed, headerOpts, state) {
  if (y + needed > USABLE_HEIGHT) {
    addFooter(doc, state.currentPage, state);
    state.currentPage++;
    doc.addPage();
    let newY = MARGIN;
    newY = renderHeader(doc, headerOpts, newY, true);
    return newY;
  }
  return y;
}

function renderSectionHeader(doc, title, y, colors) {
  const headerHeight = 22;
  const headerPadding = 5;

  doc.save();
  doc.rect(MARGIN, y, CONTENT_WIDTH, headerHeight).fill(colors.bg);
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

function renderBodyText(doc, text, x, y, width, fontSize, headerOpts, state) {
  fontSize = fontSize || FONT.body;
  const cleanText = stripMarkdown(text);
  const lineGap = 3;

  doc.font('Helvetica').fontSize(fontSize).fillColor(COLORS.bodyText);

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

    if (textHeight > remainingSpace && headerOpts && state) {
      addFooter(doc, state.currentPage, state);
      state.currentPage++;
      doc.addPage();
      y = MARGIN;
      y = renderHeader(doc, headerOpts, y, true);
      doc.font('Helvetica').fontSize(fontSize).fillColor(COLORS.bodyText);
    }

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

function addFooter(doc, pageNum, state) {
  const footerY = PAGE_HEIGHT - FOOTER_HEIGHT;

  doc.font('Helvetica-Oblique')
     .fontSize(FONT.footerAttribution)
     .fillColor(COLORS.lightGray);
  const attribution = `Science In A Snapshot  |  \u00A9 ${new Date().getFullYear()} Alex Jones, M.Ed.  |  AI-Generated Content \u2014 Review Before Classroom Use`;
  doc.text(attribution, MARGIN, footerY, {
    width: CONTENT_WIDTH,
    align: 'center',
    lineBreak: false
  });

  const barY = footerY + 14;
  const barHeight = 26;
  doc.save();
  doc.rect(0, barY, PAGE_WIDTH, barHeight).fill(COLORS.primary);

  doc.font('Helvetica-Bold')
     .fontSize(FONT.footerBar)
     .fillColor(COLORS.white);
  doc.text('FOR EDUCATIONAL PURPOSES ONLY', 0, barY + 7, {
    width: PAGE_WIDTH,
    align: 'center',
    lineBreak: false
  });

  const pageText = state.totalPages
    ? `Page ${pageNum} of ${state.totalPages}`
    : `Page ${pageNum}`;
  doc.font('Helvetica')
     .fontSize(FONT.pageNumber)
     .fillColor([220, 200, 235]);
  doc.text(pageText, 0, barY + 9, {
    width: PAGE_WIDTH - MARGIN,
    align: 'right',
    lineBreak: false
  });
  doc.restore();
}

function renderHeader(doc, options, y, mini) {
  const { title, category, gradeLevel, logoData } = options;
  const categoryLabel = CATEGORY_LABELS[category] || category;
  const gradeLabel = GRADE_LABELS[gradeLevel] || gradeLevel;

  if (logoData) {
    const logoW = mini ? 55 : 80;
    const logoH = logoW * (234 / 604);
    try {
      doc.image(logoData, MARGIN, y, { width: logoW, height: logoH });
    } catch (e) {
      // Logo failed — skip
    }
  }

  const textX = MARGIN + (mini ? 65 : 92);

  if (mini) {
    doc.font('Helvetica-Bold')
       .fontSize(FONT.miniHeaderTitle)
       .fillColor(COLORS.headerText);
    doc.text(`${title} \u2014 ${gradeLabel} 5E Lesson Plan`, textX, y + 4, {
      width: CONTENT_WIDTH - (textX - MARGIN),
      lineBreak: false
    });
    y += 24;
  } else {
    doc.font('Helvetica-Bold')
       .fontSize(FONT.headerTitle)
       .fillColor(COLORS.headerText);
    doc.text(title, textX, y + 2, {
      width: CONTENT_WIDTH - (textX - MARGIN) - 120,
      lineBreak: false
    });

    // Grade badge on the right (purple)
    doc.font('Helvetica-Bold')
       .fontSize(FONT.headerGrade)
       .fillColor(COLORS.primary);
    doc.text(`${gradeLabel}`, PAGE_WIDTH - MARGIN - 120, y + 4, {
      width: 120,
      align: 'right',
      lineBreak: false
    });

    doc.font('Helvetica')
       .fontSize(FONT.headerSubtitle)
       .fillColor(COLORS.subtitleText);
    doc.text(`${categoryLabel}  |  5E Lesson Plan`, textX, y + 22, {
      width: CONTENT_WIDTH - (textX - MARGIN),
      lineBreak: false
    });

    y += 40;
  }

  // Purple horizontal rule
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
// Main 5E PDF Generation
// ============================================================

/**
 * Generate a 5E Lesson Plan PDF
 *
 * @param {Object} options
 * @param {string} options.title - Image title
 * @param {string} options.category - Category slug
 * @param {string} options.gradeLevel - Grade level key (e.g., 'third-grade')
 * @param {string} options.markdownContent - Full markdown content from AI
 * @param {string|Buffer} options.imagePath - Path to photo file OR Buffer
 * @param {string|Buffer} options.logoPath - Path to sias_logo.png OR Buffer
 * @returns {Promise<Buffer>} PDF file buffer
 */
async function generate5EPDF(options) {
  const { title, category, gradeLevel, markdownContent, imagePath, logoPath } = options;

  // Load and compress image
  let imageData = null;
  try {
    let rawImage;
    if (Buffer.isBuffer(imagePath)) {
      rawImage = imagePath;
    } else {
      rawImage = await fs.readFile(imagePath);
    }
    if (sharp && rawImage) {
      imageData = await sharp(rawImage)
        .resize({ width: 400, withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer();
    } else {
      imageData = rawImage;
    }
  } catch (e) {
    // Image not found — generate without photo
  }

  // Load logo
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

  const sections = parse5ESections(markdownContent);
  const headerOpts = { title, category, gradeLevel, logoData };
  const state = { currentPage: 1, totalPages: null };

  const doc = new PDFDocument({
    size: 'letter',
    margins: { top: MARGIN, bottom: 10, left: MARGIN, right: MARGIN },
    bufferPages: true,
    autoFirstPage: false
  });

  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));

  // ====== PAGE 1 ======
  doc.addPage();
  let y = MARGIN;

  // Full header
  y = renderHeader(doc, headerOpts, y, false);

  // --- Photo + Core Science Concepts ---
  if (sections.coreConcepts) {
    y = renderSectionHeader(doc, 'Core Science Concepts', y, COLORS.sections.coreConcepts);

    if (imageData) {
      const photoStartY = y;
      const maxPhotoW = 140;
      const maxPhotoH = 105;

      try {
        doc.save();
        doc.image(imageData, MARGIN + 4, y + 2, {
          fit: [maxPhotoW, maxPhotoH],
          align: 'center',
          valign: 'center'
        });
        doc.restore();

        const descX = MARGIN + maxPhotoW + 16;
        const descWidth = CONTENT_WIDTH - maxPhotoW - 16;
        doc.font('Helvetica').fontSize(FONT.body).fillColor(COLORS.bodyText);
        const descMaxH = maxPhotoH + 4;
        doc.text(stripMarkdown(sections.coreConcepts), descX, y + 2, {
          width: descWidth,
          height: descMaxH,
          lineGap: 3,
          ellipsis: true
        });

        y = photoStartY + maxPhotoH + 12;
      } catch (e) {
        y = renderBodyText(doc, sections.coreConcepts, MARGIN + 4, y, CONTENT_WIDTH - 8, null, headerOpts, state);
      }
    } else {
      y = renderBodyText(doc, sections.coreConcepts, MARGIN + 4, y, CONTENT_WIDTH - 8, null, headerOpts, state);
    }
  }

  // --- Lesson Overview ---
  if (sections.lessonOverview) {
    y = ensureSpace(doc, y, 50, headerOpts, state);
    y = renderSectionHeader(doc, 'Lesson Overview', y, COLORS.sections.lessonOverview);
    y = renderBodyText(doc, sections.lessonOverview, MARGIN + 4, y, CONTENT_WIDTH - 8, null, headerOpts, state);
  }

  // --- Learning Objectives ---
  if (sections.learningObjectives) {
    y = ensureSpace(doc, y, 50, headerOpts, state);
    y = renderSectionHeader(doc, 'Learning Objectives', y, COLORS.sections.learningObjectives);
    y = renderBodyText(doc, sections.learningObjectives, MARGIN + 4, y, CONTENT_WIDTH - 8, null, headerOpts, state);
  }

  // --- 5E Phases ---
  const phases = [
    { key: 'engage',    label: '1. ENGAGE',    colors: COLORS.sections.engage },
    { key: 'explore',   label: '2. EXPLORE',   colors: COLORS.sections.explore },
    { key: 'explain',   label: '3. EXPLAIN',   colors: COLORS.sections.explain },
    { key: 'elaborate', label: '4. ELABORATE',  colors: COLORS.sections.elaborate },
    { key: 'evaluate',  label: '5. EVALUATE',  colors: COLORS.sections.evaluate }
  ];

  for (const phase of phases) {
    if (sections[phase.key]) {
      y = ensureSpace(doc, y, 60, headerOpts, state);
      y = renderSectionHeader(doc, phase.label, y, phase.colors);
      y = renderBodyText(doc, sections[phase.key], MARGIN + 4, y, CONTENT_WIDTH - 8, null, headerOpts, state);
    }
  }

  // --- Differentiation ---
  if (sections.differentiation) {
    y = ensureSpace(doc, y, 50, headerOpts, state);
    y = renderSectionHeader(doc, 'Differentiation', y, COLORS.sections.differentiation);
    y = renderBodyText(doc, sections.differentiation, MARGIN + 4, y, CONTENT_WIDTH - 8, null, headerOpts, state);
  }

  // --- Extension Activities ---
  if (sections.extensions) {
    y = ensureSpace(doc, y, 40, headerOpts, state);
    y = renderSectionHeader(doc, 'Extension Activities', y, COLORS.sections.extensions);
    y = renderBodyText(doc, sections.extensions, MARGIN + 4, y, CONTENT_WIDTH - 8, null, headerOpts, state);
  }

  // Add footer to last page
  addFooter(doc, state.currentPage, state);

  // Update page numbers with correct totals
  const totalPages = state.currentPage;
  state.totalPages = totalPages;

  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    const footerY = PAGE_HEIGHT - FOOTER_HEIGHT;
    const barY = footerY + 14;
    doc.save();
    doc.rect(PAGE_WIDTH - MARGIN - 100, barY, 100, 26).fill(COLORS.primary);
    doc.font('Helvetica')
       .fontSize(FONT.pageNumber)
       .fillColor([220, 200, 235]);
    doc.text(`Page ${i + 1} of ${totalPages}`, 0, barY + 9, {
      width: PAGE_WIDTH - MARGIN,
      align: 'right',
      lineBreak: false
    });
    doc.restore();
  }

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on('error', reject);
  });
}

module.exports = { generate5EPDF, parse5ESections, stripMarkdown };

/**
 * EDP (Engineering Design Process) PDF Generator for Science In A Snapshot
 * Generates single-page engineering challenge PDFs using PDFKit
 *
 * Each PDF contains both K-2 and 3-5 grade band tasks derived from one photo.
 *
 * Shared module used by:
 *  - generate-edp-pdfs.js (local batch script)
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
  gradeBandLabel: 10
};

const COLORS = {
  primary: [46, 134, 171],       // #2E86AB (site blue)
  engineering: [46, 125, 50],    // #2E7D32 (green for EDP)
  headerText: [33, 33, 33],
  bodyText: [68, 68, 68],
  subtitleText: [117, 117, 117],
  lightGray: [150, 150, 150],
  white: [255, 255, 255],

  sections: {
    visibleElements:  { bg: [232, 245, 233], text: [46, 125, 50] },    // green
    inferences:       { bg: [241, 248, 233], text: [85, 139, 47] },    // light green
    engineeringTask:  { bg: [255, 243, 224], text: [230, 81, 0] },     // orange
    edpPhase:         { bg: [224, 247, 250], text: [0, 105, 92] },     // teal
    materials:        { bg: [232, 234, 246], text: [40, 53, 147] },    // indigo
    time:             { bg: [243, 229, 245], text: [142, 36, 170] },   // purple
    whyItWorks:       { bg: [227, 242, 253], text: [13, 71, 161] }     // blue
  },

  gradeBand: {
    k2:  { bg: [255, 248, 225], border: [249, 168, 37] },   // warm yellow
    g35: { bg: [224, 247, 250], border: [0, 137, 123] }     // teal
  }
};

const CATEGORY_LABELS = {
  'life-science': 'Life Science',
  'earth-space-science': 'Earth & Space Science',
  'physical-science': 'Physical Science'
};

// ============================================================
// EDP Content Parsing
// ============================================================

/**
 * Extract a grade-band task from the Engineering Task section.
 * Handles multiple AI output formats:
 *   Format 1 (inline):     - **K-2**: "task text"
 *   Format 2 (sub-header): ### K-2\n<paragraphs until next header or ----->
 *   Format 3 (bold label): **K-2 Version:**\n<paragraphs until next bold or header>
 *
 * @param {string} text - The full Engineering Task section content
 * @param {string} band - 'K' for K-2 or '3' for 3-5
 * @returns {string|null} The extracted task text, or null
 */
function extractGradeBandTask(text, band) {
  if (!text) return null;

  // Build band-specific patterns
  const bandLabel = band === 'K' ? 'K[–\\-]2' : '3[–\\-]5';

  // Format 1: inline  - **K-2**: "task text"
  const inlineRegex = new RegExp(`\\*\\*${bandLabel}\\*\\*:\\s*(.+?)(?=\\n|$)`);
  const inlineMatch = text.match(inlineRegex);
  if (inlineMatch) {
    return inlineMatch[1].trim().replace(/^["""]|["""]$/g, '');
  }

  // Format 2: sub-header  ### K-2\n<paragraphs>
  const subHeaderRegex = new RegExp(`#{2,3}\\s*${bandLabel}[^\\n]*\\n([\\s\\S]*?)(?=\\n#{2,3}\\s|\\n---|-\\*\\*|$)`);
  const subHeaderMatch = text.match(subHeaderRegex);
  if (subHeaderMatch && subHeaderMatch[1].trim()) {
    return subHeaderMatch[1].trim();
  }

  // Format 3: bold label  **K-2 Version:**\n<paragraphs>
  const boldLabelRegex = new RegExp(`\\*\\*${bandLabel}[^*]*\\*\\*[:\\s]*\\n([\\s\\S]*?)(?=\\n\\*\\*[0-9K]|\\n#{2,3}\\s|\\n---|$)`);
  const boldLabelMatch = text.match(boldLabelRegex);
  if (boldLabelMatch && boldLabelMatch[1].trim()) {
    return boldLabelMatch[1].trim();
  }

  return null;
}

/**
 * Parse the structured markdown output from the engineering prompt.
 * Expected sections match the refined prompt output structure.
 */
function parseEDPSections(markdown) {
  if (!markdown) return {};

  const result = {};

  // Match both ## and ### headers (AI sometimes returns h2 instead of h3)
  const patterns = [
    { key: 'visibleElements',     regex: /#{2,3}\s*Visible Elements in Photo\s*\n([\s\S]*?)(?=\n#{2,3}\s|$)/ },
    { key: 'inferences',          regex: /#{2,3}\s*Reasonable Inferences\s*\n([\s\S]*?)(?=\n#{2,3}\s|$)/ },
    { key: 'engineeringTask',     regex: /#{2,3}\s*Engineering Task\s*\n([\s\S]*?)(?=\n#{2,3}\s[A-Z]|$)/ },
    { key: 'edpPhase',            regex: /#{2,3}\s*EDP Phase Targeted\s*\n([\s\S]*?)(?=\n#{2,3}\s|$)/ },
    { key: 'materials',           regex: /#{2,3}\s*Suggested Materials\s*\n([\s\S]*?)(?=\n#{2,3}\s|$)/ },
    { key: 'time',                regex: /#{2,3}\s*Estimated Time\s*\n([\s\S]*?)(?=\n#{2,3}\s|$)/ },
    { key: 'whyItWorks',          regex: /#{2,3}\s*Why This Works for Teachers\s*\n([\s\S]*?)(?=\n#{2,3}\s|$)/ }
  ];

  for (const { key, regex } of patterns) {
    const match = markdown.match(regex);
    result[key] = match ? match[1].trim() : null;
  }

  // Extract K-2 and 3-5 tasks from the engineering task section
  // Handles 3 formats the AI produces:
  //   Format 1 (inline):     - **K-2**: "task text here"
  //   Format 2 (sub-header): ### K-2\n<task paragraphs>
  //   Format 3 (bold label): **K-2 Version:**\n<task paragraphs>
  if (result.engineeringTask) {
    result.taskK2 = extractGradeBandTask(result.engineeringTask, 'K');
    result.taskG35 = extractGradeBandTask(result.engineeringTask, '3');
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

/**
 * Render a grade-band callout box with left border accent
 */
function renderGradeBandBox(doc, label, taskText, y, bgColor, borderColor, headerOpts, state) {
  const boxPadding = 8;
  const boxWidth = CONTENT_WIDTH;
  const textWidth = boxWidth - boxPadding * 2 - 6;

  const cleanText = stripMarkdown(taskText);

  doc.font('Helvetica-Bold').fontSize(FONT.gradeBandLabel);
  const labelHeight = doc.heightOfString(label, { width: textWidth });
  doc.font('Helvetica').fontSize(FONT.body);
  const textHeight = doc.heightOfString(cleanText, { width: textWidth });
  const boxHeight = labelHeight + textHeight + boxPadding * 2 + 4;

  y = ensureSpace(doc, y, boxHeight + 4, headerOpts, state);

  doc.save();
  doc.rect(MARGIN, y, boxWidth, boxHeight).fill(bgColor);
  doc.rect(MARGIN, y, 4, boxHeight).fill(borderColor);

  doc.fillColor([80, 80, 80])
     .font('Helvetica-Bold')
     .fontSize(FONT.gradeBandLabel)
     .text(label, MARGIN + boxPadding + 4, y + boxPadding, { width: textWidth });

  doc.font('Helvetica')
     .fontSize(FONT.body)
     .fillColor(COLORS.bodyText)
     .text(cleanText, MARGIN + boxPadding + 4, y + boxPadding + labelHeight + 4, {
       width: textWidth,
       height: textHeight + 2,
       ellipsis: true
     });

  doc.restore();
  return y + boxHeight + 8;
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
  doc.rect(0, barY, PAGE_WIDTH, barHeight).fill(COLORS.engineering);

  doc.font('Helvetica-Bold')
     .fontSize(FONT.footerBar)
     .fillColor(COLORS.white);
  doc.text('FOR TEACHER USE ONLY', 0, barY + 7, {
    width: PAGE_WIDTH,
    align: 'center',
    lineBreak: false
  });

  const pageText = state.totalPages
    ? `Page ${pageNum} of ${state.totalPages}`
    : `Page ${pageNum}`;
  doc.font('Helvetica')
     .fontSize(FONT.pageNumber)
     .fillColor([200, 235, 210]);
  doc.text(pageText, 0, barY + 9, {
    width: PAGE_WIDTH - MARGIN,
    align: 'right',
    lineBreak: false
  });
  doc.restore();
}

function renderHeader(doc, options, y, mini) {
  const { title, category, logoData } = options;
  const categoryLabel = CATEGORY_LABELS[category] || category;

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
    doc.text(`${title} \u2014 Engineering Challenge`, textX, y + 4, {
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

    // EDP badge on the right
    doc.font('Helvetica-Bold')
       .fontSize(FONT.headerGrade)
       .fillColor(COLORS.engineering);
    doc.text('Engineering Challenge', PAGE_WIDTH - MARGIN - 120, y + 4, {
      width: 120,
      align: 'right',
      lineBreak: false
    });

    doc.font('Helvetica')
       .fontSize(FONT.headerSubtitle)
       .fillColor(COLORS.subtitleText);
    doc.text(`${categoryLabel}  |  Engineering Design Process`, textX, y + 22, {
      width: CONTENT_WIDTH - (textX - MARGIN),
      lineBreak: false
    });

    y += 40;
  }

  // Green horizontal rule (instead of blue)
  doc.save();
  doc.strokeColor(COLORS.engineering)
     .lineWidth(mini ? 1 : 1.5)
     .moveTo(MARGIN, y)
     .lineTo(PAGE_WIDTH - MARGIN, y)
     .stroke();
  doc.restore();

  return y + (mini ? 8 : 12);
}

// ============================================================
// Main EDP PDF Generation
// ============================================================

/**
 * Generate an Engineering Design Process PDF
 *
 * @param {Object} options
 * @param {string} options.title - Image title
 * @param {string} options.category - Category slug
 * @param {string} options.markdownContent - Full markdown content from AI
 * @param {string|Buffer} options.imagePath - Path to photo file OR Buffer
 * @param {string|Buffer} options.logoPath - Path to sias_logo.png OR Buffer
 * @returns {Promise<Buffer>} PDF file buffer
 */
async function generateEDPpdf(options) {
  const { title, category, markdownContent, imagePath, logoPath } = options;

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

  const sections = parseEDPSections(markdownContent);
  const headerOpts = { title, category, logoData };
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

  // --- Photo + Visible Elements ---
  if (sections.visibleElements) {
    y = renderSectionHeader(doc, 'Visible Elements in Photo', y, COLORS.sections.visibleElements);

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
        doc.text(stripMarkdown(sections.visibleElements), descX, y + 2, {
          width: descWidth,
          height: descMaxH,
          lineGap: 3,
          ellipsis: true
        });

        y = photoStartY + maxPhotoH + 12;
      } catch (e) {
        y = renderBodyText(doc, sections.visibleElements, MARGIN + 4, y, CONTENT_WIDTH - 8, null, headerOpts, state);
      }
    } else {
      y = renderBodyText(doc, sections.visibleElements, MARGIN + 4, y, CONTENT_WIDTH - 8, null, headerOpts, state);
    }
  }

  // --- Reasonable Inferences ---
  if (sections.inferences) {
    y = ensureSpace(doc, y, 50, headerOpts, state);
    y = renderSectionHeader(doc, 'Reasonable Inferences', y, COLORS.sections.inferences);
    y = renderBodyText(doc, sections.inferences, MARGIN + 4, y, CONTENT_WIDTH - 8, null, headerOpts, state);
  }

  // --- Engineering Task (K-2 and 3-5 callout boxes) ---
  y = ensureSpace(doc, y, 60, headerOpts, state);
  y = renderSectionHeader(doc, 'Engineering Task', y, COLORS.sections.engineeringTask);

  if (sections.taskK2) {
    y = renderGradeBandBox(doc, 'K-2 Challenge:', sections.taskK2, y,
      COLORS.gradeBand.k2.bg, COLORS.gradeBand.k2.border, headerOpts, state);
  }
  if (sections.taskG35) {
    y = renderGradeBandBox(doc, '3-5 Challenge:', sections.taskG35, y,
      COLORS.gradeBand.g35.bg, COLORS.gradeBand.g35.border, headerOpts, state);
  }
  // Fallback if individual tasks weren't parsed
  if (!sections.taskK2 && !sections.taskG35 && sections.engineeringTask) {
    y = renderBodyText(doc, sections.engineeringTask, MARGIN + 4, y, CONTENT_WIDTH - 8, null, headerOpts, state);
  }

  // --- EDP Phase Targeted ---
  if (sections.edpPhase) {
    y = ensureSpace(doc, y, 50, headerOpts, state);
    y = renderSectionHeader(doc, 'EDP Phase Targeted', y, COLORS.sections.edpPhase);
    y = renderBodyText(doc, sections.edpPhase, MARGIN + 4, y, CONTENT_WIDTH - 8, null, headerOpts, state);
  }

  // --- Suggested Materials ---
  if (sections.materials) {
    y = ensureSpace(doc, y, 50, headerOpts, state);
    y = renderSectionHeader(doc, 'Suggested Materials', y, COLORS.sections.materials);
    y = renderBodyText(doc, sections.materials, MARGIN + 4, y, CONTENT_WIDTH - 8, null, headerOpts, state);
  }

  // --- Estimated Time ---
  if (sections.time) {
    y = ensureSpace(doc, y, 40, headerOpts, state);
    y = renderSectionHeader(doc, 'Estimated Time', y, COLORS.sections.time);
    y = renderBodyText(doc, sections.time, MARGIN + 4, y, CONTENT_WIDTH - 8, null, headerOpts, state);
  }

  // --- Why This Works for Teachers ---
  if (sections.whyItWorks) {
    y = ensureSpace(doc, y, 40, headerOpts, state);
    y = renderSectionHeader(doc, 'Why This Works for Teachers', y, COLORS.sections.whyItWorks);
    y = renderBodyText(doc, sections.whyItWorks, MARGIN + 4, y, CONTENT_WIDTH - 8, null, headerOpts, state);
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
    doc.rect(PAGE_WIDTH - MARGIN - 100, barY, 100, 26).fill(COLORS.engineering);
    doc.font('Helvetica')
       .fontSize(FONT.pageNumber)
       .fillColor([200, 235, 210]);
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

module.exports = { generateEDPpdf, parseEDPSections, stripMarkdown };

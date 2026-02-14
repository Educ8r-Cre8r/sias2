/**
 * Sentence Stems Poster Generator for Science In A Snapshot
 * Generates a single-page landscape classroom poster using PDFKit
 *
 * Used by: functions/index.js (generateSentenceStemsPoster Cloud Function)
 */

const PDFDocument = require('pdfkit');

// ============================================================
// Constants — Landscape Letter
// ============================================================

const PAGE_WIDTH = 792;    // Letter landscape width in points
const PAGE_HEIGHT = 612;   // Letter landscape height in points
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN; // 712

// Color scheme (RGB arrays) — matches pdf-generator.js palette
const COLORS = {
  primary: [46, 134, 171],       // #2E86AB
  secondary: [162, 59, 114],     // #A23B72
  accent: [241, 143, 1],         // #F18F01
  headerText: [33, 33, 33],      // #212121
  bodyText: [68, 68, 68],        // #444444
  subtitleText: [117, 117, 117], // #757575
  lightGray: [150, 150, 150],
  white: [255, 255, 255],

  // Card backgrounds for each stem
  stems: [
    { bg: [227, 242, 253], border: [46, 134, 171] },    // Blue
    { bg: [232, 245, 233], border: [76, 175, 80] },     // Green
    { bg: [255, 248, 225], border: [241, 143, 1] },     // Amber
    { bg: [243, 229, 245], border: [162, 59, 114] }     // Purple
  ]
};

// Sentence stems data
const STEMS = [
  {
    num: 1,
    text: '"I notice ______, and I wonder ______."',
    skill: 'Observation + Curiosity',
    description: 'Builds observation and curiosity — the foundation of scientific habits of mind'
  },
  {
    num: 2,
    text: '"This reminds me of ______ because ______."',
    skill: 'Prior Knowledge',
    description: 'Activates prior knowledge and pattern recognition — key for conceptual change'
  },
  {
    num: 3,
    text: '"If I could ask this [plant/animal/object] one question, I\'d ask ______."',
    skill: 'Inquiry',
    description: 'Humanizes inquiry without anthropomorphizing; reveals misconceptions gently'
  },
  {
    num: 4,
    text: '"One thing that might be changing here is ______."',
    skill: 'Temporal Thinking',
    description: 'Introduces temporal thinking — critical for phenomena like erosion, growth, or weather'
  }
];

// ============================================================
// Main Generator
// ============================================================

/**
 * Generate a personalized sentence stems poster PDF
 * @param {Object} options
 * @param {string} [options.teacherName] - e.g., "Mrs. Smith"
 * @param {string} [options.gradeLevel] - e.g., "3rd Grade"
 * @param {Buffer} [options.logoData] - SIAS logo image buffer
 * @returns {Promise<Buffer>} PDF as a Buffer
 */
async function generateStemsPoster({ teacherName, gradeLevel, logoData }) {
  const doc = new PDFDocument({
    size: 'letter',
    layout: 'landscape',
    margins: { top: MARGIN, bottom: 10, left: MARGIN, right: MARGIN },
    bufferPages: true,
    autoFirstPage: false
  });

  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));

  doc.addPage();

  let y = MARGIN;

  // === HEADER ===
  y = renderPosterHeader(doc, { teacherName, gradeLevel, logoData }, y);

  // === STEMS (2x2 grid) ===
  y = renderStemsGrid(doc, y);

  // === FOOTER ===
  renderPosterFooter(doc);

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

// ============================================================
// Header
// ============================================================

function renderPosterHeader(doc, options, y) {
  const { teacherName, gradeLevel, logoData } = options;

  // Logo on the left
  const logoW = 70;
  const logoH = logoW * (234 / 604);
  if (logoData) {
    try {
      doc.image(logoData, MARGIN, y, { width: logoW, height: logoH });
    } catch (e) {
      // Logo failed — skip
    }
  }

  const textX = MARGIN + logoW + 14;

  // Title
  doc.font('Helvetica-Bold')
     .fontSize(22)
     .fillColor(COLORS.primary);
  doc.text('Scientific Thinking Sentence Stems', textX, y + 2, {
    width: CONTENT_WIDTH - logoW - 14,
    lineBreak: false
  });

  // Subtitle
  doc.font('Helvetica')
     .fontSize(10)
     .fillColor(COLORS.subtitleText);
  doc.text('Research-backed prompts for K-5 science discussions', textX, y + 28, {
    width: CONTENT_WIDTH - logoW - 14,
    lineBreak: false
  });

  // Teacher name + grade (if provided)
  if (teacherName || gradeLevel) {
    const parts = [];
    if (teacherName) parts.push(teacherName);
    if (gradeLevel) parts.push(gradeLevel);
    const teacherLine = parts.join(' — ');

    doc.font('Helvetica-Bold')
       .fontSize(13)
       .fillColor(COLORS.secondary);
    doc.text(teacherLine, textX, y + 44, {
      width: CONTENT_WIDTH - logoW - 14,
      lineBreak: false
    });
    y += 68;
  } else {
    y += 52;
  }

  // Blue divider line
  doc.save();
  doc.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y)
     .strokeColor(COLORS.primary).lineWidth(2).stroke();
  doc.restore();

  y += 14;
  return y;
}

// ============================================================
// Stems Grid (2x2)
// ============================================================

function renderStemsGrid(doc, startY) {
  const gridGap = 14;
  const colWidth = (CONTENT_WIDTH - gridGap) / 2;
  const footerReserved = 56;
  const availableHeight = PAGE_HEIGHT - startY - footerReserved - MARGIN;
  const rowHeight = (availableHeight - gridGap) / 2;

  const positions = [
    { x: MARGIN,                    y: startY },
    { x: MARGIN + colWidth + gridGap, y: startY },
    { x: MARGIN,                    y: startY + rowHeight + gridGap },
    { x: MARGIN + colWidth + gridGap, y: startY + rowHeight + gridGap }
  ];

  STEMS.forEach((stem, i) => {
    const pos = positions[i];
    const color = COLORS.stems[i];

    // Card background
    doc.save();
    doc.roundedRect(pos.x, pos.y, colWidth, rowHeight, 8)
       .fill(color.bg);
    doc.restore();

    // Left border accent
    doc.save();
    doc.rect(pos.x, pos.y, 5, rowHeight).fill(color.border);
    doc.restore();

    const cardPadding = 16;
    const textX = pos.x + cardPadding + 6; // After the border accent
    const textW = colWidth - cardPadding * 2 - 6;
    let textY = pos.y + cardPadding;

    // Number badge
    const badgeSize = 28;
    doc.save();
    doc.circle(pos.x + cardPadding + badgeSize / 2 + 3, textY + badgeSize / 2, badgeSize / 2)
       .fill(color.border);
    doc.font('Helvetica-Bold')
       .fontSize(14)
       .fillColor(COLORS.white);
    doc.text(String(stem.num), pos.x + cardPadding + 3, textY + 6, {
      width: badgeSize,
      align: 'center',
      lineBreak: false
    });
    doc.restore();

    // Skill label (right of badge)
    doc.font('Helvetica-Bold')
       .fontSize(10)
       .fillColor(color.border);
    doc.text(stem.skill, pos.x + cardPadding + badgeSize + 14, textY + 8, {
      width: textW - badgeSize - 14,
      lineBreak: false
    });

    textY += badgeSize + 12;

    // Stem text (large, readable)
    doc.font('Helvetica-Bold')
       .fontSize(14)
       .fillColor(COLORS.headerText);
    doc.text(stem.text, textX, textY, {
      width: textW,
      lineGap: 3
    });

    textY = doc.y + 8;

    // Description
    doc.font('Helvetica-Oblique')
       .fontSize(9)
       .fillColor(COLORS.subtitleText);
    doc.text(stem.description, textX, textY, {
      width: textW,
      lineGap: 2
    });
  });

  return startY + (rowHeight * 2) + gridGap;
}

// ============================================================
// Footer
// ============================================================

function renderPosterFooter(doc) {
  const footerY = PAGE_HEIGHT - 52;

  // Attribution line
  doc.font('Helvetica-Oblique')
     .fontSize(7)
     .fillColor(COLORS.lightGray);
  const attribution = `Science In A Snapshot  |  \u00A9 ${new Date().getFullYear()} Alex Jones, M.Ed.  |  All rights reserved.`;
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

  // "FOR EDUCATIONAL PURPOSES ONLY" — centered, white, bold
  doc.font('Helvetica-Bold')
     .fontSize(10)
     .fillColor(COLORS.white);
  doc.text('FOR EDUCATIONAL PURPOSES ONLY', 0, barY + 7, {
    width: PAGE_WIDTH,
    align: 'center',
    lineBreak: false
  });
  doc.restore();
}

module.exports = { generateStemsPoster };

/**
 * Rubric PDF Generator for Science In A Snapshot
 * Generates teacher-facing scoring rubric PDFs using PDFKit
 *
 * Each PDF contains a 4-point rubric table for discussion questions.
 * Rubric criteria are AI-generated for each grade level.
 *
 * Shared module used by:
 *  - functions/index.js (Cloud Function pipeline)
 */

const PDFDocument = require('pdfkit');
const fs = require('fs').promises;

// ============================================================
// Constants (matching pdf-generator.js layout)
// ============================================================

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN; // 532
const FOOTER_HEIGHT = 48;
const USABLE_HEIGHT = PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT;

const FONT = {
  body: 7,              // Smaller for table cells
  tableHeader: 7.5,
  questionText: 7.5,
  sectionHeader: 11,
  headerTitle: 16,
  headerGrade: 11,
  headerSubtitle: 9,
  miniHeaderTitle: 11,
  scaleLabel: 9,
  footerAttribution: 7,
  footerBar: 10,
  pageNumber: 7.5
};

// Deep Orange color scheme for rubrics
const COLORS = {
  primary: [216, 67, 21],         // #D84315 (deep orange)
  headerText: [33, 33, 33],       // #212121
  bodyText: [68, 68, 68],         // #444444
  subtitleText: [117, 117, 117],  // #757575
  lightGray: [150, 150, 150],     // #969696
  white: [255, 255, 255],
  tableHeaderBg: [216, 67, 21],   // Deep orange header row
  tableHeaderText: [255, 255, 255],
  tableBorder: [200, 200, 200],   // #C8C8C8
  rowEven: [255, 255, 255],       // White
  rowOdd: [253, 246, 243],        // Very light orange tint
  questionCol: [250, 250, 250],   // Light gray for question column
  pageNumberContrast: [255, 210, 190], // Light orange-white for footer bar

  // Proficiency level colors for column headers
  levels: {
    exceeds:     { bg: [232, 245, 233], text: [46, 125, 50] },    // Green
    meets:       { bg: [227, 242, 253], text: [21, 101, 192] },   // Blue
    approaching: { bg: [255, 248, 225], text: [245, 127, 23] },   // Amber
    beginning:   { bg: [255, 235, 238], text: [198, 40, 40] }     // Red
  }
};

const GRADE_LABELS = {
  'kindergarten': 'Kindergarten',
  'first-grade': '1st Grade',
  'second-grade': '2nd Grade',
  'third-grade': '3rd Grade',
  'fourth-grade': '4th Grade',
  'fifth-grade': '5th Grade'
};

const CATEGORY_LABELS = {
  'life-science': 'Life Science',
  'earth-space-science': 'Earth & Space Science',
  'physical-science': 'Physical Science'
};

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

function addFooter(doc, pageNum, state) {
  const footerY = PAGE_HEIGHT - FOOTER_HEIGHT;

  // Attribution line (same as all other SIAS PDFs)
  doc.font('Helvetica-Oblique')
     .fontSize(FONT.footerAttribution)
     .fillColor(COLORS.lightGray);
  const attribution = `Science In A Snapshot  |  \u00A9 ${new Date().getFullYear()} Alex Jones, M.Ed.  |  AI-Generated Content \u2014 Review Before Classroom Use`;
  doc.text(attribution, MARGIN, footerY, {
    width: CONTENT_WIDTH,
    align: 'center',
    lineBreak: false
  });

  // Deep orange footer bar
  const barY = footerY + 14;
  const barHeight = 26;
  doc.save();
  doc.rect(0, barY, PAGE_WIDTH, barHeight).fill(COLORS.primary);

  // "FOR TEACHER USE ONLY" text
  doc.font('Helvetica-Bold')
     .fontSize(FONT.footerBar)
     .fillColor(COLORS.white);
  doc.text('FOR TEACHER USE ONLY', 0, barY + 7, {
    width: PAGE_WIDTH,
    align: 'center',
    lineBreak: false
  });

  // Page number
  const pageText = state.totalPages
    ? `Page ${pageNum} of ${state.totalPages}`
    : `Page ${pageNum}`;
  doc.font('Helvetica')
     .fontSize(FONT.pageNumber)
     .fillColor(COLORS.pageNumberContrast);
  doc.text(pageText, 0, barY + 9, {
    width: PAGE_WIDTH - MARGIN,
    align: 'right',
    lineBreak: false
  });
  doc.restore();
}

function renderHeader(doc, options, y, mini) {
  const { title, category, gradeLevel, logoData } = options;
  const gradeLabel = GRADE_LABELS[gradeLevel] || gradeLevel;
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
    doc.text(`${title} \u2014 ${gradeLabel} Scoring Rubric`, textX, y + 4, {
      width: CONTENT_WIDTH - (textX - MARGIN),
      lineBreak: false
    });
    y += 24;
  } else {
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
    doc.text(`${categoryLabel}  |  Scoring Rubric`, textX, y + 22, {
      width: CONTENT_WIDTH - (textX - MARGIN),
      lineBreak: false
    });

    y += 40;
  }

  // Deep orange horizontal rule
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
// Table Rendering
// ============================================================

// Column widths: Question gets more space, rubric levels split the rest
const COL_QUESTION_WIDTH = Math.round(CONTENT_WIDTH * 0.28); // ~149pt
const COL_LEVEL_WIDTH = Math.round((CONTENT_WIDTH - COL_QUESTION_WIDTH) / 4); // ~96pt each
const COL_WIDTHS = [
  COL_QUESTION_WIDTH,
  COL_LEVEL_WIDTH,
  COL_LEVEL_WIDTH,
  COL_LEVEL_WIDTH,
  CONTENT_WIDTH - COL_QUESTION_WIDTH - (COL_LEVEL_WIDTH * 3) // last col gets remainder
];

const COL_HEADERS = ['Question', 'Exceeds (4)', 'Meets (3)', 'Approaching (2)', 'Beginning (1)'];
const LEVEL_COLORS = [
  null, // question column — uses different styling
  COLORS.levels.exceeds,
  COLORS.levels.meets,
  COLORS.levels.approaching,
  COLORS.levels.beginning
];

const CELL_PADDING = 4;

/**
 * Render the table header row
 */
function renderTableHeader(doc, y) {
  let x = MARGIN;
  const headerHeight = 22;

  for (let i = 0; i < COL_HEADERS.length; i++) {
    // Background
    doc.save();
    doc.rect(x, y, COL_WIDTHS[i], headerHeight).fill(COLORS.tableHeaderBg);

    // Text
    doc.fillColor(COLORS.tableHeaderText)
       .font('Helvetica-Bold')
       .fontSize(FONT.tableHeader);
    doc.text(COL_HEADERS[i], x + CELL_PADDING, y + 6, {
      width: COL_WIDTHS[i] - (CELL_PADDING * 2),
      align: 'center',
      lineBreak: false
    });
    doc.restore();

    x += COL_WIDTHS[i];
  }

  return y + headerHeight;
}

/**
 * Measure the height needed for a rubric row
 */
function measureRowHeight(doc, question, rubric) {
  const cellTexts = [
    question.questionText || '',
    rubric.exceeds || '',
    rubric.meets || '',
    rubric.approaching || '',
    rubric.beginning || ''
  ];

  let maxHeight = 0;
  for (let i = 0; i < cellTexts.length; i++) {
    const font = i === 0 ? 'Helvetica-Bold' : 'Helvetica';
    const fontSize = i === 0 ? FONT.questionText : FONT.body;
    doc.font(font).fontSize(fontSize);
    const textWidth = COL_WIDTHS[i] - (CELL_PADDING * 2);
    const h = doc.heightOfString(cellTexts[i], { width: textWidth }) + (CELL_PADDING * 2) + 2;
    if (h > maxHeight) maxHeight = h;
  }

  return Math.max(maxHeight, 36); // minimum row height
}

/**
 * Render a single rubric table row
 */
function renderTableRow(doc, question, rubric, y, rowIndex) {
  const rowHeight = measureRowHeight(doc, question, rubric);

  const cellTexts = [
    question.questionText || '',
    rubric.exceeds || '',
    rubric.meets || '',
    rubric.approaching || '',
    rubric.beginning || ''
  ];

  let x = MARGIN;
  const isOdd = rowIndex % 2 === 1;

  for (let i = 0; i < cellTexts.length; i++) {
    // Cell background
    let bgColor;
    if (i === 0) {
      bgColor = COLORS.questionCol;
    } else {
      bgColor = isOdd ? COLORS.rowOdd : COLORS.rowEven;
    }

    doc.save();
    // Fill background
    doc.rect(x, y, COL_WIDTHS[i], rowHeight).fill(bgColor);
    // Draw border
    doc.rect(x, y, COL_WIDTHS[i], rowHeight)
       .lineWidth(0.5)
       .strokeColor(COLORS.tableBorder)
       .stroke();

    // Cell text
    const font = i === 0 ? 'Helvetica-Bold' : 'Helvetica';
    const fontSize = i === 0 ? FONT.questionText : FONT.body;
    const textColor = i === 0 ? COLORS.headerText : COLORS.bodyText;

    doc.fillColor(textColor)
       .font(font)
       .fontSize(fontSize);
    doc.text(cellTexts[i], x + CELL_PADDING, y + CELL_PADDING, {
      width: COL_WIDTHS[i] - (CELL_PADDING * 2),
      height: rowHeight - (CELL_PADDING * 2),
      ellipsis: true
    });

    doc.restore();
    x += COL_WIDTHS[i];
  }

  return y + rowHeight;
}

// ============================================================
// Main Rubric PDF Generation
// ============================================================

/**
 * Generate a scoring rubric PDF with a 4-point table for each discussion question.
 *
 * @param {Object} options
 * @param {string} options.title - Image title
 * @param {string} options.category - Category slug
 * @param {string} options.gradeLevel - Grade key (e.g., "third-grade")
 * @param {Object} options.rubricData - Parsed rubric JSON with questions array
 * @param {string|Buffer} options.logoPath - Path to sias_logo.png OR Buffer
 * @returns {Promise<Buffer>} PDF file buffer
 */
async function generateRubricPDF(options) {
  const { title, category, gradeLevel, rubricData, logoPath } = options;

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

  // Scale description
  doc.font('Helvetica')
     .fontSize(FONT.scaleLabel)
     .fillColor(COLORS.bodyText);
  doc.text('4 = Exceeds Expectations  |  3 = Meets Expectations  |  2 = Approaching  |  1 = Beginning', MARGIN, y, {
    width: CONTENT_WIDTH,
    align: 'center'
  });
  y = doc.y + 8;

  // Table header
  y = renderTableHeader(doc, y);

  // Table rows — one per question
  const questions = rubricData.questions || [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const rubric = q.rubric || {};

    // Measure row height and check if we need a new page
    const rowHeight = measureRowHeight(doc, q, rubric);
    const tableHeaderHeight = 22; // need to re-render header on new page

    if (y + rowHeight > USABLE_HEIGHT) {
      // Need a new page
      addFooter(doc, state.currentPage, state);
      state.currentPage++;
      doc.addPage();
      y = MARGIN;
      y = renderHeader(doc, headerOpts, y, true);
      // Re-render table header on new page
      y = renderTableHeader(doc, y);
    }

    y = renderTableRow(doc, q, rubric, y, i);
  }

  // Add some space after the table
  y += 10;

  // Scoring guide note
  if (y + 30 < USABLE_HEIGHT) {
    doc.font('Helvetica-Oblique')
       .fontSize(7.5)
       .fillColor(COLORS.subtitleText);
    doc.text('Note: This rubric is AI-generated based on the discussion questions for this photograph. Review and adjust criteria as needed for your classroom context.', MARGIN, y, {
      width: CONTENT_WIDTH
    });
  }

  // Add footer to last page
  addFooter(doc, state.currentPage, state);

  // Update page numbers
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
       .fillColor(COLORS.pageNumberContrast);
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

module.exports = { generateRubricPDF };

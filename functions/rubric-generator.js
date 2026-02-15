/**
 * Rubric PDF Generator for Science In A Snapshot
 * Generates teacher-facing scoring rubric PDFs using PDFKit
 *
 * Each PDF contains a 4-point rubric table for discussion questions.
 * Rubric criteria are AI-generated for each grade level.
 * Layout: LANDSCAPE, single page only. Font sizes maximized to fill the page.
 *
 * Shared module used by:
 *  - functions/index.js (Cloud Function pipeline)
 *  - tools/backfill-rubrics.js (terminal backfill)
 */

const PDFDocument = require('pdfkit');
const fs = require('fs').promises;

// ============================================================
// Constants — Landscape Letter (11" × 8.5")
// ============================================================

const PAGE_WIDTH = 792;   // 11 inches
const PAGE_HEIGHT = 612;  // 8.5 inches
const MARGIN = 36;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN; // 720
const FOOTER_HEIGHT = 44;
const USABLE_HEIGHT = PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT;

// Fixed vertical space consumed by header + scale + table header
// Header: ~42pt, scale: ~20pt, table header: ~24pt = ~86pt
const HEADER_OVERHEAD = 86;
const TABLE_SPACE = USABLE_HEIGHT - HEADER_OVERHEAD; // ~446pt for rows + note

const FONT = {
  body: 9,
  tableHeader: 9,
  questionText: 9.5,
  bloomsDok: 7.5,
  headerTitle: 16,
  headerGrade: 12,
  headerSubtitle: 10,
  scaleLabel: 9,
  noteText: 7.5,
  footerAttribution: 7,
  footerBar: 9,
  pageNumber: 7
};

// Deep Orange color scheme for rubrics
const COLORS = {
  primary: [216, 67, 21],         // #D84315 (deep orange)
  headerText: [33, 33, 33],       // #212121
  bodyText: [68, 68, 68],         // #444444
  subtitleText: [117, 117, 117],  // #757575
  lightGray: [150, 150, 150],     // #969696
  bloomsDok: [130, 130, 130],     // Lighter gray for Bloom's/DOK annotation
  white: [255, 255, 255],
  tableHeaderBg: [216, 67, 21],   // Deep orange header row
  tableHeaderText: [255, 255, 255],
  tableBorder: [200, 200, 200],   // #C8C8C8
  rowEven: [255, 255, 255],       // White
  rowOdd: [253, 246, 243],        // Very light orange tint
  questionCol: [250, 250, 250],   // Light gray for question column
  pageNumberContrast: [255, 210, 190], // Light orange-white for footer bar
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
// Table Layout
// ============================================================

// Column widths: Question gets more space, rubric levels split the rest
const COL_QUESTION_WIDTH = Math.round(CONTENT_WIDTH * 0.26); // ~187pt
const COL_LEVEL_WIDTH = Math.round((CONTENT_WIDTH - COL_QUESTION_WIDTH) / 4); // ~133pt each
const COL_WIDTHS = [
  COL_QUESTION_WIDTH,
  COL_LEVEL_WIDTH,
  COL_LEVEL_WIDTH,
  COL_LEVEL_WIDTH,
  CONTENT_WIDTH - COL_QUESTION_WIDTH - (COL_LEVEL_WIDTH * 3) // last col gets remainder
];

const COL_HEADERS = ['Question', 'Exceeds (4)', 'Meets (3)', 'Approaching (2)', 'Beginning (1)'];
const CELL_PADDING = 5;

// ============================================================
// PDF Rendering Helpers
// ============================================================

function addFooter(doc) {
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

  // Deep orange footer bar
  const barY = footerY + 12;
  const barHeight = 24;
  doc.save();
  doc.rect(0, barY, PAGE_WIDTH, barHeight).fill(COLORS.primary);

  // "FOR TEACHER USE ONLY" text
  doc.font('Helvetica-Bold')
     .fontSize(FONT.footerBar)
     .fillColor(COLORS.white);
  doc.text('FOR TEACHER USE ONLY', 0, barY + 6, {
    width: PAGE_WIDTH,
    align: 'center',
    lineBreak: false
  });

  // Page indicator
  doc.font('Helvetica')
     .fontSize(FONT.pageNumber)
     .fillColor(COLORS.pageNumberContrast);
  doc.text('Page 1 of 1', 0, barY + 8, {
    width: PAGE_WIDTH - MARGIN,
    align: 'right',
    lineBreak: false
  });
  doc.restore();
}

function renderHeader(doc, options, y) {
  const { title, category, gradeLevel, logoData } = options;
  const gradeLabel = GRADE_LABELS[gradeLevel] || gradeLevel;
  const categoryLabel = CATEGORY_LABELS[category] || category;

  if (logoData) {
    const logoW = 75;
    const logoH = logoW * (234 / 604);
    try {
      doc.image(logoData, MARGIN, y, { width: logoW, height: logoH });
    } catch (e) {
      // Logo failed — skip
    }
  }

  const textX = MARGIN + 85;

  doc.font('Helvetica-Bold')
     .fontSize(FONT.headerTitle)
     .fillColor(COLORS.headerText);
  doc.text(title, textX, y + 2, {
    width: CONTENT_WIDTH - (textX - MARGIN) - 100,
    lineBreak: false
  });

  // Grade badge on the right
  doc.font('Helvetica-Bold')
     .fontSize(FONT.headerGrade)
     .fillColor(COLORS.primary);
  doc.text(gradeLabel, PAGE_WIDTH - MARGIN - 100, y + 3, {
    width: 100,
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

  y += 38;

  // Deep orange horizontal rule
  doc.save();
  doc.strokeColor(COLORS.primary)
     .lineWidth(1.5)
     .moveTo(MARGIN, y)
     .lineTo(PAGE_WIDTH - MARGIN, y)
     .stroke();
  doc.restore();

  return y + 8;
}

// ============================================================
// Table Rendering
// ============================================================

/**
 * Render the table header row
 */
function renderTableHeader(doc, y) {
  let x = MARGIN;
  const headerHeight = 24;

  for (let i = 0; i < COL_HEADERS.length; i++) {
    doc.save();
    doc.rect(x, y, COL_WIDTHS[i], headerHeight).fill(COLORS.tableHeaderBg);

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
 * Build the Bloom's/DOK annotation string
 */
function buildAnnotation(question) {
  const parts = [];
  if (question.bloomsLevel) parts.push(`Bloom\u2019s: ${question.bloomsLevel}`);
  if (question.dokLevel) parts.push(`DOK: ${question.dokLevel}`);
  return parts.join('  |  ');
}

/**
 * Measure the height needed for a rubric row at given font sizes.
 * For the question column (col 0), accounts for Bloom's/DOK annotation line.
 */
function measureRowHeight(doc, question, rubric, bodySize, questionSize, bloomsSize) {
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
    const fontSize = i === 0 ? questionSize : bodySize;
    doc.font(font).fontSize(fontSize);
    const textWidth = COL_WIDTHS[i] - (CELL_PADDING * 2);
    let h = doc.heightOfString(cellTexts[i], { width: textWidth }) + (CELL_PADDING * 2) + 2;

    // Add space for Bloom's/DOK annotation in question column
    if (i === 0 && (question.bloomsLevel || question.dokLevel)) {
      doc.font('Helvetica-Oblique').fontSize(bloomsSize);
      const annotationText = buildAnnotation(question);
      h += doc.heightOfString(annotationText, { width: textWidth }) + 3;
    }

    if (h > maxHeight) maxHeight = h;
  }

  return Math.max(maxHeight, 36);
}

/**
 * Render a single rubric table row
 */
function renderTableRow(doc, question, rubric, y, rowIndex, bodySize, questionSize, bloomsSize) {
  const rowHeight = measureRowHeight(doc, question, rubric, bodySize, questionSize, bloomsSize);

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
    const fontSize = i === 0 ? questionSize : bodySize;
    const textColor = i === 0 ? COLORS.headerText : COLORS.bodyText;
    const textWidth = COL_WIDTHS[i] - (CELL_PADDING * 2);

    doc.fillColor(textColor)
       .font(font)
       .fontSize(fontSize);

    if (i === 0) {
      // Question column: render question text, then Bloom's/DOK annotation below
      doc.text(cellTexts[i], x + CELL_PADDING, y + CELL_PADDING, {
        width: textWidth
      });

      // Bloom's/DOK annotation
      if (question.bloomsLevel || question.dokLevel) {
        const annotationY = doc.y + 2;
        doc.font('Helvetica-Oblique')
           .fontSize(bloomsSize)
           .fillColor(COLORS.bloomsDok);
        doc.text(buildAnnotation(question), x + CELL_PADDING, annotationY, {
          width: textWidth
        });
      }
    } else {
      // Rubric criteria columns
      doc.text(cellTexts[i], x + CELL_PADDING, y + CELL_PADDING, {
        width: textWidth,
        height: rowHeight - (CELL_PADDING * 2),
        ellipsis: true
      });
    }

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
 * Landscape, single page. Automatically scales font sizes to fill the page.
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
  const questions = rubricData.questions || [];

  // ── Auto-scale font sizes to fill the page ──
  // Start at preferred sizes and scale down only if content overflows.
  // Scale up if there's lots of extra room.
  let bodySize = FONT.body;            // 9
  let questionSize = FONT.questionText; // 9.5
  let bloomsSize = FONT.bloomsDok;      // 7.5

  // We need a temporary doc to measure heights
  const measureDoc = new PDFDocument({
    size: [PAGE_WIDTH, PAGE_HEIGHT],
    margins: { top: MARGIN, bottom: 10, left: MARGIN, right: MARGIN },
    autoFirstPage: true
  });
  // Consume output to avoid backpressure
  measureDoc.on('data', () => {});

  // Space available for table rows + note (~18pt for note)
  const noteSpace = 18;
  const availableForRows = TABLE_SPACE - noteSpace;

  // Measure total row height at current font sizes
  function totalRowsHeight(bSize, qSize, blSize) {
    let total = 0;
    for (const q of questions) {
      const rubric = q.rubric || {};
      total += measureRowHeight(measureDoc, q, rubric, bSize, qSize, blSize);
    }
    return total;
  }

  // Try scaling up if there's room (max 12pt body)
  const MAX_BODY = 12;
  const MIN_BODY = 7;
  let totalH = totalRowsHeight(bodySize, questionSize, bloomsSize);

  if (totalH < availableForRows) {
    // Scale up — try progressively larger sizes
    for (let tryBody = MAX_BODY; tryBody > bodySize; tryBody -= 0.5) {
      const tryQuestion = tryBody + 0.5;
      const tryBlooms = tryBody - 1.5;
      const tryH = totalRowsHeight(tryBody, tryQuestion, tryBlooms);
      if (tryH <= availableForRows) {
        bodySize = tryBody;
        questionSize = tryQuestion;
        bloomsSize = tryBlooms;
        totalH = tryH;
        break;
      }
    }
  } else {
    // Scale down if it overflows
    for (let tryBody = bodySize - 0.5; tryBody >= MIN_BODY; tryBody -= 0.5) {
      const tryQuestion = tryBody + 0.5;
      const tryBlooms = tryBody - 1.5;
      const tryH = totalRowsHeight(tryBody, tryQuestion, tryBlooms);
      if (tryH <= availableForRows) {
        bodySize = tryBody;
        questionSize = tryQuestion;
        bloomsSize = tryBlooms;
        totalH = tryH;
        break;
      }
    }
  }

  measureDoc.end();

  // ── Build the actual PDF ──
  const doc = new PDFDocument({
    size: [PAGE_WIDTH, PAGE_HEIGHT], // landscape letter
    margins: { top: MARGIN, bottom: 10, left: MARGIN, right: MARGIN },
    bufferPages: false,
    autoFirstPage: false
  });

  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));

  // ====== SINGLE PAGE ======
  doc.addPage();
  let y = MARGIN;

  // Header
  y = renderHeader(doc, headerOpts, y);

  // Scale description
  doc.font('Helvetica')
     .fontSize(FONT.scaleLabel)
     .fillColor(COLORS.bodyText);
  doc.text('4 = Exceeds Expectations  |  3 = Meets Expectations  |  2 = Approaching  |  1 = Beginning', MARGIN, y, {
    width: CONTENT_WIDTH,
    align: 'center'
  });
  y = doc.y + 6;

  // Table header
  y = renderTableHeader(doc, y);

  // Table rows — one per question
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const rubric = q.rubric || {};
    y = renderTableRow(doc, q, rubric, y, i, bodySize, questionSize, bloomsSize);
  }

  // Note (if there's room)
  y += 6;
  if (y + 16 < USABLE_HEIGHT) {
    doc.font('Helvetica-Oblique')
       .fontSize(FONT.noteText)
       .fillColor(COLORS.subtitleText);
    doc.text('Note: This rubric is AI-generated based on the discussion questions for this photograph. Review and adjust criteria as needed for your classroom context.', MARGIN, y, {
      width: CONTENT_WIDTH
    });
  }

  // Footer
  addFooter(doc);

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on('error', reject);
  });
}

module.exports = { generateRubricPDF };

/**
 * Exit Ticket PDF Generator for Science In A Snapshot
 * Generates single-page student exit ticket PDFs using PDFKit
 *
 * Each PDF contains discussion questions with blank answer boxes for students.
 * Questions are extracted from existing grade-level content JSONs.
 * No Bloom's taxonomy or DOK levels are shown (student-facing document).
 *
 * Shared module used by:
 *  - functions/index.js (Cloud Function pipeline)
 */

const PDFDocument = require('pdfkit');
const fs = require('fs').promises;

// Try to load sharp for image compression (available in functions/, optional elsewhere)
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  sharp = null;
}

// ============================================================
// Constants (matching pdf-generator.js layout)
// ============================================================

const PAGE_WIDTH = 612;    // Letter width in points
const PAGE_HEIGHT = 792;   // Letter height in points
const MARGIN = 40;         // ~0.55 inch margins
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN; // 532
const FOOTER_HEIGHT = 48;  // Reserved for footer bar + attribution
const USABLE_HEIGHT = PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT; // ~704

const FONT = {
  body: 10,
  questionNumber: 10,
  headerTitle: 16,
  headerGrade: 11,
  headerSubtitle: 9,
  miniHeaderTitle: 11,
  studentInfoLabel: 10,
  footerAttribution: 7,
  footerBar: 10,
  pageNumber: 7.5
};

// Teal color scheme for exit tickets
const COLORS = {
  primary: [0, 131, 143],         // #00838F (teal)
  headerText: [33, 33, 33],       // #212121
  bodyText: [68, 68, 68],         // #444444
  subtitleText: [117, 117, 117],  // #757575
  lightGray: [150, 150, 150],     // #969696
  white: [255, 255, 255],
  boxBorder: [180, 180, 180],     // #B4B4B4 (answer box border)
  pageNumberContrast: [180, 235, 240] // light teal-white for footer bar
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
// Discussion Question Extraction
// ============================================================

/**
 * Extract discussion questions from markdown content.
 * Returns an array of question text strings (no Bloom's/DOK annotations).
 */
function extractDiscussionQuestions(markdown) {
  if (!markdown) return [];

  // Extract the Discussion Questions section
  const sectionMatch = markdown.match(/##\s*💬\s*Discussion Questions\s*\n([\s\S]*?)(?=\n##\s|$)/);
  if (!sectionMatch) return [];

  const sectionText = sectionMatch[1].trim();
  const questions = [];

  // Match numbered or bulleted questions
  // Patterns: "1. **"question"**" or "* **"question"**"
  const lines = sectionText.split('\n');
  let currentQuestion = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Check if this is a new question (starts with number+dot or bullet)
    const questionStart = trimmed.match(/^(?:\d+\.\s|\*\s)/);
    if (questionStart) {
      // Save previous question if any
      if (currentQuestion) {
        questions.push(cleanQuestionText(currentQuestion));
      }
      currentQuestion = trimmed.replace(/^(?:\d+\.\s|\*\s)/, '');
    } else if (currentQuestion && trimmed && !trimmed.startsWith('*') && !trimmed.startsWith('-')) {
      // Skip teacher guidance lines (italicized sub-bullets)
      if (!trimmed.startsWith('*') && !trimmed.match(/^\s*[-*]\s+\*/)) {
        // This could be a continuation of the question
        // But usually guidance is on the next line starting with * or -
      }
    }
  }

  // Don't forget the last question
  if (currentQuestion) {
    questions.push(cleanQuestionText(currentQuestion));
  }

  return questions.filter(q => q.length > 0);
}

/**
 * Clean a question text string: remove markdown, Bloom's/DOK annotations, quotes
 */
function cleanQuestionText(text) {
  return text
    // Remove Bloom's/DOK annotations: (Bloom's: Analyze | DOK: 2)
    .replace(/\s*\(Bloom['']s:.*?\)\s*/g, '')
    // Remove markdown bold
    .replace(/\*\*\*(.*?)\*\*\*/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    // Remove surrounding quotes
    .replace(/^["""]|["""]$/g, '')
    // Remove markdown links
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Clean whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================
// PDF Rendering Helpers
// ============================================================

/**
 * Check if we need a new page
 */
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

/**
 * Render the footer: attribution line + teal bar + page number
 */
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

  // Teal footer bar
  const barY = footerY + 14;
  const barHeight = 26;
  doc.save();
  doc.rect(0, barY, PAGE_WIDTH, barHeight).fill(COLORS.primary);

  // "FOR STUDENT USE" text
  doc.font('Helvetica-Bold')
     .fontSize(FONT.footerBar)
     .fillColor(COLORS.white);
  doc.text('FOR STUDENT USE', 0, barY + 7, {
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

/**
 * Render the header: logo + title + grade/category + teal rule
 */
function renderHeader(doc, options, y, mini) {
  const { title, category, gradeLevel, logoData } = options;
  const gradeLabel = GRADE_LABELS[gradeLevel] || gradeLevel;
  const categoryLabel = CATEGORY_LABELS[category] || category;

  // Logo
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
    doc.text(`${title} \u2014 ${gradeLabel} Exit Ticket`, textX, y + 4, {
      width: CONTENT_WIDTH - (textX - MARGIN),
      lineBreak: false
    });
    y += 24;
  } else {
    // Title
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
    doc.text(`${categoryLabel}  |  Exit Ticket`, textX, y + 22, {
      width: CONTENT_WIDTH - (textX - MARGIN),
      lineBreak: false
    });

    y += 40;
  }

  // Teal horizontal rule
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
// Main Exit Ticket PDF Generation
// ============================================================

/**
 * Generate an exit ticket PDF with discussion questions and blank answer boxes.
 *
 * @param {Object} options
 * @param {string} options.title - Image title
 * @param {string} options.category - Category slug
 * @param {string} options.gradeLevel - Grade key (e.g., "third-grade")
 * @param {string} options.markdownContent - Full markdown content (contains discussion questions)
 * @param {string|Buffer} options.imagePath - Path to photo file OR Buffer
 * @param {string|Buffer} options.logoPath - Path to sias_logo.png OR Buffer
 * @returns {Promise<Buffer>} PDF file buffer
 */
async function generateExitTicketPDF(options) {
  const { title, category, gradeLevel, markdownContent, imagePath, logoPath } = options;

  // Load and compress image for thumbnail
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
        .resize({ width: 200, withoutEnlargement: true })
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

  // Extract discussion questions from the markdown content
  const questions = extractDiscussionQuestions(markdownContent);

  // Header options (reused for continuation page headers)
  const headerOpts = { title, category, gradeLevel, logoData };

  // Page state tracker
  const state = { currentPage: 1, totalPages: null };

  // Create PDF document
  const doc = new PDFDocument({
    size: 'letter',
    margins: { top: MARGIN, bottom: 10, left: MARGIN, right: MARGIN },
    bufferPages: true,
    autoFirstPage: false
  });

  // Collect output chunks
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));

  // ====== PAGE 1 ======
  doc.addPage();
  let y = MARGIN;

  // Full header
  y = renderHeader(doc, headerOpts, y, false);

  // --- Student info line + photo thumbnail ---
  const infoLineY = y;

  // Photo thumbnail on the right side
  const thumbW = 80;
  const thumbH = 60;
  if (imageData) {
    try {
      doc.save();
      doc.image(imageData, PAGE_WIDTH - MARGIN - thumbW, infoLineY, {
        fit: [thumbW, thumbH],
        align: 'center',
        valign: 'center'
      });
      doc.restore();
    } catch (e) {
      // Image embedding failed — skip
    }
  }

  // Student Name line
  doc.font('Helvetica-Bold')
     .fontSize(FONT.studentInfoLabel)
     .fillColor(COLORS.bodyText);
  doc.text('Name:', MARGIN, y + 2, { continued: false });

  // Underline for name
  const nameLineStart = MARGIN + 42;
  const nameLineEnd = PAGE_WIDTH - MARGIN - thumbW - 30;
  doc.save();
  doc.strokeColor(COLORS.boxBorder)
     .lineWidth(0.75)
     .moveTo(nameLineStart, y + 14)
     .lineTo(nameLineEnd, y + 14)
     .stroke();
  doc.restore();

  y += 22;

  // Date line
  doc.font('Helvetica-Bold')
     .fontSize(FONT.studentInfoLabel)
     .fillColor(COLORS.bodyText);
  doc.text('Date:', MARGIN, y + 2, { continued: false });

  const dateLineStart = MARGIN + 36;
  const dateLineEnd = MARGIN + 200;
  doc.save();
  doc.strokeColor(COLORS.boxBorder)
     .lineWidth(0.75)
     .moveTo(dateLineStart, y + 14)
     .lineTo(dateLineEnd, y + 14)
     .stroke();
  doc.restore();

  // Ensure y is past the thumbnail if it's taller
  y = Math.max(y + 24, infoLineY + thumbH + 8);
  y += 8;

  // --- Directions ---
  doc.font('Helvetica-Oblique')
     .fontSize(9)
     .fillColor(COLORS.subtitleText);
  doc.text('Answer each question in the box below it. Use complete sentences when possible.', MARGIN, y, {
    width: CONTENT_WIDTH
  });
  y = doc.y + 10;

  // --- Questions with answer boxes ---
  const questionCount = questions.length;
  // Calculate available space for questions
  const availableSpace = USABLE_HEIGHT - y;
  // Divide space evenly among questions, with min answer box height
  const minBoxHeight = 70;
  const questionTextEstimate = 20; // approximate height of question text
  const spacingBetween = 8;
  const spacePerQuestion = (availableSpace - (questionCount * spacingBetween)) / questionCount;
  const answerBoxHeight = Math.max(minBoxHeight, Math.min(150, spacePerQuestion - questionTextEstimate - 6));

  for (let i = 0; i < questionCount; i++) {
    const question = questions[i];

    // Check space — if not enough for question + box, start new page
    const neededSpace = questionTextEstimate + answerBoxHeight + spacingBetween;
    y = ensureSpace(doc, y, neededSpace, headerOpts, state);

    // Question number and text
    doc.font('Helvetica-Bold')
       .fontSize(FONT.questionNumber)
       .fillColor(COLORS.headerText);

    const questionText = `${i + 1}. ${question}`;
    doc.text(questionText, MARGIN, y, {
      width: CONTENT_WIDTH,
      lineGap: 2
    });
    y = doc.y + 4;

    // Answer box (blank bordered rectangle)
    doc.save();
    doc.rect(MARGIN, y, CONTENT_WIDTH, answerBoxHeight)
       .lineWidth(1)
       .strokeColor(COLORS.boxBorder)
       .stroke();
    doc.restore();

    y += answerBoxHeight + spacingBetween;
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
       .fillColor(COLORS.pageNumberContrast);
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

module.exports = { generateExitTicketPDF, extractDiscussionQuestions };

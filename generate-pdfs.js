#!/usr/bin/env node

/**
 * Batch PDF Generator for Science In A Snapshot
 *
 * Generates two-page lesson guide PDFs for all existing images.
 * 150 images × 6 grade levels = 900 PDFs
 *
 * Usage:
 *   node generate-pdfs.js              # Full batch (900 PDFs)
 *   node generate-pdfs.js --dry-run    # Preview without generating
 *   node generate-pdfs.js --limit=10   # First 10 images (60 PDFs)
 *   node generate-pdfs.js --category=life-science  # One category
 *   node generate-pdfs.js --resume     # Skip existing PDFs
 */

const path = require('path');
const fs = require('fs').promises;
const { generatePDF } = require('./functions/pdf-generator');

// Grade levels to generate PDFs for
const GRADE_LEVELS = [
  'kindergarten',
  'first-grade',
  'second-grade',
  'third-grade',
  'fourth-grade',
  'fifth-grade'
];

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    resume: args.includes('--resume'),
    limit: parseInt((args.find(a => a.startsWith('--limit=')) || '').split('=')[1]) || Infinity,
    category: (args.find(a => a.startsWith('--category=')) || '').split('=')[1] || null,
    help: args.includes('--help') || args.includes('-h')
  };
}

// Check if a file exists
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Format elapsed time
function formatTime(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

async function main() {
  const config = parseArgs();

  if (config.help) {
    console.log(`
📄 SIAS PDF Batch Generator

Usage: node generate-pdfs.js [options]

Options:
  --dry-run            Preview what would be generated (no files written)
  --limit=N            Process only the first N images
  --category=NAME      Only process one category (life-science, earth-space-science, physical-science)
  --resume             Skip PDFs that already exist
  --help, -h           Show this help message
    `);
    return;
  }

  const startTime = Date.now();

  console.log('');
  console.log('📄 ============================================');
  console.log('   SIAS PDF Batch Generator');
  console.log('   ============================================');
  console.log('');

  // Read gallery metadata
  const metadataPath = path.join(__dirname, 'gallery-metadata.json');
  const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));

  // Filter images
  let images = metadata.images.filter(img => img.hasContent);
  if (config.category) {
    images = images.filter(img => img.category === config.category);
    console.log(`📁 Category filter: ${config.category}`);
  }
  if (config.limit < Infinity) {
    images = images.slice(0, config.limit);
    console.log(`🔢 Limit: ${config.limit} images`);
  }

  const totalPDFs = images.length * GRADE_LEVELS.length;
  console.log(`📊 Images: ${images.length} | Grades: ${GRADE_LEVELS.length} | Total PDFs: ${totalPDFs}`);
  if (config.dryRun) console.log('🏃 DRY RUN — no files will be written');
  if (config.resume) console.log('⏩ Resume mode — skipping existing PDFs');
  console.log('');

  // Load logo once
  const logoPath = path.join(__dirname, 'sias_logo.png');
  let logoBuffer = null;
  try {
    logoBuffer = await fs.readFile(logoPath);
    console.log('✅ Logo loaded');
  } catch (e) {
    console.warn('⚠️  Logo not found — PDFs will generate without logo');
  }

  // Counters
  let generated = 0;
  let skipped = 0;
  let failed = 0;
  let pdfIndex = 0;

  // Process each image × grade level
  for (const image of images) {
    const baseFilename = path.parse(image.filename).name;

    for (const grade of GRADE_LEVELS) {
      pdfIndex++;
      const pdfRelPath = `pdfs/${image.category}/${baseFilename}-${grade}.pdf`;
      const pdfFullPath = path.join(__dirname, pdfRelPath);

      // Resume: skip if exists
      if (config.resume && await fileExists(pdfFullPath)) {
        skipped++;
        continue;
      }

      // Dry run: just log
      if (config.dryRun) {
        console.log(`  [${pdfIndex}/${totalPDFs}] Would generate: ${pdfRelPath}`);
        generated++;
        continue;
      }

      const pdfStartTime = Date.now();

      try {
        // Read content file
        const contentPath = path.join(__dirname, 'content', image.category, `${baseFilename}-${grade}.json`);
        const contentRaw = await fs.readFile(contentPath, 'utf8');
        const contentData = JSON.parse(contentRaw);

        // Read image file
        const imagePath = path.join(__dirname, image.imagePath);
        let imageBuffer = null;
        try {
          imageBuffer = await fs.readFile(imagePath);
        } catch (e) {
          // Image not found — will generate without photo
        }

        // Generate PDF
        const pdfBuffer = await generatePDF({
          title: image.title,
          category: image.category,
          gradeLevel: grade,
          markdownContent: contentData.content,
          imagePath: imageBuffer || imagePath,
          logoPath: logoBuffer || logoPath
        });

        // Ensure output directory exists
        const pdfDir = path.dirname(pdfFullPath);
        await fs.mkdir(pdfDir, { recursive: true });

        // Write PDF
        await fs.writeFile(pdfFullPath, pdfBuffer);

        const elapsed = Date.now() - pdfStartTime;
        generated++;

        // Progress log (every PDF for small batches, every 10 for large)
        if (totalPDFs <= 60 || generated % 10 === 0 || generated === 1) {
          const pct = ((pdfIndex / totalPDFs) * 100).toFixed(0);
          console.log(`  [${pdfIndex}/${totalPDFs}] ${pct}% ${pdfRelPath} (${formatTime(elapsed)})`);
        }

      } catch (err) {
        failed++;
        console.error(`  ❌ [${pdfIndex}/${totalPDFs}] FAILED: ${pdfRelPath} — ${err.message}`);
      }
    }
  }

  // Summary
  const totalTime = Date.now() - startTime;
  console.log('');
  console.log('📊 ============================================');
  console.log(`   ✅ Generated: ${generated}`);
  if (skipped > 0) console.log(`   ⏩ Skipped:   ${skipped}`);
  if (failed > 0)  console.log(`   ❌ Failed:    ${failed}`);
  console.log(`   ⏱️  Time:      ${formatTime(totalTime)}`);
  if (generated > 0 && !config.dryRun) {
    const avgTime = totalTime / generated;
    console.log(`   📄 Avg/PDF:   ${formatTime(avgTime)}`);
  }
  console.log('   ============================================');
  console.log('');

  if (failed > 0) {
    console.log('⚠️  Some PDFs failed. Re-run with --resume to retry only missing files.');
  }

  if (!config.dryRun && generated > 0) {
    console.log(`📁 Output: pdfs/ directory (${generated} files)`);
    console.log('');
  }
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * Batch EDP PDF Generator for Science In A Snapshot
 *
 * Generates engineering design process PDFs from pre-generated EDP content.
 * One PDF per image (not per grade — both K-2 and 3-5 are in one document).
 *
 * Usage:
 *   node generate-edp-pdfs.js              # Full batch (~150 PDFs)
 *   node generate-edp-pdfs.js --dry-run    # Preview without generating
 *   node generate-edp-pdfs.js --limit=10   # First 10 images
 *   node generate-edp-pdfs.js --category=life-science  # One category
 *   node generate-edp-pdfs.js --resume     # Skip existing PDFs
 */

const path = require('path');
const fs = require('fs').promises;
const { generateEDPpdf } = require('./functions/edp-pdf-generator');

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

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

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
EDP PDF Batch Generator

Usage: node generate-edp-pdfs.js [options]

Options:
  --dry-run            Preview what would be generated (no files written)
  --limit=N            Process only the first N images
  --category=NAME      Only process one category
  --resume             Skip PDFs that already exist
  --help, -h           Show this help message
    `);
    return;
  }

  const startTime = Date.now();

  console.log('');
  console.log('============================================');
  console.log('   SIAS EDP PDF Batch Generator');
  console.log('============================================');
  console.log('');

  // Read gallery metadata
  const metadataPath = path.join(__dirname, 'gallery-metadata.json');
  const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));

  // Filter images
  let images = metadata.images.filter(img => img.hasContent);
  if (config.category) {
    images = images.filter(img => img.category === config.category);
    console.log(`Category filter: ${config.category}`);
  }
  if (config.limit < Infinity) {
    images = images.slice(0, config.limit);
    console.log(`Limit: ${config.limit} images`);
  }

  console.log(`Images: ${images.length} | PDFs to generate: ${images.length}`);
  if (config.dryRun) console.log('DRY RUN — no files will be written');
  if (config.resume) console.log('Resume mode — skipping existing PDFs');
  console.log('');

  // Load logo once
  const logoPath = path.join(__dirname, 'sias_logo.png');
  let logoBuffer = null;
  try {
    logoBuffer = await fs.readFile(logoPath);
    console.log('Logo loaded');
  } catch (e) {
    console.warn('Logo not found — PDFs will generate without logo');
  }

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const baseFilename = path.parse(image.filename).name;
    const pdfRelPath = `pdfs/${image.category}/${baseFilename}-edp.pdf`;
    const pdfFullPath = path.join(__dirname, pdfRelPath);

    // Resume: skip if exists
    if (config.resume && await fileExists(pdfFullPath)) {
      skipped++;
      continue;
    }

    // Dry run
    if (config.dryRun) {
      console.log(`  [${i + 1}/${images.length}] Would generate: ${pdfRelPath}`);
      generated++;
      continue;
    }

    const pdfStartTime = Date.now();

    try {
      // Read EDP content file
      const edpContentPath = path.join(__dirname, 'content', image.category, `${baseFilename}-edp.json`);
      if (!await fileExists(edpContentPath)) {
        console.error(`  [${i + 1}/${images.length}] SKIP: EDP content not found — ${baseFilename}-edp.json`);
        console.error(`    Run 'node generate-edp-content.js' first to generate content.`);
        failed++;
        continue;
      }

      const contentRaw = await fs.readFile(edpContentPath, 'utf8');
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
      const pdfBuffer = await generateEDPpdf({
        title: image.title,
        category: image.category,
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

      const pct = (((i + 1) / images.length) * 100).toFixed(0);
      console.log(`  [${i + 1}/${images.length}] ${pct}% ${pdfRelPath} (${formatTime(elapsed)})`);

    } catch (err) {
      failed++;
      console.error(`  [${i + 1}/${images.length}] FAILED: ${pdfRelPath} — ${err.message}`);
    }
  }

  // Summary
  const totalTime = Date.now() - startTime;
  console.log('');
  console.log('============================================');
  console.log(`   Generated: ${generated}`);
  if (skipped > 0) console.log(`   Skipped:   ${skipped}`);
  if (failed > 0)  console.log(`   Failed:    ${failed}`);
  console.log(`   Time:      ${formatTime(totalTime)}`);
  if (generated > 0 && !config.dryRun) {
    const avgTime = totalTime / generated;
    console.log(`   Avg/PDF:   ${formatTime(avgTime)}`);
  }
  console.log('============================================');
  console.log('');

  if (failed > 0) {
    console.log('Some PDFs failed. Re-run with --resume to retry only missing files.');
  }

  if (!config.dryRun && generated > 0) {
    console.log(`Output: pdfs/ directory (${generated} EDP PDFs)`);
    console.log('');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

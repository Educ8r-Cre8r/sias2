#!/usr/bin/env node
/**
 * backfill-exit-tickets.js
 * Generate exit ticket PDFs for all existing images and upload to Firebase Storage.
 * Idempotent — skips images that already have exit tickets in Storage.
 * No API cost — uses existing content JSONs.
 *
 * Usage: node tools/backfill-exit-tickets.js [--force] [--start N] [--limit N]
 *   --force    Regenerate even if file already exists in Storage
 *   --start N  Start from image index N (default: 0)
 *   --limit N  Process only N images (default: all)
 *
 * Requires: pdfkit, firebase-admin, sharp
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { readFileSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const require = createRequire(join(ROOT, 'functions/'));

// Load the exit ticket generator from functions/ (CommonJS module)
const { generateExitTicketPDF } = require('./exit-ticket-generator');

const BUCKET_NAME = 'sias-8178a.firebasestorage.app';
const GRADES = ['kindergarten', 'first-grade', 'second-grade', 'third-grade', 'fourth-grade', 'fifth-grade'];
const CONCURRENCY = 6; // parallel uploads per image

// ── Parse CLI args ──
const args = process.argv.slice(2);
const force = args.includes('--force');
const startIdx = args.includes('--start') ? parseInt(args[args.indexOf('--start') + 1]) || 0 : 0;
const limitArg = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : null;

// ── Initialize Firebase Admin ──
const serviceKeyPath = join(__dirname, 'serviceAccountKey.json');
if (!existsSync(serviceKeyPath) && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Missing credentials. Either:');
  console.error('  1. Place a service account key at tools/serviceAccountKey.json');
  console.error('  2. Set GOOGLE_APPLICATION_CREDENTIALS env var');
  process.exit(1);
}

const credential = existsSync(serviceKeyPath)
  ? cert(JSON.parse(readFileSync(serviceKeyPath, 'utf-8')))
  : undefined;

initializeApp({
  ...(credential ? { credential } : {}),
  storageBucket: BUCKET_NAME,
});
const bucket = getStorage().bucket();

// ── Helpers ──
async function fileExistsInStorage(storagePath) {
  try {
    const [exists] = await bucket.file(storagePath).exists();
    return exists;
  } catch {
    return false;
  }
}

async function uploadBuffer(buffer, storagePath) {
  const file = bucket.file(storagePath);
  await file.save(buffer, {
    metadata: {
      contentType: 'application/pdf',
      cacheControl: 'public, max-age=31536000',
    },
  });
}

function progressBar(current, total, width = 30) {
  const pct = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return `[${bar}] ${pct}% (${current}/${total})`;
}

// ── Main ──
async function main() {
  const metadataPath = join(ROOT, 'gallery-metadata.json');
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
  const allImages = metadata.images;

  const endIdx = limitArg ? Math.min(startIdx + limitArg, allImages.length) : allImages.length;
  const images = allImages.slice(startIdx, endIdx);

  console.log(`\n🎫 Exit Ticket Backfill`);
  console.log(`   Images: ${images.length} (index ${startIdx} to ${endIdx - 1} of ${allImages.length})`);
  console.log(`   PDFs per image: ${GRADES.length}`);
  console.log(`   Total PDFs: ${images.length * GRADES.length}`);
  console.log(`   Force regenerate: ${force}`);
  console.log(`   Bucket: ${BUCKET_NAME}\n`);

  const logoPath = join(ROOT, 'sias_logo.png');
  const logoBuffer = existsSync(logoPath) ? readFileSync(logoPath) : null;

  let totalUploaded = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  const startTime = Date.now();

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const nameNoExt = image.filename.replace(/\.[^/.]+$/, '');
    const category = image.category;

    // Read source image for thumbnail
    let imageBuffer = null;
    const localImagePath = join(ROOT, 'images', category, image.filename);
    if (existsSync(localImagePath)) {
      imageBuffer = readFileSync(localImagePath);
    }

    // Generate + upload exit tickets for all 6 grades in parallel
    const gradeResults = await Promise.all(GRADES.map(async (grade) => {
      const storagePath = `exit_tickets/${category}/${nameNoExt}-exit-ticket-${grade}.pdf`;

      // Check if already exists (skip unless --force)
      if (!force) {
        const exists = await fileExistsInStorage(storagePath);
        if (exists) return 'skipped';
      }

      // Read content JSON
      const contentPath = join(ROOT, 'content', category, `${nameNoExt}-${grade}.json`);
      if (!existsSync(contentPath)) return 'missing';

      try {
        const contentData = JSON.parse(readFileSync(contentPath, 'utf-8'));
        const pdfBuffer = await generateExitTicketPDF({
          title: image.title || nameNoExt.replace(/_/g, ' '),
          category,
          gradeLevel: grade,
          markdownContent: contentData.content,
          imagePath: imageBuffer,
          logoPath: logoBuffer,
        });

        await uploadBuffer(pdfBuffer, storagePath);
        return 'uploaded';
      } catch (err) {
        console.error(`   ⚠️ ${nameNoExt}-${grade}: ${err.message}`);
        return 'failed';
      }
    }));

    const uploaded = gradeResults.filter(r => r === 'uploaded').length;
    const skipped = gradeResults.filter(r => r === 'skipped').length;
    const failed = gradeResults.filter(r => r === 'failed').length;

    totalUploaded += uploaded;
    totalSkipped += skipped;
    totalFailed += failed;

    // Progress line
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const status = uploaded > 0 ? `✅ ${uploaded} new` : `⏭️ ${skipped} skipped`;
    process.stdout.write(`\r   ${progressBar(i + 1, images.length)} ${status} — ${image.title || nameNoExt} (${elapsed}s)`);
  }

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\n✅ Backfill complete in ${totalElapsed}s`);
  console.log(`   Uploaded:  ${totalUploaded}`);
  console.log(`   Skipped:   ${totalSkipped}`);
  console.log(`   Failed:    ${totalFailed}`);
  console.log(`   Total:     ${totalUploaded + totalSkipped + totalFailed}\n`);
}

main().catch(err => {
  console.error('\nBackfill failed:', err);
  process.exit(1);
});

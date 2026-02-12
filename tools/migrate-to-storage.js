#!/usr/bin/env node
/**
 * migrate-to-storage.js
 * Upload images, PDFs, and 5E lesson PDFs from the local repo to Firebase Storage.
 * Idempotent — skips files that already exist in Storage.
 *
 * Usage: node tools/migrate-to-storage.js
 * Requires: firebase-admin (npm install firebase-admin in tools/)
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { readFileSync, existsSync } from 'fs';
import { resolve, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const BUCKET_NAME = 'sias-8178a.firebasestorage.app';
const CONCURRENCY = 10; // parallel uploads

// MIME types by extension
const MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
};

const GRADES = ['kindergarten', 'first-grade', 'second-grade', 'third-grade', 'fourth-grade', 'fifth-grade'];

// ── Initialize Firebase Admin using service account or GOOGLE_APPLICATION_CREDENTIALS ──
// If you don't have a service account key, generate one:
//   firebase console → Project Settings → Service Accounts → Generate New Private Key
//   Save as tools/serviceAccountKey.json
const serviceKeyPath = join(__dirname, 'serviceAccountKey.json');
if (!existsSync(serviceKeyPath) && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Missing credentials. Either:');
  console.error('  1. Place a service account key at tools/serviceAccountKey.json');
  console.error('  2. Set GOOGLE_APPLICATION_CREDENTIALS env var');
  console.error('\nGet a key from: https://console.firebase.google.com/project/sias-8178a/settings/serviceaccounts/adminsdk');
  process.exit(1);
}

const credential = existsSync(serviceKeyPath)
  ? cert(JSON.parse(readFileSync(serviceKeyPath, 'utf-8')))
  : undefined; // falls back to GOOGLE_APPLICATION_CREDENTIALS

initializeApp({
  ...(credential ? { credential } : {}),
  storageBucket: BUCKET_NAME,
});
const bucket = getStorage().bucket();

// ── Helpers ──
function getMimeType(filePath) {
  return MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function fileExistsInStorage(storagePath) {
  try {
    const [exists] = await bucket.file(storagePath).exists();
    return exists;
  } catch {
    return false;
  }
}

async function uploadFile(localPath, storagePath) {
  const fullLocal = resolve(ROOT, localPath);
  if (!existsSync(fullLocal)) return { status: 'missing', path: localPath };

  const exists = await fileExistsInStorage(storagePath);
  if (exists) return { status: 'skipped', path: storagePath };

  await bucket.upload(fullLocal, {
    destination: storagePath,
    metadata: {
      contentType: getMimeType(localPath),
      cacheControl: 'public, max-age=31536000',
    },
  });
  return { status: 'uploaded', path: storagePath };
}

// Process a batch with limited concurrency
async function processBatch(tasks, concurrency) {
  const results = [];
  for (let i = 0; i < tasks.length; i += concurrency) {
    const chunk = tasks.slice(i, i + concurrency);
    const chunkResults = await Promise.all(chunk.map(fn => fn()));
    results.push(...chunkResults);
  }
  return results;
}

// ── Main ──
async function main() {
  const metadataPath = join(ROOT, 'gallery-metadata.json');
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
  const images = metadata.images;

  console.log(`\nFound ${images.length} images in gallery-metadata.json`);
  console.log(`Bucket: ${BUCKET_NAME}\n`);

  const tasks = [];
  let totalFiles = 0;

  for (const image of images) {
    const cat = image.category;
    const nameNoExt = image.filename.replace(/\.[^/.]+$/, '');

    // 1. Image variants
    if (image.imagePath) {
      tasks.push(() => uploadFile(image.imagePath, image.imagePath));
      totalFiles++;
    }
    if (image.thumbPath) {
      tasks.push(() => uploadFile(image.thumbPath, image.thumbPath));
      totalFiles++;
    }
    if (image.webpPath) {
      tasks.push(() => uploadFile(image.webpPath, image.webpPath));
      totalFiles++;
    }
    if (image.placeholderPath) {
      tasks.push(() => uploadFile(image.placeholderPath, image.placeholderPath));
      totalFiles++;
    }

    // 2. Lesson PDFs (6 grades + edp)
    for (const grade of GRADES) {
      const pdfLocal = `pdfs/${cat}/${nameNoExt}-${grade}.pdf`;
      tasks.push(() => uploadFile(pdfLocal, pdfLocal));
      totalFiles++;
    }
    const edpLocal = `pdfs/${cat}/${nameNoExt}-edp.pdf`;
    tasks.push(() => uploadFile(edpLocal, edpLocal));
    totalFiles++;

    // 3. 5E Lesson PDFs (may not exist yet for all images)
    for (const grade of GRADES) {
      const fiveELocal = `5e_lessons/${cat}/${nameNoExt}-${grade}.pdf`;
      tasks.push(() => uploadFile(fiveELocal, fiveELocal));
      totalFiles++;
    }
  }

  console.log(`Queued ${totalFiles} files across ${images.length} images`);
  console.log(`Concurrency: ${CONCURRENCY}\n`);

  const startTime = Date.now();
  const results = await processBatch(tasks, CONCURRENCY);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Tally results
  const uploaded = results.filter(r => r.status === 'uploaded');
  const skipped = results.filter(r => r.status === 'skipped');
  const missing = results.filter(r => r.status === 'missing');

  console.log(`\n✅ Done in ${elapsed}s`);
  console.log(`   Uploaded: ${uploaded.length}`);
  console.log(`   Skipped (already exists): ${skipped.length}`);
  console.log(`   Missing locally: ${missing.length}`);

  if (missing.length > 0 && missing.length <= 50) {
    console.log('\nMissing files:');
    missing.forEach(m => console.log(`   ${m.path}`));
  } else if (missing.length > 50) {
    console.log(`\n(${missing.length} missing files — mostly 5E PDFs not yet generated)`);
  }
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

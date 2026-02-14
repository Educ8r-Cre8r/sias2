#!/usr/bin/env node
/**
 * generate-stems-poster.js
 * Generate the base sentence stems poster PDF and upload to Firebase Storage.
 *
 * Usage: node tools/generate-stems-poster.js
 * Output: Uploads to Storage at assets/sentence-stems-poster.pdf
 *
 * The PDF is generated WITHOUT a teacher name/grade — those are stamped
 * on the client side using pdf-lib before download.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { createRequire } from 'module';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const BUCKET_NAME = 'sias-8178a.firebasestorage.app';

// ── Initialize Firebase Admin ──
const serviceKeyPath = join(__dirname, 'serviceAccountKey.json');
if (!existsSync(serviceKeyPath) && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Missing credentials. Place a service account key at tools/serviceAccountKey.json');
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

// ── Import poster generator from functions/ (CommonJS) ──
const { generateStemsPoster } = require(join(ROOT, 'functions', 'stems-poster-generator.js'));

async function main() {
  console.log('📄 Generating sentence stems poster PDF...');

  // Load SIAS logo
  const logoPath = join(ROOT, 'sias_logo.png');
  let logoData = null;
  if (existsSync(logoPath)) {
    logoData = readFileSync(logoPath);
    console.log('   ✅ Logo loaded');
  } else {
    console.warn('   ⚠️  Logo not found, generating without it');
  }

  // Generate the PDF with no teacher name/grade (those get stamped client-side)
  // But we DO reserve space for the teacher line so the grid stays consistent
  // We pass a blank teacherName to force the "with teacher" layout spacing
  const pdfBuffer = await generateStemsPoster({
    teacherName: ' ',  // Space to reserve the line height
    gradeLevel: '',
    logoData,
  });

  // Save locally for review
  const localPath = join(ROOT, 'tools', 'sentence-stems-poster.pdf');
  writeFileSync(localPath, pdfBuffer);
  console.log(`   ✅ PDF saved locally: ${localPath} (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);

  // Upload to Firebase Storage
  const storagePath = 'assets/sentence-stems-poster.pdf';
  console.log(`   📤 Uploading to Storage: ${storagePath}...`);

  const file = bucket.file(storagePath);
  await file.save(pdfBuffer, {
    metadata: {
      contentType: 'application/pdf',
      cacheControl: 'public, max-age=86400',
    },
  });

  console.log(`   ✅ Uploaded to gs://${BUCKET_NAME}/${storagePath}`);
  console.log('\n🎉 Done! The poster PDF is now in Firebase Storage.');
  console.log('   Next: deploy storage rules and test the client-side download.');
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});

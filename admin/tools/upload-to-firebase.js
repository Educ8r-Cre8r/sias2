#!/usr/bin/env node

/**
 * Upload images to Firebase Storage with delays to prevent conflicts
 *
 * This script uploads images one-at-a-time with a 5-second delay between each,
 * preventing multiple Cloud Functions from running simultaneously.
 *
 * Usage:
 *   node upload-to-firebase.js path/to/image1.jpg path/to/image2.jpg
 *   node upload-to-firebase.js --category life-science *.jpg
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs').promises;
const chalk = require('chalk');

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '../../firebase-service-account.json');

try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'sias-8178a.firebasestorage.app'
  });
  console.log(chalk.green('✓ Firebase initialized'));
} catch (error) {
  console.error(chalk.red('✗ Failed to initialize Firebase'));
  console.error(chalk.yellow('Make sure firebase-service-account.json exists in the project root'));
  console.error(chalk.gray('Download it from: Firebase Console → Project Settings → Service Accounts'));
  process.exit(1);
}

const bucket = admin.storage().bucket();

// Valid categories
const VALID_CATEGORIES = ['life-science', 'earth-space-science', 'physical-science'];

// Delay helper
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Upload a single file to Firebase Storage
 */
async function uploadFile(filePath, category) {
  const filename = path.basename(filePath);
  const destination = `uploads/${category}/${filename}`;

  try {
    console.log(chalk.blue(`\n📤 Uploading: ${filename}`));
    console.log(chalk.gray(`   Category: ${category}`));
    console.log(chalk.gray(`   Destination: ${destination}`));

    // Check file exists
    await fs.access(filePath);

    // Check file size
    const stats = await fs.stat(filePath);
    const fileSizeMB = stats.size / 1024 / 1024;

    if (fileSizeMB > 2) {
      throw new Error(`File too large: ${fileSizeMB.toFixed(2)}MB (max 2MB)`);
    }

    console.log(chalk.gray(`   Size: ${fileSizeMB.toFixed(2)}MB ✓`));

    // Upload to Firebase Storage
    await bucket.upload(filePath, {
      destination: destination,
      metadata: {
        contentType: getContentType(filename),
        metadata: {
          uploadedAt: new Date().toISOString(),
          uploadedBy: 'upload-script'
        }
      }
    });

    console.log(chalk.green(`   ✓ Uploaded successfully!`));
    console.log(chalk.gray(`   ⏳ Cloud Function will process this image automatically`));

    return { success: true, filename };

  } catch (error) {
    console.error(chalk.red(`   ✗ Upload failed: ${error.message}`));
    return { success: false, filename, error: error.message };
  }
}

/**
 * Get content type from filename
 */
function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };
  return types[ext] || 'application/octet-stream';
}

/**
 * Main upload function
 */
async function main() {
  console.log(chalk.cyan('\n========================================'));
  console.log(chalk.cyan('  Firebase Image Uploader'));
  console.log(chalk.cyan('  (with 5-second delays)'));
  console.log(chalk.cyan('========================================\n'));

  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(chalk.yellow('Usage:'));
    console.log(chalk.white('  node upload-to-firebase.js [--category CATEGORY] FILE1 FILE2 ...'));
    console.log(chalk.white('\nExamples:'));
    console.log(chalk.gray('  node upload-to-firebase.js --category life-science butterfly.jpg'));
    console.log(chalk.gray('  node upload-to-firebase.js --category earth-space-science *.jpg'));
    console.log(chalk.white('\nCategories:'));
    console.log(chalk.gray('  - life-science'));
    console.log(chalk.gray('  - earth-space-science'));
    console.log(chalk.gray('  - physical-science\n'));
    process.exit(0);
  }

  // Parse arguments
  let category = null;
  const files = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--category') {
      category = args[i + 1];
      i++; // Skip next arg
    } else {
      files.push(args[i]);
    }
  }

  // Validate category
  if (!category) {
    console.error(chalk.red('✗ Category is required'));
    console.log(chalk.yellow('Use: --category life-science|earth-space-science|physical-science'));
    process.exit(1);
  }

  if (!VALID_CATEGORIES.includes(category)) {
    console.error(chalk.red(`✗ Invalid category: ${category}`));
    console.log(chalk.yellow(`Valid categories: ${VALID_CATEGORIES.join(', ')}`));
    process.exit(1);
  }

  // Validate files
  if (files.length === 0) {
    console.error(chalk.red('✗ No files specified'));
    process.exit(1);
  }

  console.log(chalk.blue(`📂 Category: ${category}`));
  console.log(chalk.blue(`📁 Files to upload: ${files.length}`));

  // Upload files one-at-a-time with 5-second delays
  const results = [];
  const DELAY_MS = 5000; // 5 seconds

  for (let i = 0; i < files.length; i++) {
    const result = await uploadFile(files[i], category);
    results.push(result);

    // Wait 5 seconds before next upload (except after the last one)
    if (i < files.length - 1) {
      console.log(chalk.gray(`\n⏰ Waiting 5 seconds before next upload...`));
      await delay(DELAY_MS);
    }
  }

  // Summary
  console.log(chalk.cyan('\n========================================'));
  console.log(chalk.cyan('  Upload Complete!'));
  console.log(chalk.cyan('========================================\n'));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(chalk.green(`✓ Successfully uploaded: ${successful.length} file(s)`));

  if (failed.length > 0) {
    console.log(chalk.red(`✗ Failed: ${failed.length} file(s)`));
    console.log(chalk.red('\nFailed files:'));
    failed.forEach(f => {
      console.log(chalk.red(`  - ${f.filename}: ${f.error}`));
    });
  }

  console.log(chalk.gray('\n💡 Tip: Check Firebase Console → Functions → Logs to monitor processing'));
  console.log(chalk.gray('🔗 https://console.firebase.google.com/project/sias-8178a/functions/logs\n'));

  // Exit with error code if any failed
  process.exit(failed.length > 0 ? 1 : 0);
}

// Run
main().catch(error => {
  console.error(chalk.red('\n✗ Fatal error:'), error.message);
  console.error(error);
  process.exit(1);
});

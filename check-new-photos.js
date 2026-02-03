#!/usr/bin/env node

/**
 * Check for New Photos
 *
 * Quickly scan the images directory and report which photos
 * don't have corresponding JSON content files yet.
 */

const fs = require('fs').promises;
const path = require('path');

const IMAGES_DIR = path.join(__dirname, 'images');
const CONTENT_DIR = path.join(__dirname, 'content');
const CATEGORIES = ['earth-space-science', 'life-science', 'physical-science'];

async function getImageFiles() {
  const files = await fs.readdir(IMAGES_DIR);
  return files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
}

async function getExistingImages() {
  const existingImages = new Set();

  for (const category of CATEGORIES) {
    const categoryPath = path.join(CONTENT_DIR, category);
    try {
      const files = await fs.readdir(categoryPath);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const jsonFile of jsonFiles) {
        const content = await fs.readFile(path.join(categoryPath, jsonFile), 'utf-8');
        const data = JSON.parse(content);
        if (data.image) {
          existingImages.add(data.image);
        }
      }
    } catch (err) {
      console.error(`Error reading category ${category}:`, err.message);
    }
  }

  return existingImages;
}

async function main() {
  console.log('🔍 Checking for new photos...\n');

  const imageFiles = await getImageFiles();
  const existingImages = await getExistingImages();

  const newPhotos = imageFiles.filter(img => !existingImages.has(img));

  console.log(`📊 Summary:`);
  console.log(`   Total images: ${imageFiles.length}`);
  console.log(`   With content: ${existingImages.size}`);
  console.log(`   Missing content: ${newPhotos.length}\n`);

  if (newPhotos.length === 0) {
    console.log('✅ All photos have content!');
  } else {
    console.log('⚠️  Photos missing content:\n');
    newPhotos.forEach((photo, idx) => {
      console.log(`   ${idx + 1}. ${photo}`);
    });
    console.log('\nTo generate content for all photos:');
    console.log('   node generate-educational-content.js');
  }
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

/**
 * Update gallery-metadata.json based on current folder structure
 * Run this after manually reorganizing images
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const projectRoot = path.join(__dirname, '..');
const imagesDir = path.join(projectRoot, 'images');
const metadataPath = path.join(projectRoot, 'gallery-metadata.json');
const contentDir = path.join(projectRoot, 'content');

// Categories
const categories = ['life-science', 'earth-space-science', 'physical-science'];

/**
 * Scan folders and generate metadata based on actual file locations
 */
function scanAndGenerateMetadata() {
  console.log('🔍 Scanning image folders...\n');

  const allImages = [];
  let imageId = 1;

  categories.forEach(category => {
    const categoryPath = path.join(imagesDir, category);

    if (!fs.existsSync(categoryPath)) {
      console.log(`⚠️  Category folder not found: ${category}`);
      return;
    }

    const files = fs.readdirSync(categoryPath);
    const imageFiles = files.filter(file =>
      /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
    );

    console.log(`📁 ${category}: ${imageFiles.length} images`);

    imageFiles.forEach(filename => {
      const imagePath = `images/${category}/${filename}`;
      const contentFile = `content/${category}/${filename.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '.json')}`;
      const contentFilePath = path.join(projectRoot, contentFile);

      // Check if content exists
      const hasContent = fs.existsSync(contentFilePath);

      // Generate title from filename
      const title = filename
        .replace(/\.(jpg|jpeg|png|gif|webp)$/i, '')
        .replace(/[-_]/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      allImages.push({
        id: imageId++,
        filename: filename,
        category: category,
        imagePath: imagePath,
        contentFile: contentFile,
        title: title,
        hasContent: hasContent
      });
    });
  });

  // Create metadata object
  const metadata = {
    lastUpdated: new Date().toISOString(),
    totalImages: allImages.length,
    images: allImages
  };

  // Save to file
  fs.writeFileSync(
    metadataPath,
    JSON.stringify(metadata, null, 2),
    'utf-8'
  );

  console.log(`\n✅ Metadata updated successfully!`);
  console.log(`📊 Total images: ${metadata.totalImages}`);
  console.log(`📝 Saved to: gallery-metadata.json`);

  // Show summary
  console.log('\n📈 Category Distribution:');
  const distribution = {};
  categories.forEach(cat => {
    distribution[cat] = allImages.filter(img => img.category === cat).length;
    console.log(`   ${cat}: ${distribution[cat]} images`);
  });

  // Show content status
  const withContent = allImages.filter(img => img.hasContent).length;
  const withoutContent = allImages.length - withContent;
  console.log('\n📚 Content Status:');
  console.log(`   ✅ With educational content: ${withContent}`);
  console.log(`   ⚠️  Without content: ${withoutContent}`);
}

// Run the scan
try {
  scanAndGenerateMetadata();
} catch (error) {
  console.error('❌ Error updating metadata:', error.message);
  process.exit(1);
}

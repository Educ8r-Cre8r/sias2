/**
 * Science In A Snapshot - Filename-Based Image Categorization
 *
 * This script categorizes images based on filename keywords only.
 * NO API KEY REQUIRED - completely free!
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Categorize based on filename keywords
function categorizeByFilename(filename) {
  const lowerFilename = filename.toLowerCase();

  // Life Science keywords
  const lifeKeywords = [
    'animal', 'plant', 'bird', 'insect', 'mammal', 'reptile', 'fungi', 'fungus',
    'mushroom', 'bee', 'butterfly', 'monarch', 'flower', 'tree', 'life', 'organism',
    'ecosystem', 'leaf', 'lizard', 'snake', 'frog', 'toad', 'fish', 'cat', 'dog',
    'deer', 'raccoon', 'squirrel', 'dove', 'egret', 'owl', 'hawk', 'spider',
    'beetle', 'ant', 'dragonfly', 'grass', 'sunflower', 'rose', 'moss', 'algae',
    'seed', 'root', 'petal', 'stem', 'pollination', 'camouflage', 'cow', 'horse'
  ];

  // Earth & Space Science keywords
  const earthKeywords = [
    'rock', 'fossil', 'geology', 'earth', 'landscape', 'beach', 'water',
    'stone', 'mineral', 'weather', 'space', 'astronomy', 'mountain', 'volcano',
    'earthquake', 'erosion', 'sediment', 'crystal', 'sand', 'soil', 'canyon',
    'river', 'ocean', 'lake', 'cloud', 'sky', 'moon', 'star', 'planet',
    'glacier', 'ice', 'snow', 'rain', 'wind', 'storm', 'fountain', 'frozen'
  ];

  // Physical Science keywords
  const physicalKeywords = [
    'energy', 'force', 'matter', 'mixture', 'experiment', 'conductor',
    'electricity', 'light', 'sound', 'reflection', 'buoyancy', 'static',
    'physical', 'chemistry', 'magnet', 'battery', 'circuit', 'heat', 'temperature',
    'motion', 'speed', 'gravity', 'friction', 'density', 'volume', 'mass',
    'balance', 'lever', 'pulley', 'ramp', 'wheel', 'machine', 'tool',
    'balloon', 'bubble', 'gas', 'liquid', 'solid', 'dissolve', 'evaporate',
    'condensation', 'solution', 'suspension', 'colloid'
  ];

  // Check each category
  let lifeScore = 0;
  let earthScore = 0;
  let physicalScore = 0;

  lifeKeywords.forEach(keyword => {
    if (lowerFilename.includes(keyword)) lifeScore++;
  });

  earthKeywords.forEach(keyword => {
    if (lowerFilename.includes(keyword)) earthScore++;
  });

  physicalKeywords.forEach(keyword => {
    if (lowerFilename.includes(keyword)) physicalScore++;
  });

  // Determine category based on highest score
  if (lifeScore > earthScore && lifeScore > physicalScore) {
    return {
      category: 'life-science',
      confidence: lifeScore > 1 ? 'high' : 'medium',
      justification: `Filename contains life science keywords`,
      method: 'filename-keywords'
    };
  } else if (earthScore > lifeScore && earthScore > physicalScore) {
    return {
      category: 'earth-space-science',
      confidence: earthScore > 1 ? 'high' : 'medium',
      justification: `Filename contains earth/space science keywords`,
      method: 'filename-keywords'
    };
  } else if (physicalScore > 0) {
    return {
      category: 'physical-science',
      confidence: physicalScore > 1 ? 'high' : 'medium',
      justification: `Filename contains physical science keywords`,
      method: 'filename-keywords'
    };
  }

  // Default categorization based on common patterns
  if (lowerFilename.match(/img_\d{4}/)) {
    // IMG_XXXX files - try to guess from context
    return {
      category: 'earth-space-science',
      confidence: 'low',
      justification: `Generic filename - defaulted to earth-space-science`,
      method: 'default-pattern'
    };
  }

  if (lowerFilename.match(/^[ep]\d+/)) {
    // e## or p## files
    if (lowerFilename.startsWith('e')) {
      return {
        category: 'earth-space-science',
        confidence: 'low',
        justification: `Filename pattern 'e##' suggests earth science`,
        method: 'filename-pattern'
      };
    } else {
      return {
        category: 'physical-science',
        confidence: 'low',
        justification: `Filename pattern 'p##' suggests physical science`,
        method: 'filename-pattern'
      };
    }
  }

  // Final fallback
  return {
    category: 'life-science',
    confidence: 'low',
    justification: `No clear indicators - defaulted to life-science`,
    method: 'fallback'
  };
}

// Main categorization function
function categorizeAllImages() {
  console.log('🔬 Science In A Snapshot - Filename-Based Categorization');
  console.log('=========================================================');
  console.log('✅ NO API KEY REQUIRED - Using filename analysis only\n');

  const imagesDir = path.join(__dirname, config.IMAGES_DIR);

  // Get all image files
  const files = fs.readdirSync(imagesDir).filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
  });

  console.log(`📊 Found ${files.length} images to categorize\n`);

  const results = [];
  const categoryCount = {
    'life-science': 0,
    'earth-space-science': 0,
    'physical-science': 0
  };

  files.forEach((filename, index) => {
    console.log(`[${index + 1}/${files.length}] ${filename}`);

    const result = categorizeByFilename(filename);

    console.log(`   ✅ Category: ${result.category} (${result.confidence} confidence)`);
    console.log(`   📝 ${result.justification}\n`);

    results.push({
      filename,
      ...result
    });

    categoryCount[result.category]++;
  });

  // Save results to JSON
  const resultsPath = path.join(__dirname, 'categorization-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`💾 Results saved to: categorization-results.json\n`);

  // Summary
  console.log('📊 Summary:');
  console.log(`   ✅ Successfully categorized: ${files.length}`);
  console.log(`   📁 Total images: ${files.length}\n`);

  console.log('📂 Category Distribution:');
  Object.entries(categoryCount).forEach(([category, count]) => {
    const categoryName = config.CATEGORIES[category]?.name || category;
    const percentage = ((count / files.length) * 100).toFixed(1);
    console.log(`   ${categoryName}: ${count} images (${percentage}%)`);
  });

  console.log('\n✨ Next steps:');
  console.log('   1. Review categorization-results.json (optional)');
  console.log('   2. Run: node organize-images.js');
  console.log('   3. Test the gallery in your browser\n');
}

// Run the script
try {
  categorizeAllImages();
} catch (error) {
  console.error('Fatal error:', error);
  process.exit(1);
}

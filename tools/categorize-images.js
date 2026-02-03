/**
 * Science In A Snapshot - Image Categorization Tool
 *
 * This script uses Claude API to automatically categorize images into:
 * - Life Science
 * - Earth & Space Science
 * - Physical Science
 *
 * Usage:
 *   node categorize-images.js
 *
 * Requirements:
 *   - ANTHROPIC_API_KEY environment variable set
 *   - npm install @anthropic-ai/sdk
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const anthropic = new Anthropic({
  apiKey: config.ANTHROPIC_API_KEY,
});

// Helper function to delay between API calls
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to read image as base64
function readImageAsBase64(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  return imageBuffer.toString('base64');
}

// Helper function to get image media type
function getImageMediaType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg'; // default
}

// Categorize a single image using Claude Vision API
async function categorizeImage(imagePath, filename) {
  try {
    const imageBase64 = readImageAsBase64(imagePath);
    const mediaType = getImageMediaType(filename);

    const prompt = `Analyze this science education photo and categorize it into ONE of these categories:

1. **Life Science**: Organisms (plants, animals, insects, birds, mammals, reptiles, fungi), ecosystems, life processes, biological structures

2. **Earth and Space Science**: Geology (rocks, minerals, fossils), weather, water systems, landscapes, Earth processes, astronomical objects

3. **Physical Science**: Forces, motion, energy, matter, mixtures, electricity, light, sound, physical changes, experiments

Filename: ${filename}

Please respond in this exact format:
Category: [one of: life-science, earth-space-science, physical-science]
Confidence: [high, medium, low]
Justification: [one sentence explaining why]`;

    const message = await anthropic.messages.create({
      model: config.MODEL,
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    });

    const response = message.content[0].text;

    // Parse the response
    const categoryMatch = response.match(/Category:\s*([\w-]+)/i);
    const confidenceMatch = response.match(/Confidence:\s*(\w+)/i);
    const justificationMatch = response.match(/Justification:\s*(.+)/i);

    const category = categoryMatch ? categoryMatch[1] : null;
    const confidence = confidenceMatch ? confidenceMatch[1] : 'unknown';
    const justification = justificationMatch ? justificationMatch[1].trim() : '';

    return {
      category,
      confidence,
      justification,
      rawResponse: response
    };

  } catch (error) {
    console.error(`Error categorizing ${filename}:`, error.message);
    return null;
  }
}

// Categorize using filename keywords as fallback
function categor izeByFilename(filename) {
  const lowerFilename = filename.toLowerCase();

  for (const [categoryKey, categoryInfo] of Object.entries(config.CATEGORIES)) {
    for (const keyword of categoryInfo.keywords) {
      if (lowerFilename.includes(keyword)) {
        return {
          category: categoryKey,
          confidence: 'medium',
          justification: `Filename contains keyword: ${keyword}`,
          method: 'filename'
        };
      }
    }
  }

  return null;
}

// Main categorization function
async function categorizeAllImages() {
  console.log('🔬 Science In A Snapshot - Image Categorization');
  console.log('================================================\n');

  // Check API key
  if (!config.ANTHROPIC_API_KEY) {
    console.error('❌ Error: ANTHROPIC_API_KEY not set in environment variables.');
    console.error('   Please set it with: export ANTHROPIC_API_KEY="sk-ant-..."');
    console.error('   Or add it to a .env file in the tools directory.\n');
    process.exit(1);
  }

  const imagesDir = path.join(__dirname, config.IMAGES_DIR);

  // Get all image files from the images directory
  const files = fs.readdirSync(imagesDir).filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
  });

  console.log(`📊 Found ${files.length} images to categorize\n`);

  const results = [];
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const imagePath = path.join(imagesDir, filename);

    console.log(`[${i + 1}/${files.length}] Processing: ${filename}`);

    // Try AI categorization first
    let result = await categorizeImage(imagePath, filename);

    // Fallback to filename-based categorization
    if (!result || !result.category) {
      console.log(`   ⚠️  AI categorization failed, trying filename analysis...`);
      result = categorizeByFilename(filename);
    }

    if (result && result.category) {
      console.log(`   ✅ Category: ${result.category} (${result.confidence} confidence)`);
      console.log(`   📝 ${result.justification}\n`);

      results.push({
        filename,
        ...result
      });
      successCount++;
    } else {
      console.log(`   ❌ Could not categorize - will need manual review\n`);
      results.push({
        filename,
        category: 'uncategorized',
        confidence: 'none',
        justification: 'Requires manual categorization'
      });
      failureCount++;
    }

    // Rate limiting - wait between requests
    if (i < files.length - 1) {
      await delay(config.RATE_LIMIT_DELAY);
    }
  }

  // Save results to JSON
  const resultsPath = path.join(__dirname, 'categorization-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to: ${resultsPath}`);

  // Summary
  console.log('\n📊 Summary:');
  console.log(`   ✅ Successfully categorized: ${successCount}`);
  console.log(`   ❌ Failed to categorize: ${failureCount}`);
  console.log(`   📁 Total images: ${files.length}\n`);

  // Category breakdown
  const categoryCount = {};
  results.forEach(r => {
    categoryCount[r.category] = (categoryCount[r.category] || 0) + 1;
  });

  console.log('📂 Category Distribution:');
  Object.entries(categoryCount).forEach(([category, count]) => {
    const categoryName = config.CATEGORIES[category]?.name || category;
    console.log(`   ${categoryName}: ${count} images`);
  });

  console.log('\n✨ Next steps:');
  console.log('   1. Review categorization-results.json');
  console.log('   2. Manually adjust any incorrect categorizations');
  console.log('   3. Run organize-images.js to move files to category folders');
  console.log('   4. Then run generate-content.js to create educational content\n');
}

// Run the script
categorizeAllImages().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

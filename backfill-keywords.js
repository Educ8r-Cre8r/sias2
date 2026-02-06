#!/usr/bin/env node

/**
 * Keyword Backfill Script for Science In A Snapshot
 *
 * Generates search keywords for all existing images in gallery-metadata.json
 * that don't yet have keywords. Uses Claude Haiku 4.5 to analyze each image
 * and produce 3-6 NGSS-aligned science keywords.
 *
 * Usage:
 *   1. Ensure .env has ANTHROPIC_API_KEY set
 *   2. Run: node backfill-keywords.js
 *   3. Commit the updated gallery-metadata.json
 *
 * Optional flags:
 *   --dry-run    Show what would be processed without making API calls
 *   --limit=N    Process only the first N images without keywords
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const fs = require('fs').promises;
const Anthropic = require('@anthropic-ai/sdk');

// Configuration
const METADATA_PATH = path.join(__dirname, 'gallery-metadata.json');

// Parse command line arguments
const args = process.argv.slice(2);
const config = {
  dryRun: args.includes('--dry-run'),
  limit: parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || Infinity
};

/**
 * Get media type from file extension (avoids needing sharp as a dependency)
 */
function getMediaType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };
  return types[ext] || 'image/jpeg';
}

async function main() {
  console.log('🏷️  Keyword Backfill Script');
  console.log('='.repeat(50) + '\n');

  if (!process.env.ANTHROPIC_API_KEY && !config.dryRun) {
    console.error('❌ Error: ANTHROPIC_API_KEY not set in .env');
    process.exit(1);
  }

  if (config.dryRun) {
    console.log('🔍 DRY RUN MODE - No API calls will be made\n');
  }

  // Read metadata
  const metadataContent = await fs.readFile(METADATA_PATH, 'utf8');
  const metadata = JSON.parse(metadataContent);

  // Find images without keywords
  const needsKeywords = metadata.images.filter(
    img => !img.keywords || !Array.isArray(img.keywords) || img.keywords.length === 0
  );

  console.log(`📊 Total images: ${metadata.images.length}`);
  console.log(`🏷️  Images needing keywords: ${needsKeywords.length}`);

  if (needsKeywords.length === 0) {
    console.log('\n✅ All images already have keywords!');
    return;
  }

  const toProcess = needsKeywords.slice(0, config.limit);
  console.log(`🔄 Images to process this run: ${toProcess.length}\n`);

  const anthropic = config.dryRun ? null : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let totalCost = 0;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const img = toProcess[i];
    const imagePath = path.join(__dirname, img.imagePath);

    console.log(`[${i + 1}/${toProcess.length}] ${img.title} (${img.filename})...`);

    if (config.dryRun) {
      console.log(`   [DRY RUN] Would generate keywords for: ${imagePath}`);
      continue;
    }

    try {
      // Check image file exists
      await fs.access(imagePath);

      // Read image as base64
      const imageBuffer = await fs.readFile(imagePath);
      const imageBase64 = imageBuffer.toString('base64');
      const mediaType = getMediaType(img.filename);

      // Call Claude Haiku 4.5
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        temperature: 1.0,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageBase64
              }
            },
            {
              type: 'text',
              text: `Analyze this science image and generate search keywords for an elementary science education app.

Generate 3-6 keywords that a K-5 teacher would use to find this image. Keywords should be:
- NGSS-aligned where possible
- A mix of concrete observable terms (what you can see) and broader concept terms
- Single-word or two-word phrases only
- All lowercase
- Relevant to the science category: ${img.category}

Return ONLY a valid JSON array of strings. No other text.

Example output:
["germination", "plant lifecycle", "seed", "growth", "soil"]`
            }
          ]
        }]
      });

      // Calculate cost (Haiku 4.5 pricing: $1/MTok input, $5/MTok output)
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      const cost = (inputTokens * 0.001 / 1000) + (outputTokens * 0.005 / 1000);
      totalCost += cost;

      // Parse response
      let responseText = response.content[0].text;
      let keywords;
      try {
        keywords = JSON.parse(responseText);
      } catch (parseError) {
        // Try to extract JSON array if wrapped in markdown or other text
        const start = responseText.indexOf('[');
        const end = responseText.lastIndexOf(']') + 1;
        if (start !== -1 && end > start) {
          keywords = JSON.parse(responseText.substring(start, end));
        } else {
          throw new Error('Could not parse JSON array from response');
        }
      }

      // Validate and normalize
      if (!Array.isArray(keywords) || keywords.length < 3) {
        throw new Error(`Invalid keywords: got ${JSON.stringify(keywords)}`);
      }
      keywords = keywords.map(k => String(k).toLowerCase().trim()).filter(k => k.length > 0);

      // Write keywords into the metadata object (in memory)
      const entry = metadata.images.find(m => m.id === img.id);
      if (entry) {
        entry.keywords = keywords;
      }

      successCount++;
      console.log(`   ✅ ${keywords.join(', ')} ($${cost.toFixed(4)})`);

    } catch (error) {
      failCount++;
      console.error(`   ❌ Failed: ${error.message}`);
    }

    // Rate limiting: 1 second delay between API calls
    if (i < toProcess.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Save updated metadata
  if (!config.dryRun && successCount > 0) {
    metadata.lastUpdated = new Date().toISOString();
    await fs.writeFile(METADATA_PATH, JSON.stringify(metadata, null, 2));
    console.log(`\n💾 Saved updated gallery-metadata.json`);
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary');
  console.log('='.repeat(50));
  console.log(`✅ Successfully generated: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`💰 Total cost: $${totalCost.toFixed(4)}`);
  console.log(`📁 Remaining without keywords: ${needsKeywords.length - successCount}`);
  console.log('\n✨ Done! Commit gallery-metadata.json when ready.\n');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * Extract NGSS Standards from Existing Educational Content
 *
 * This script reads all existing educational content and extracts NGSS standards,
 * then updates gallery-metadata.json with the extracted standards.
 */

const fs = require('fs').promises;
const path = require('path');

const CONTENT_DIR = path.join(__dirname, 'content');
const GALLERY_METADATA_PATH = path.join(__dirname, 'gallery-metadata.json');
const GRADE_LEVELS = ['kindergarten', 'grade1', 'grade2', 'grade3', 'grade4', 'grade5'];
const CATEGORIES = ['earth-space-science', 'life-science', 'physical-science'];

/**
 * Extract NGSS standards from educational content
 * Matches patterns like: K-LS1-1, 3-LS4.C, 2-PS1.A, 5-ESS2-1, 3-LS4-3
 */
function extractNGSSStandards(content) {
  if (!content) return [];

  // Regex pattern to match NGSS standard codes
  // Matches: [K/1-5]-[2-4 letters][optional digit][. or -][digit(s) OR letter]
  const ngssPattern = /\b([K1-5]-[A-Z]{2,4}\d?[.-](?:\d+[A-Z]?|[A-Z]))\b/g;
  const matches = content.matchAll(ngssPattern);

  // Extract unique standards
  const standards = new Set();
  for (const match of matches) {
    standards.add(match[1]);
  }

  return Array.from(standards).sort();
}

/**
 * Extract NGSS standards from all grade levels
 * Handles both naming conventions:
 * - Abbreviated: grade1, grade2, grade3, grade4, grade5
 * - Spelled-out: firstgrade, secondgrade, thirdgrade, fourthgrade, fifthgrade
 */
function extractAllGradeLevelStandards(educational) {
  const ngssStandards = {};
  
  // Map of output keys (abbreviated) to possible input keys (both conventions)
  const gradeMapping = {
    'kindergarten': ['kindergarten'],
    'grade1': ['grade1', 'firstgrade'],
    'grade2': ['grade2', 'secondgrade'],
    'grade3': ['grade3', 'thirdgrade'],
    'grade4': ['grade4', 'fourthgrade'],
    'grade5': ['grade5', 'fifthgrade']
  };

  for (const [outputKey, possibleKeys] of Object.entries(gradeMapping)) {
    // Try each possible key until we find content
    for (const inputKey of possibleKeys) {
      if (educational[inputKey]) {
        const standards = extractNGSSStandards(educational[inputKey]);
        if (standards.length > 0) {
          ngssStandards[outputKey] = standards;
        }
        break; // Found content for this grade, move to next
      }
    }
  }

  return ngssStandards;
}

/**
 * Process a single content file
 */
async function processContentFile(category, filename) {
  const filePath = path.join(CONTENT_DIR, category, filename);

  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const contentData = JSON.parse(fileContent);

    // Check if educational content exists
    if (!contentData.educational) {
      return { skipped: true, reason: 'no educational content' };
    }

    // Extract NGSS standards from all grade levels
    const ngssStandards = extractAllGradeLevelStandards(contentData.educational);

    // Count total standards
    const totalStandards = Object.values(ngssStandards).reduce((sum, arr) => sum + arr.length, 0);

    return {
      success: true,
      filename: filename,  // Use filename for matching instead of title
      category,
      ngssStandards,
      totalStandards
    };
  } catch (error) {
    return { error: error.message, filename };
  }
}

/**
 * Update gallery metadata with all extracted standards
 */
async function updateGalleryMetadata(extractedData) {
  try {
    // Read existing metadata
    const metadataContent = await fs.readFile(GALLERY_METADATA_PATH, 'utf-8');
    const metadata = JSON.parse(metadataContent);

    let updatedCount = 0;
    let notFoundCount = 0;

    // Update each image with its NGSS standards
    for (const data of extractedData) {
      if (!data.success) continue;

      // Match by filename and category instead of title
      const imageIndex = metadata.images.findIndex(img => {
        // Get filename without extension from both content file and metadata
        const contentFilename = data.filename.replace('.json', '');
        const metadataFilename = img.filename.replace(/\.[^/.]+$/, ''); // Remove any extension
        
        return metadataFilename === contentFilename && img.category === data.category;
      });

      if (imageIndex !== -1) {
        metadata.images[imageIndex].ngssStandards = data.ngssStandards;
        updatedCount++;
      } else {
        console.log(`   ⚠️  Warning: Could not find "${data.filename}" in metadata (category: ${data.category})`);
        notFoundCount++;
      }
    }

    // Write updated metadata back to file
    await fs.writeFile(
      GALLERY_METADATA_PATH,
      JSON.stringify(metadata, null, 2),
      'utf-8'
    );

    return { updatedCount, notFoundCount };
  } catch (error) {
    throw new Error(`Failed to update metadata: ${error.message}`);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 NGSS Standards Extraction Tool\n');
  console.log('Extracting standards from existing educational content...\n');

  const extractedData = [];
  let totalFiles = 0;
  let totalSuccess = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // Process each category
  for (const category of CATEGORIES) {
    console.log(`\n📁 Category: ${category}`);
    console.log('─'.repeat(50));

    const categoryPath = path.join(CONTENT_DIR, category);
    const files = await fs.readdir(categoryPath);
    const jsonFiles = files.filter(f => f.endsWith('.json') && !f.includes('-edp'));

    console.log(`Found ${jsonFiles.length} content file(s)\n`);

    for (const filename of jsonFiles) {
      totalFiles++;
      const result = await processContentFile(category, filename);

      if (result.success) {
        console.log(`✅ ${result.filename} - ${result.totalStandards} standards extracted`);
        extractedData.push(result);
        totalSuccess++;
      } else if (result.skipped) {
        console.log(`⏭️  ${filename} - ${result.reason}`);
        totalSkipped++;
      } else if (result.error) {
        console.log(`❌ ${filename} - Error: ${result.error}`);
        totalErrors++;
      }
    }
  }

  // Update gallery metadata
  if (extractedData.length > 0) {
    console.log('\n' + '='.repeat(50));
    console.log('📊 Updating Gallery Metadata');
    console.log('='.repeat(50));

    const { updatedCount, notFoundCount } = await updateGalleryMetadata(extractedData);

    console.log(`✅ Updated ${updatedCount} image(s) in gallery metadata`);
    if (notFoundCount > 0) {
      console.log(`⚠️  ${notFoundCount} image(s) not found in metadata`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📈 Summary');
  console.log('='.repeat(50));
  console.log(`Total files processed: ${totalFiles}`);
  console.log(`✅ Successfully extracted: ${totalSuccess}`);
  console.log(`⏭️  Skipped (no content): ${totalSkipped}`);
  console.log(`❌ Errors: ${totalErrors}`);

  const totalStandardsExtracted = extractedData.reduce((sum, data) => sum + data.totalStandards, 0);
  console.log(`\n🎓 Total standards extracted: ${totalStandardsExtracted}`);

  console.log('\n✨ Done!\n');
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

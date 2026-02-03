#!/usr/bin/env node

/**
 * Educational Content Generator
 *
 * This script generates grade-level educational content (K-5) for all photos
 * using the Claude API.
 *
 * Usage:
 *   1. Install dependencies: npm install @anthropic-ai/sdk dotenv
 *   2. Create .env file with: ANTHROPIC_API_KEY=your_key_here
 *   3. Run: node generate-educational-content.js
 *
 * Optional flags:
 *   --category=life-science    Generate only for specific category
 *   --photo=beach.json         Generate only for specific photo
 *   --dry-run                  Show what would be generated without API calls
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

// Configuration
const CONTENT_DIR = path.join(__dirname, 'content');
const GRADE_LEVELS = ['kindergarten', 'grade1', 'grade2', 'grade3', 'grade4', 'grade5'];
const CATEGORIES = ['earth-space-science', 'life-science', 'physical-science'];

// Parse command line arguments
const args = process.argv.slice(2);
const config = {
  category: args.find(a => a.startsWith('--category='))?.split('=')[1],
  photo: args.find(a => a.startsWith('--photo='))?.split('=')[1],
  dryRun: args.includes('--dry-run')
};

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Generate educational content for a specific grade level
 */
async function generateContentForGrade(photoData, gradeLevel) {
  const gradeDescriptions = {
    kindergarten: 'Kindergarten (ages 5-6)',
    grade1: '1st Grade (ages 6-7)',
    grade2: '2nd Grade (ages 7-8)',
    grade3: '3rd Grade (ages 8-9)',
    grade4: '4th Grade (ages 9-10)',
    grade5: '5th Grade (ages 10-11)'
  };

  const prompt = `You are an expert elementary science educator. Generate educational content for the photo titled "${photoData.title}" in the category "${photoData.category}".

The content should be appropriate for ${gradeDescriptions[gradeLevel]} and follow this exact structure:

## 📸 Photo Description
[Describe what's visible in the photo at an age-appropriate level]

## 🔬 Scientific Phenomena
[Explain the main scientific concept at an age-appropriate level]

## 📚 Core Science Concepts
[List 2-3 key concepts appropriate for this grade]

<pedagogical-tip>
[Provide teaching strategies specific to this grade level]
</pedagogical-tip>

<udl-suggestions>
[Provide Universal Design for Learning suggestions for this grade]
</udl-suggestions>

## 🎓 NGSS Connections
[List relevant NGSS standards for this grade using format: [[NGSS:DCI:CODE]] or [[NGSS:CCC:CONCEPT]]]

## 💬 Discussion Questions
[Provide 3-4 questions appropriate for this grade level with DOK levels]

## 📖 Vocabulary
[Define 4-6 key terms at appropriate reading level]

## 🌡️ Extension Activities
[Suggest 2-3 activities appropriate for this grade level]

Guidelines:
- Adjust vocabulary complexity for the grade level
- Use simpler sentence structures for younger grades
- Scale the depth of scientific explanation appropriately
- Ensure activities are age-appropriate
- For K-2: Focus on observation, simple patterns, and hands-on exploration
- For 3-5: Introduce more complex concepts, data analysis, and experimental design

Here is the existing general (3rd grade) content for reference:
${photoData.content}`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    return message.content[0].text;
  } catch (error) {
    console.error(`Error generating content for ${photoData.title} - ${gradeLevel}:`, error.message);
    throw error;
  }
}

/**
 * Process a single photo file
 */
async function processPhoto(category, filename) {
  const filePath = path.join(CONTENT_DIR, category, filename);

  try {
    // Read existing JSON
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const photoData = JSON.parse(fileContent);

    // Check if educational content already exists
    if (photoData.educational) {
      console.log(`⏭️  Skipping ${photoData.title} - educational content already exists`);
      return { skipped: true };
    }

    console.log(`\n📝 Processing: ${photoData.title}`);

    if (config.dryRun) {
      console.log(`   [DRY RUN] Would generate content for grades: ${GRADE_LEVELS.join(', ')}`);
      return { dryRun: true };
    }

    // Generate content for each grade level
    const educational = {};
    for (const gradeLevel of GRADE_LEVELS) {
      console.log(`   Generating ${gradeLevel}...`);
      educational[gradeLevel] = await generateContentForGrade(photoData, gradeLevel);

      // Add a small delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Update the JSON with new educational content
    photoData.educational = educational;

    // Write back to file
    await fs.writeFile(filePath, JSON.stringify(photoData, null, 2), 'utf-8');

    console.log(`   ✅ Complete!`);
    return { success: true, grades: GRADE_LEVELS.length };
  } catch (error) {
    console.error(`   ❌ Error processing ${filename}:`, error.message);
    return { error: error.message };
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Educational Content Generator\n');

  if (!process.env.ANTHROPIC_API_KEY && !config.dryRun) {
    console.error('❌ Error: ANTHROPIC_API_KEY environment variable not set');
    console.log('Set it with: export ANTHROPIC_API_KEY=your_key_here');
    process.exit(1);
  }

  if (config.dryRun) {
    console.log('🔍 DRY RUN MODE - No API calls will be made\n');
  }

  // Determine which categories to process
  const categoriesToProcess = config.category
    ? [config.category]
    : CATEGORIES;

  let totalPhotos = 0;
  let totalGenerated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // Process each category
  for (const category of categoriesToProcess) {
    console.log(`\n📁 Category: ${category}`);
    console.log('─'.repeat(50));

    const categoryPath = path.join(CONTENT_DIR, category);
    const files = await fs.readdir(categoryPath);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    // Filter by specific photo if requested
    const photosToProcess = config.photo
      ? jsonFiles.filter(f => f === config.photo)
      : jsonFiles;

    if (photosToProcess.length === 0) {
      console.log('No photos to process in this category.');
      continue;
    }

    console.log(`Found ${photosToProcess.length} photo(s) to process\n`);

    for (const filename of photosToProcess) {
      totalPhotos++;
      const result = await processPhoto(category, filename);

      if (result.skipped) totalSkipped++;
      if (result.success) totalGenerated++;
      if (result.error) totalErrors++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary');
  console.log('='.repeat(50));
  console.log(`Total photos processed: ${totalPhotos}`);
  console.log(`✅ Successfully generated: ${totalGenerated}`);
  console.log(`⏭️  Skipped (already have content): ${totalSkipped}`);
  console.log(`❌ Errors: ${totalErrors}`);

  if (!config.dryRun && totalGenerated > 0) {
    const totalGrades = totalGenerated * GRADE_LEVELS.length;
    console.log(`\n🎓 Total grade-level content pieces generated: ${totalGrades}`);
    console.log(`💰 Estimated cost: $${(totalGrades * 0.002).toFixed(2)}`);
  }

  console.log('\n✨ Done!\n');
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

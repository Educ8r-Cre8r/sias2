#!/usr/bin/env node

/**
 * Auto Content Generator for New Photos
 *
 * This script monitors the images directory for new photos and automatically:
 * 1. Creates JSON metadata files for new images
 * 2. Generates K-5 educational content using Claude API
 *
 * Usage:
 *   node auto-generate-content.js
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

// Configuration
const IMAGES_DIR = path.join(__dirname, 'images');
const CONTENT_DIR = path.join(__dirname, 'content');
const CATEGORIES = ['earth-space-science', 'life-science', 'physical-science'];
const GRADE_LEVELS = ['kindergarten', 'grade1', 'grade2', 'grade3', 'grade4', 'grade5'];

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Get all image files from the images directory
 */
async function getImageFiles() {
  const files = await fs.readdir(IMAGES_DIR);
  return files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
}

/**
 * Get all existing JSON files across all categories
 */
async function getExistingJsonFiles() {
  const existingFiles = new Set();

  for (const category of CATEGORIES) {
    const categoryPath = path.join(CONTENT_DIR, category);
    try {
      const files = await fs.readdir(categoryPath);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const jsonFile of jsonFiles) {
        const content = await fs.readFile(path.join(categoryPath, jsonFile), 'utf-8');
        const data = JSON.parse(content);
        if (data.image) {
          existingFiles.add(data.image);
        }
      }
    } catch (err) {
      console.error(`Error reading category ${category}:`, err.message);
    }
  }

  return existingFiles;
}

/**
 * Prompt user to select category for new photo
 */
async function promptForCategory(imageName) {
  console.log(`\nNew photo detected: ${imageName}`);
  console.log('Select a category:');
  console.log('1. Earth & Space Science');
  console.log('2. Life Science');
  console.log('3. Physical Science');
  console.log('s. Skip this photo\n');

  // For automation, we'll return null to skip
  // In interactive mode, you would read from stdin
  return null;
}

/**
 * Generate initial metadata for a photo using Claude
 */
async function generatePhotoMetadata(imageName, category) {
  const prompt = `You are a science education expert. A teacher has uploaded a photo named "${imageName}" to create educational content for elementary students.

Based on the filename, suggest appropriate metadata for this photo. Provide your response in this JSON format:

{
  "title": "[A descriptive title for the photo]",
  "description": "[A brief description of what the photo shows]",
  "category": "${category}",
  "tags": ["tag1", "tag2", "tag3"]
}

Focus on scientific concepts appropriate for K-5 education. Be specific and educational.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const response = message.content[0].text;
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Could not parse metadata response');
  } catch (error) {
    console.error(`Error generating metadata for ${imageName}:`, error.message);
    throw error;
  }
}

/**
 * Generate 3rd grade educational content for a photo
 */
async function generateBaseEducationalContent(metadata) {
  const prompt = `You are an expert elementary science educator. Generate educational content for this photo:

Title: ${metadata.title}
Description: ${metadata.description}
Category: ${metadata.category}

Create content appropriate for 3rd Grade (ages 8-9) following this exact structure:

## 📸 Photo Description
[Describe what's visible in the photo]

## 🔬 Scientific Phenomena
[Explain the main scientific concept]

## 📚 Core Science Concepts
[List 2-3 key concepts]

<pedagogical-tip>
[Provide teaching strategies for 3rd grade]
</pedagogical-tip>

<udl-suggestions>
[Provide Universal Design for Learning suggestions]
</udl-suggestions>

## 🎓 NGSS Connections
[List relevant NGSS standards using format: [[NGSS:DCI:CODE]] or [[NGSS:CCC:CONCEPT]]]

## 💬 Discussion Questions
[Provide 3-4 questions with DOK levels]

## 📖 Vocabulary
[Define 4-6 key terms at appropriate reading level]

## 🌡️ Extension Activities
[Suggest 2-3 activities appropriate for 3rd grade]`;

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
    console.error(`Error generating base content:`, error.message);
    throw error;
  }
}

/**
 * Generate content for a specific grade level
 */
async function generateGradeContent(metadata, baseContent, gradeLevel) {
  const gradeDescriptions = {
    kindergarten: 'Kindergarten (ages 5-6)',
    grade1: '1st Grade (ages 6-7)',
    grade2: '2nd Grade (ages 7-8)',
    grade3: '3rd Grade (ages 8-9)',
    grade4: '4th Grade (ages 9-10)',
    grade5: '5th Grade (ages 10-11)'
  };

  const prompt = `You are an expert elementary science educator. Generate educational content for ${gradeDescriptions[gradeLevel]}.

Photo Title: ${metadata.title}
Category: ${metadata.category}

Follow this exact structure:

## 📸 Photo Description
[Describe what's visible at an age-appropriate level]

## 🔬 Scientific Phenomena
[Explain the main concept at an age-appropriate level]

## 📚 Core Science Concepts
[List 2-3 key concepts appropriate for this grade]

<pedagogical-tip>
[Provide teaching strategies for this grade level]
</pedagogical-tip>

<udl-suggestions>
[Provide Universal Design for Learning suggestions]
</udl-suggestions>

## 🎓 NGSS Connections
[List relevant NGSS standards]

## 💬 Discussion Questions
[Provide 3-4 age-appropriate questions with DOK levels]

## 📖 Vocabulary
[Define 4-6 key terms at appropriate reading level]

## 🌡️ Extension Activities
[Suggest 2-3 age-appropriate activities]

Guidelines:
- Adjust vocabulary for the grade level
- Use simpler structures for younger grades
- Scale depth of explanation appropriately
- For K-2: Focus on observation and hands-on exploration
- For 3-5: Introduce more complex concepts and analysis

Reference (3rd grade content):
${baseContent}`;

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
    console.error(`Error generating ${gradeLevel} content:`, error.message);
    throw error;
  }
}

/**
 * Process a new photo
 */
async function processNewPhoto(imageName, category) {
  console.log(`\n📝 Processing new photo: ${imageName}`);

  try {
    // Step 1: Generate metadata
    console.log('   Generating metadata...');
    const metadata = await generatePhotoMetadata(imageName, category);

    // Step 2: Generate base educational content (3rd grade)
    console.log('   Generating 3rd grade content...');
    const baseContent = await generateBaseEducationalContent(metadata);

    // Step 3: Generate grade-specific content
    const educational = {};
    for (const gradeLevel of GRADE_LEVELS) {
      console.log(`   Generating ${gradeLevel}...`);
      educational[gradeLevel] = await generateGradeContent(metadata, baseContent, gradeLevel);
      await new Promise(resolve => setTimeout(resolve, 500)); // Rate limiting
    }

    // Step 4: Create JSON file
    const jsonFilename = imageName.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '.json');
    const photoData = {
      id: jsonFilename.replace('.json', ''),
      title: metadata.title,
      description: metadata.description,
      image: imageName,
      category: category,
      tags: metadata.tags || [],
      content: baseContent,
      educational: educational
    };

    // Step 5: Save to appropriate category folder
    const outputPath = path.join(CONTENT_DIR, category, jsonFilename);
    await fs.writeFile(outputPath, JSON.stringify(photoData, null, 2), 'utf-8');

    console.log(`   ✅ Complete! Saved to ${category}/${jsonFilename}`);
    return { success: true, filename: jsonFilename };

  } catch (error) {
    console.error(`   ❌ Error processing ${imageName}:`, error.message);
    return { error: error.message };
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 Auto Content Generator for New Photos\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ Error: ANTHROPIC_API_KEY not set');
    console.log('Set it in your .env file');
    process.exit(1);
  }

  // Get all images and existing content
  console.log('Scanning for new photos...\n');
  const imageFiles = await getImageFiles();
  const existingImages = await getExistingJsonFiles();

  // Find new photos
  const newPhotos = imageFiles.filter(img => !existingImages.has(img));

  if (newPhotos.length === 0) {
    console.log('✅ No new photos found. All photos have content!');
    return;
  }

  console.log(`Found ${newPhotos.length} new photo(s):\n`);
  newPhotos.forEach((photo, idx) => {
    console.log(`${idx + 1}. ${photo}`);
  });

  console.log('\n⚠️  Interactive mode not implemented yet.');
  console.log('To process new photos, please:');
  console.log('1. Manually create JSON files in content/<category>/ folders');
  console.log('2. Run: node generate-educational-content.js');
  console.log('\nOr modify this script to assign categories automatically.');
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

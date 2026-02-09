/**
 * Science In A Snapshot - Educational Content Generation Tool
 *
 * This script uses Claude API to generate Third Grade level educational
 * content for each image in the gallery.
 *
 * Usage:
 *   node generate-content.js --all
 *   node generate-content.js --category life-science
 *   node generate-content.js --image bee.jpeg
 *
 * Requirements:
 *   - ANTHROPIC_API_KEY environment variable set
 *   - gallery-metadata.json file exists
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
  return 'image/jpeg';
}

// Grade level configurations
const GRADE_LEVELS = {
  'kindergarten': { name: 'Kindergarten', readingLevel: 'K.0-1.0', ngssGrade: 'K' },
  'first-grade': { name: 'First Grade', readingLevel: '1.0-2.0', ngssGrade: '1' },
  'second-grade': { name: 'Second Grade', readingLevel: '2.0-3.0', ngssGrade: '2' },
  'third-grade': { name: 'Third Grade', readingLevel: '3.0-4.0', ngssGrade: '3' },
  'fourth-grade': { name: 'Fourth Grade', readingLevel: '4.0-5.0', ngssGrade: '4' },
  'fifth-grade': { name: 'Fifth Grade', readingLevel: '5.0-6.0', ngssGrade: '5' }
};

// Generate educational content for a single image at a specific grade level
async function generateContent(imageItem, gradeLevel) {
  try {
    const imagePath = path.join(__dirname, '..', imageItem.imagePath);
    const imageBase64 = readImageAsBase64(imagePath);
    const mediaType = getImageMediaType(imageItem.filename);

    const categoryName = config.CATEGORIES[imageItem.category]?.name || imageItem.category;
    const grade = GRADE_LEVELS[gradeLevel];

    const prompt = `You are an expert K-5 Science Instructional Coach and NGSS Curriculum Specialist.

Your goal is to analyze the provided image to help a teacher create a rigorous, age-appropriate science lesson for a **${grade.name}** class.

Category: ${categoryName}
Image: ${imageItem.filename}

### GUIDELINES
- **Tone:** Professional, encouraging, and scientifically accurate
- **Audience:** The teacher (not the student)
- **Format:** Strict Markdown. Start directly with the first section header
- **Safety:** Ensure all suggested activities are safe for Third Grade students

### REQUIRED OUTPUT SECTIONS
Generate ONLY the sections below. Use Level 2 Markdown headers (##) with emojis.

## 📸 Photo Description
Describe the key scientific elements visible in 2-3 sentences at ${grade.name} reading level (Flesch-Kincaid ${grade.readingLevel}). Focus on observable features.

## 🔬 Scientific Phenomena
Identify the specific "Anchoring Phenomenon" this image represents. Explain WHY it is happening scientifically, in language appropriate for elementary teachers.

## 📚 Core Science Concepts
Detail 2-4 fundamental science concepts illustrated by this photo. Use numbered or bulleted lists.

**CRITICAL:** Somewhere within this section, you MUST include:
1. A short pedagogical tip wrapped in <pedagogical-tip>...</pedagogical-tip> tags
2. A Universal Design for Learning (UDL) suggestion wrapped in <udl-suggestions>...</udl-suggestions> tags

## 🔍 Zoom In / Zoom Out Concepts
Provide two distinct perspectives:
1. **Zoom In:** A microscopic or unseen process (e.g., cellular level, atomic)
2. **Zoom Out:** The larger system connection (e.g., ecosystem, watershed, planetary)

## 🤔 Potential Student Misconceptions
List 1-3 common naive conceptions ${grade.name} students might have about this topic and provide the scientific clarification.

## 🎓 NGSS Connections
- You MUST use specific formatting for clickable links
- Wrap Disciplinary Core Ideas (DCI) in double brackets: [[NGSS:DCI:Code]]
  Example: [[NGSS:DCI:3-LS4.D]]
- Wrap Crosscutting Concepts (CCC) in double brackets: [[NGSS:CCC:Name]]
  Example: [[NGSS:CCC:Patterns]]
- List the Performance Expectation (PE) code and text normally

## 💬 Discussion Questions
Provide 3-4 open-ended questions. Label EVERY question with its Bloom's Taxonomy level and Depth of Knowledge (DOK) level.
Example: "Why did the ice melt? (Bloom's: Analyze | DOK: 2)"

## 📖 Science Vocabulary
Provide a bulleted list of 3-6 tier 2 or tier 3 science words.
Format strictly as: * **Word:** Kid-friendly definition (1 sentence)

## 🔗 Cross-Curricular Ideas
Provide 3-4 ideas for connecting the science in this photo to other subjects like Math, ELA, Social Studies, or Art for a ${grade.name} classroom.

## 🚀 STEM Career Connection
List and briefly describe 2-3 STEM careers that relate to the science shown in this photo. Describe the job simply for a ${grade.name} student. For each career, also provide an estimated average annual salary in USD.

## 📚 External Resources
Provide real, existing resources:
- **Children's Books:** Title by Author (2-3 books)

---

Remember:
- Use Markdown formatting throughout
- Include the special XML tags for pedagogical tips and UDL strategies
- Use the [[NGSS:...]] format for standards (use ${grade.ngssGrade} standards when available)
- Keep language at ${grade.name} level where appropriate
- Be scientifically accurate and engaging`;

    const message = await anthropic.messages.create({
      model: config.MODEL,
      max_tokens: config.MAX_TOKENS,
      temperature: config.TEMPERATURE,
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

    const content = message.content[0].text;

    return {
      id: imageItem.id,
      title: imageItem.title,
      category: imageItem.category,
      imageFile: imageItem.filename,
      imagePath: imageItem.imagePath,
      gradeLevel: gradeLevel,
      content: content,
      generatedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error(`Error generating content for ${imageItem.filename}:`, error.message);
    return null;
  }
}

// Main content generation function
async function generateAllContent(options = {}) {
  console.log('📝 Science In A Snapshot - Content Generation');
  console.log('=============================================\n');

  // Check API key
  if (!config.ANTHROPIC_API_KEY) {
    console.error('❌ Error: ANTHROPIC_API_KEY not set in environment variables.');
    console.error('   Please set it with: export ANTHROPIC_API_KEY="sk-ant-..."');
    console.error('   Or add it to a .env file in the tools directory.\n');
    process.exit(1);
  }

  // Load gallery metadata
  const metadataPath = path.join(__dirname, '..', 'gallery-metadata.json');
  if (!fs.existsSync(metadataPath)) {
    console.error('❌ Error: gallery-metadata.json not found.');
    console.error('   Please run organize-images.js first.\n');
    process.exit(1);
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
  let imagesToProcess = metadata.images;

  // Filter by category if specified
  if (options.category) {
    imagesToProcess = imagesToProcess.filter(img => img.category === options.category);
    console.log(`🎯 Filtering by category: ${options.category}`);
  }

  // Filter by specific image if specified
  if (options.image) {
    imagesToProcess = imagesToProcess.filter(img => img.filename === options.image);
    console.log(`🎯 Processing single image: ${options.image}`);
  }

  // Skip images that already have content for ALL grade levels (unless forced)
  if (!options.force) {
    const beforeCount = imagesToProcess.length;
    imagesToProcess = imagesToProcess.filter(img => {
      // Check if content exists for all grade levels
      const baseName = path.basename(img.contentFile, '.json');
      const dirName = path.dirname(img.contentFile);

      for (const gradeKey of Object.keys(GRADE_LEVELS)) {
        const gradeContentFile = `${dirName}/${baseName}-${gradeKey}.json`;
        const contentPath = path.join(__dirname, '..', gradeContentFile);
        if (!fs.existsSync(contentPath)) {
          return true; // Include this image because at least one grade level is missing
        }
      }
      return false; // Skip this image because all grade levels exist
    });
    const skippedCount = beforeCount - imagesToProcess.length;
    if (skippedCount > 0) {
      console.log(`📋 Skipped ${skippedCount} images that already have content for all grade levels`);
    }
  }

  const totalGenerations = imagesToProcess.length * Object.keys(GRADE_LEVELS).length;
  console.log(`📊 Generating content for ${imagesToProcess.length} images × ${Object.keys(GRADE_LEVELS).length} grade levels = ${totalGenerations} total pieces\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < imagesToProcess.length; i++) {
    const imageItem = imagesToProcess[i];
    console.log(`\n[${i + 1}/${imagesToProcess.length}] Processing: ${imageItem.filename}`);

    // Generate content for each grade level
    for (const [gradeKey, gradeInfo] of Object.entries(GRADE_LEVELS)) {
      console.log(`   📝 Generating ${gradeInfo.name} content...`);

      const result = await generateContent(imageItem, gradeKey);

      if (result) {
        // Create grade-specific filename
        const baseName = path.basename(imageItem.contentFile, '.json');
        const dirName = path.dirname(imageItem.contentFile);
        const gradeContentFile = `${dirName}/${baseName}-${gradeKey}.json`;
        const contentPath = path.join(__dirname, '..', gradeContentFile);
        const contentDir = path.dirname(contentPath);

        // Ensure directory exists
        if (!fs.existsSync(contentDir)) {
          fs.mkdirSync(contentDir, { recursive: true });
        }

        fs.writeFileSync(contentPath, JSON.stringify(result, null, 2));
        console.log(`   ✅ ${gradeInfo.name} content saved`);
        successCount++;

      } else {
        console.log(`   ❌ Failed to generate ${gradeInfo.name} content`);
        errorCount++;
      }

      // Rate limiting between grade levels
      await delay(config.RATE_LIMIT_DELAY);
    }

    // Update metadata to indicate content exists
    imageItem.hasContent = true;

    // Rate limiting
    if (i < imagesToProcess.length - 1) {
      console.log(`   ⏳ Waiting ${config.RATE_LIMIT_DELAY}ms before next request...`);
      await delay(config.RATE_LIMIT_DELAY);
    }
  }

  // Update gallery metadata
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  console.log('💾 Updated gallery-metadata.json\n');

  // Summary
  console.log('\n📊 Summary:');
  console.log(`   ✅ Successfully generated: ${successCount}`);
  console.log(`   ❌ Failed: ${errorCount}`);
  console.log(`   📁 Total images processed: ${imagesToProcess.length}`);
  console.log(`   📚 Total grade-level content pieces generated: ${successCount}\n`);

  // Rough cost estimation (Claude Sonnet 4: $3/MTok input, $15/MTok output)
  // Estimated ~2000 tokens input, ~3000 tokens output per generation
  const estimatedCost = successCount * ((2000 * 3 / 1000000) + (3000 * 15 / 1000000));
  console.log(`💰 Estimated cost: $${estimatedCost.toFixed(2)}\n`);

  console.log('✨ Content generation complete!');
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {};

if (args.includes('--all')) {
  options.all = true;
} else if (args.includes('--category')) {
  const categoryIndex = args.indexOf('--category');
  options.category = args[categoryIndex + 1];
} else if (args.includes('--image')) {
  const imageIndex = args.indexOf('--image');
  options.image = args[imageIndex + 1];
} else {
  console.log('Usage:');
  console.log('  node generate-content.js --all');
  console.log('  node generate-content.js --category life-science');
  console.log('  node generate-content.js --image bee.jpeg\n');
  process.exit(0);
}

// Run the script
generateAllContent(options).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

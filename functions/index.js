/**
 * Science In A Snapshot - Automated Image Processing
 *
 * This Cloud Function automatically:
 * 1. Detects new images uploaded to Firebase Storage
 * 2. Validates file size (must be under 2MB)
 * 3. Checks for duplicates
 * 4. Generates educational content for all grade levels
 * 5. Updates gallery-metadata.json
 * 6. Commits and pushes to GitHub
 * 7. Logs results with cost summary
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const Anthropic = require('@anthropic-ai/sdk');
const simpleGit = require('simple-git');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

// Load environment variables (for local testing)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// Initialize Firebase Admin
admin.initializeApp();

// Grade levels for content generation
const GRADE_LEVELS = [
  { key: 'kindergarten', name: 'Kindergarten' },
  { key: 'first-grade', name: 'First Grade' },
  { key: 'second-grade', name: 'Second Grade' },
  { key: 'third-grade', name: 'Third Grade' },
  { key: 'fourth-grade', name: 'Fourth Grade' },
  { key: 'fifth-grade', name: 'Fifth Grade' }
];

/**
 * Main Cloud Function - Triggers when a file is uploaded to Storage
 * Memory: 1GB (needed for git clone + image processing)
 * Timeout: 540s (9 minutes - max for free tier)
 */
exports.processImage = functions
  .runWith({
    memory: '1GB',
    timeoutSeconds: 540
  })
  .storage.object().onFinalize(async (object) => {
  const filePath = object.name; // e.g., "uploads/life-science/frog.jpg"
  const contentType = object.contentType;
  const bucket = admin.storage().bucket(object.bucket);

  console.log(`📥 New file detected: ${filePath}`);

  // Only process files in the /uploads/ directory
  if (!filePath.startsWith('uploads/')) {
    console.log('⏭️  File not in uploads directory, skipping');
    return null;
  }

  // Only process image files
  if (!contentType || !contentType.startsWith('image/')) {
    console.log('⏭️  Not an image file, skipping');
    return null;
  }

  try {
    // Parse the file path: uploads/category/filename.jpg
    const pathParts = filePath.split('/');
    if (pathParts.length !== 3) {
      console.error('❌ Invalid path format. Expected: uploads/category/filename.jpg');
      return null;
    }

    const [, category, filename] = pathParts;
    const validCategories = ['life-science', 'earth-space-science', 'physical-science'];

    if (!validCategories.includes(category)) {
      console.error(`❌ Invalid category: ${category}. Must be one of: ${validCategories.join(', ')}`);
      return null;
    }

    console.log(`📂 Category: ${category}`);
    console.log(`📄 Filename: ${filename}`);

    // Check file size (should be under 2MB)
    const fileSize = parseInt(object.size);
    const maxSize = 2 * 1024 * 1024; // 2MB

    if (fileSize > maxSize) {
      console.error(`❌ File too large: ${(fileSize / 1024 / 1024).toFixed(2)}MB (max 2MB)`);
      return null;
    }

    console.log(`✅ File size OK: ${(fileSize / 1024).toFixed(2)}KB`);

    // Download the file to a temporary location
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, filename);

    await bucket.file(filePath).download({ destination: tempFilePath });
    console.log(`⬇️  Downloaded to: ${tempFilePath}`);

    // Clone the GitHub repo to temp directory
    const repoDir = path.join(tempDir, 'sias2-repo');
    const githubToken = process.env.GITHUB_TOKEN;
    const repoUrl = `https://${githubToken}@github.com/Educ8r-Cre8r/sias2.git`;

    console.log('📦 Cloning GitHub repository...');
    const git = simpleGit();
    await git.clone(repoUrl, repoDir);
    console.log('✅ Repository cloned');

    const repoGit = simpleGit(repoDir);
    await repoGit.addConfig('user.name', 'SIAS Automation');
    await repoGit.addConfig('user.email', 'mr.alexdjones@gmail.com');

    // Check for duplicates - see if this image already exists
    const targetImagePath = path.join(repoDir, 'images', category, filename);
    const imageExists = await fs.access(targetImagePath).then(() => true).catch(() => false);

    if (imageExists) {
      console.warn(`⚠️  Duplicate detected: ${filename} already exists in ${category}`);
      // Move to a "duplicates" folder in storage
      await bucket.file(filePath).move(`duplicates/${category}/${filename}`);
      console.log('📦 Moved to duplicates folder');
      return null;
    }

    // Copy image to the repo's images directory
    await fs.mkdir(path.join(repoDir, 'images', category), { recursive: true });
    await fs.copyFile(tempFilePath, targetImagePath);
    console.log(`📁 Copied image to: images/${category}/${filename}`);

    // Read gallery-metadata.json
    const metadataPath = path.join(repoDir, 'gallery-metadata.json');
    const metadataContent = await fs.readFile(metadataPath, 'utf8');
    const metadata = JSON.parse(metadataContent);

    // Generate a title from the filename
    const title = generateTitle(filename);

    // Get the next ID
    const nextId = metadata.images.length > 0
      ? Math.max(...metadata.images.map(img => img.id)) + 1
      : 1;

    // Add new image to metadata
    const newImage = {
      id: nextId,
      filename: filename,
      category: category,
      imagePath: `images/${category}/${filename}`,
      contentFile: `content/${category}/${path.parse(filename).name}.json`,
      title: title,
      hasContent: false
    };

    metadata.images.push(newImage);
    metadata.totalImages = metadata.images.length;
    metadata.lastUpdated = new Date().toISOString();

    // Save updated metadata
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    console.log(`✅ Updated gallery-metadata.json (added ID ${nextId})`);

    // Generate educational content for all grade levels
    console.log('🤖 Generating educational content...');
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const totalCost = await generateContent(tempFilePath, filename, category, repoDir, anthropicKey);

    // Update metadata to mark content as generated
    const metadataUpdated = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
    const imageEntry = metadataUpdated.images.find(img => img.id === nextId);
    if (imageEntry) {
      imageEntry.hasContent = true;
      await fs.writeFile(metadataPath, JSON.stringify(metadataUpdated, null, 2));
      console.log('✅ Marked hasContent as true');
    }

    // Commit and push to GitHub
    console.log('📤 Committing to GitHub...');
    await repoGit.add('.');
    await repoGit.commit(`Add ${filename} with educational content

- Category: ${category}
- Generated content for all grade levels (K-5)
- Total cost: $${totalCost.toFixed(2)}

Co-Authored-By: SIAS Automation <mr.alexdjones@gmail.com>`);

    await repoGit.push('origin', 'main');
    console.log('✅ Pushed to GitHub');

    // Move processed file to "processed" folder in storage
    await bucket.file(filePath).move(`processed/${category}/${filename}`);
    console.log('📦 Moved to processed folder');

    // Clean up temp files
    await fs.rm(tempFilePath, { force: true });
    await fs.rm(repoDir, { recursive: true, force: true });

    // Final success log
    console.log('🎉 ============================================');
    console.log(`✅ Successfully processed: ${filename}`);
    console.log(`📂 Category: ${category}`);
    console.log(`💰 Total cost: $${totalCost.toFixed(2)}`);
    console.log('🎉 ============================================');

    return { success: true, filename, category, cost: totalCost };

  } catch (error) {
    console.error('❌ Error processing image:', error);

    // Try to move to failed folder
    try {
      await bucket.file(filePath).move(`failed/${new Date().toISOString()}_${path.basename(filePath)}`);
      console.log('📦 Moved to failed folder for investigation');
    } catch (moveError) {
      console.error('❌ Could not move failed file:', moveError);
    }

    throw error;
  }
});

/**
 * Generate a readable title from filename
 */
function generateTitle(filename) {
  // Remove extension
  let title = path.parse(filename).name;

  // Replace underscores and hyphens with spaces
  title = title.replace(/[_-]/g, ' ');

  // Capitalize first letter of each word
  title = title.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return title;
}

/**
 * Generate educational content for all grade levels using Anthropic API
 */
async function generateContent(imagePath, filename, category, repoDir, anthropicKey) {
  const anthropic = new Anthropic({ apiKey: anthropicKey });
  let totalCost = 0;

  // Read the image file as base64
  const imageBuffer = await fs.readFile(imagePath);
  const imageBase64 = imageBuffer.toString('base64');

  // Detect image format
  const metadata = await sharp(imagePath).metadata();
  const mediaType = `image/${metadata.format}`;

  const baseFilename = path.parse(filename).name;
  const contentDir = path.join(repoDir, 'content', category);
  await fs.mkdir(contentDir, { recursive: true });

  console.log(`📝 Generating content for ${GRADE_LEVELS.length} grade levels...`);

  // Store all grade-level content for the combined file
  const educationalContent = {};

  for (const grade of GRADE_LEVELS) {
    console.log(`   📝 Generating ${grade.name} content...`);

    const prompt = `You are an educational content creator for Science In A Snapshot, a platform for elementary school science education.

Create age-appropriate educational content for ${grade.name} students about this science image.

Requirements:
- Title: Short, engaging title (5-10 words)
- Description: ${grade.key === 'kindergarten' ? '2-3 simple sentences' : grade.key.includes('first') || grade.key.includes('second') ? '3-4 sentences' : '4-5 sentences'}
- Vocabulary appropriate for ${grade.name}
- Focus on observation and wonder
- Encourage curiosity about science

Return ONLY valid JSON in this exact format:
{
  "title": "engaging title here",
  "description": "educational description here",
  "gradeLevel": "${grade.name}"
}`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
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
              text: prompt
            }
          ]
        }]
      });

      // Calculate cost (approximate)
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      const cost = (inputTokens * 0.003 / 1000) + (outputTokens * 0.015 / 1000);
      totalCost += cost;

      // Parse the response
      const contentText = response.content[0].text;
      const content = JSON.parse(contentText);

      // Save individual grade-level file
      const contentFilePath = path.join(contentDir, `${baseFilename}-${grade.key}.json`);
      await fs.writeFile(contentFilePath, JSON.stringify(content, null, 2));

      // Store for combined file (using description as the content)
      educationalContent[grade.key.replace('-', '')] = content.description;

      console.log(`   ✅ ${grade.name} content saved`);

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`   ❌ Failed to generate ${grade.name} content:`, error.message);
      throw error;
    }
  }

  // Create the combined base JSON file (like bee.json structure)
  const combinedContent = {
    id: 0, // Will be set by metadata system
    title: baseFilename.charAt(0).toUpperCase() + baseFilename.slice(1).replace(/-/g, ' '),
    category: category,
    imageFile: filename,
    imagePath: `images/${category}/${filename}`,
    content: educationalContent.grade3 || educationalContent.kindergarten, // Default to grade3 or kindergarten
    generatedAt: new Date().toISOString(),
    educational: educationalContent
  };

  const baseContentFile = path.join(contentDir, `${baseFilename}.json`);
  await fs.writeFile(baseContentFile, JSON.stringify(combinedContent, null, 2));
  console.log(`   ✅ Base content file created: ${baseFilename}.json`);

  console.log(`✅ All content generated. Total cost: $${totalCost.toFixed(2)}`);
  return totalCost;
}

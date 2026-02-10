/**
 * Science In A Snapshot - Automated Image Processing
 * Updated: 2026-02-10 - Fixed YouTube videos in External Resources
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
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

// Load environment variables (for local testing)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

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
 * Step 1: Add uploaded files to queue (FAST)
 */
exports.queueImage = functions
  .storage.object().onFinalize(async (object) => {
  const filePath = object.name;
  const contentType = object.contentType;

  console.log(`📥 New file detected: ${filePath}`);

  if (!filePath.startsWith('uploads/') || !contentType?.startsWith('image/')) {
    return null;
  }

  try {
    const pathParts = filePath.split('/');
    if (pathParts.length !== 3) return null;

    const [, category, filename] = pathParts;
    const validCategories = ['life-science', 'earth-space-science', 'physical-science'];

    if (!validCategories.includes(category)) {
      console.error(`❌ Invalid category: ${category}`);
      return null;
    }

    // Add to queue
    await db.collection('imageQueue').add({
      filePath,
      category,
      filename,
      bucketName: object.bucket,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      attempts: 0
    });

    console.log(`✅ Queued: ${filename}`);
    return { success: true };

  } catch (error) {
    console.error('❌ Queue error:', error);
    const bucket = admin.storage().bucket(object.bucket);
    try {
      await bucket.file(filePath).move(`failed/${Date.now()}_${path.basename(filePath)}`);
    } catch (e) {}
    throw error;
  }
});

/**
 * Step 2: Process images from queue (one per minute)
 */
exports.processQueue = functions.runWith({
  memory: '1GB',
  timeoutSeconds: 540,
  secrets: ['ANTHROPIC_API_KEY', 'GITHUB_TOKEN']
}).pubsub.schedule('every 1 minutes').onRun(async () => {

  // Check if any item is currently being processed
  const processingCheck = await db.collection('imageQueue')
    .where('status', '==', 'processing')
    .limit(1)
    .get();

  if (!processingCheck.empty) {
    console.log('⏸️  Another image is being processed, waiting...');
    return null;
  }

  const snapshot = await db.collection('imageQueue')
    .where('status', '==', 'pending')
    .orderBy('createdAt', 'asc')
    .limit(1)
    .get();

  if (snapshot.empty) {
    console.log('✅ Queue is empty');
    return null;
  }

  const doc = snapshot.docs[0];
  const item = doc.data();

  console.log(`🚀 Processing: ${item.filename}`);

  await doc.ref.update({
    status: 'processing',
    startedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  try {
    await processImageFromQueue(item);

    await doc.ref.update({
      status: 'completed',
      completedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    setTimeout(() => doc.ref.delete(), 3600000);
    console.log(`✅ Completed: ${item.filename}`);

  } catch (error) {
    console.error(`❌ Failed: ${error.message}`);
    const attempts = (item.attempts || 0) + 1;

    if (attempts >= 3) {
      await doc.ref.update({ status: 'failed', error: error.message, attempts });
      const bucket = admin.storage().bucket();
      try {
        await bucket.file(item.filePath).move(`failed/${Date.now()}_${item.filename}`);
      } catch (e) {}
    } else {
      await doc.ref.update({ status: 'pending', attempts });
    }
  }

  return null;
});

/**
 * Main processing logic (extracted from original processImage)
 */
async function processImageFromQueue(queueItem) {
  const { filePath, category, filename, bucketName } = queueItem;
  const bucket = admin.storage().bucket(bucketName);

  console.log(`📸 Processing: ${filename}`);
  console.log(`📂 Category: ${category}`);

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
    const [fileMeta] = await bucket.file(filePath).getMetadata();
    const fileSize = parseInt(fileMeta.size);
    const maxSize = 2 * 1024 * 1024; // 2MB

    if (fileSize > maxSize) {
      console.error(`❌ File too large: ${(fileSize / 1024 / 1024).toFixed(2)}MB (max 2MB)`);
      throw new Error(`File too large: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);
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

    // Clean up any existing repo directory from previous runs
    try {
      await fs.rm(repoDir, { recursive: true, force: true });
      console.log('🧹 Cleaned up existing repo directory');
    } catch (cleanupError) {
      // Directory doesn't exist, that's fine
    }

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

    // Generate optimized image variants (thumbnail, WebP, placeholder)
    const nameNoExt = path.parse(filename).name;
    const thumbsDir = path.join(repoDir, 'images', category, 'thumbs');
    const webpDir = path.join(repoDir, 'images', category, 'webp');
    const placeholdersDir = path.join(repoDir, 'images', category, 'placeholders');
    await fs.mkdir(thumbsDir, { recursive: true });
    await fs.mkdir(webpDir, { recursive: true });
    await fs.mkdir(placeholdersDir, { recursive: true });

    try {
      // Generate 600px thumbnail
      await sharp(targetImagePath).resize({ height: 600 }).toFile(path.join(thumbsDir, filename));
      // Generate WebP from thumbnail
      await sharp(path.join(thumbsDir, filename)).webp({ quality: 80 }).toFile(path.join(webpDir, `${nameNoExt}.webp`));
      // Generate 20px blur-up placeholder
      await sharp(targetImagePath).resize({ width: 20 }).toFile(path.join(placeholdersDir, filename));
      console.log(`🖼️  Generated optimized variants (thumb, webp, placeholder)`);
    } catch (optimizeError) {
      console.warn(`⚠️  Image optimization failed (non-blocking): ${optimizeError.message}`);
    }

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
      thumbPath: `images/${category}/thumbs/${filename}`,
      webpPath: `images/${category}/webp/${nameNoExt}.webp`,
      placeholderPath: `images/${category}/placeholders/${filename}`,
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
    const { totalCost: contentCost, imageBase64, mediaType, educationalContent } = await generateContent(tempFilePath, filename, category, repoDir, anthropicKey);
    let totalCost = contentCost;

    // Extract NGSS standards from educational content
    console.log('🎓 Extracting NGSS standards...');
    const ngssStandards = extractAllGradeLevelStandards(educationalContent);
    const totalStandards = Object.values(ngssStandards).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`✅ Extracted ${totalStandards} NGSS standards across all grade levels`);

    // Update metadata with content flag and NGSS standards
    const metadataUpdated = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
    const imageEntry = metadataUpdated.images.find(img => img.id === nextId);
    if (imageEntry) {
      imageEntry.hasContent = true;
      imageEntry.ngssStandards = ngssStandards;
      await fs.writeFile(metadataPath, JSON.stringify(metadataUpdated, null, 2));
      console.log('✅ Marked hasContent as true and added NGSS standards to metadata');
    }

    // Generate search keywords
    console.log('🏷️  Generating search keywords...');
    const keywordCost = await generateKeywords(filename, category, metadataPath, nextId, anthropicKey, imageBase64, mediaType);
    totalCost += keywordCost;

    // Generate lesson PDFs for all 6 grade levels
    console.log('📄 Generating lesson PDFs...');
    const { generatePDF } = require('./pdf-generator');
    const logoPath = path.join(repoDir, 'sias_logo.png');
    let pdfCount = 0;

    for (const grade of GRADE_LEVELS) {
      try {
        const contentPath = path.join(repoDir, 'content', category, `${nameNoExt}-${grade.key}.json`);
        const contentData = JSON.parse(await fs.readFile(contentPath, 'utf8'));

        const pdfBuffer = await generatePDF({
          title: generateTitle(filename),
          category,
          gradeLevel: grade.key,
          markdownContent: contentData.content,
          imagePath: targetImagePath,
          logoPath
        });

        const pdfDir = path.join(repoDir, 'pdfs', category);
        await fs.mkdir(pdfDir, { recursive: true });
        await fs.writeFile(path.join(pdfDir, `${nameNoExt}-${grade.key}.pdf`), pdfBuffer);
        pdfCount++;
        console.log(`   ✅ ${grade.name} PDF generated`);
      } catch (pdfErr) {
        console.warn(`   ⚠️ ${grade.name} PDF failed (non-blocking): ${pdfErr.message}`);
      }
    }
    console.log(`✅ Generated ${pdfCount} lesson PDFs`);

    // Generate Engineering Design Process content and PDF
    console.log('🔧 Generating Engineering Design Process content...');
    try {
      const edpCost = await generateEDPContentAndPDF(
        anthropicKey, imageBase64, mediaType, filename, category, repoDir, targetImagePath, logoPath, nameNoExt
      );
      totalCost += edpCost;
      console.log(`✅ EDP content and PDF generated (cost: $${edpCost.toFixed(4)})`);
    } catch (edpErr) {
      console.warn(`⚠️ EDP generation failed (non-blocking): ${edpErr.message}`);
    }

    // Commit and push to GitHub
    console.log('📤 Committing to GitHub...');
    await repoGit.add('.');
    await repoGit.commit(`Add ${filename} with educational content, hotspots, keywords, NGSS standards, lesson PDFs, and EDP

- Category: ${category}
- Generated content for all grade levels (K-5)
- Generated interactive hotspots (3-4 per image)
- Generated search keywords
- Extracted ${totalStandards} NGSS standards for gallery badges
- Generated ${pdfCount} lesson guide PDFs
- Generated engineering design process challenge PDF
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
}

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
 * Generate interactive hotspots for an image using Anthropic API (Claude Haiku 4.5)
 */
async function generateHotspots(imagePath, filename, category, repoDir, anthropicKey, imageBase64, mediaType, ngssStandards = []) {
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  console.log(`   🎯 Calling Claude Haiku 4.5 for hotspot generation...`);

  // Format category for display (e.g., "life-science" -> "Life Science")
  const categoryDisplay = category.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  // Build NGSS context if standards are available
  const ngssContext = ngssStandards.length > 0
    ? `\nThe following NGSS standards have been identified for this image: ${ngssStandards.join(', ')}. Each hotspot fact should connect to one of these standards or their underlying disciplinary core ideas.`
    : '';

  const prompt = `Analyze this ${categoryDisplay} image and create interactive hotspots for elementary students (grades K-5).

This image belongs to the "${categoryDisplay}" category. Focus your hotspots on ${categoryDisplay.toLowerCase()} concepts — for example, ${category === 'life-science' ? 'living organisms, habitats, body structures, life cycles, and ecosystems' : category === 'earth-space-science' ? 'rocks, weather, water, landforms, and space' : 'forces, motion, energy, matter, and physical properties'}.
${ngssContext}

Generate 3-4 hotspots that highlight scientifically interesting features in the image.

For each hotspot, provide:
1. x and y coordinates as percentages (e.g., "35%" for x-axis, "45%" for y-axis)
2. A short label (2-4 words) describing what the hotspot points to
3. An engaging, educational fact (2-3 sentences) that connects to the NGSS standards and disciplinary core ideas listed above. Write at a level appropriate for elementary students.
4. A science vocabulary word relevant to the hotspot, with a kid-friendly definition. Introduce it naturally, like: "This is called **pollination** — that's when pollen is carried from one flower to another so plants can make seeds."

Return ONLY valid JSON in this exact format:
{
  "hotspots": [
    {
      "id": 1,
      "x": "30%",
      "y": "40%",
      "label": "Feature Name",
      "fact": "Educational fact here that ties to NGSS standards. Should be 2-3 sentences and include the vocabulary word naturally.",
      "vocabulary": {
        "term": "Science Word",
        "definition": "Kid-friendly definition of the word."
      }
    }
  ]
}

Be precise with coordinates - think about where a student would click to learn about that feature.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
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
            text: prompt
          }
        ]
      }]
    });

    // Calculate cost (Haiku 4.5 pricing: $1/MTok input, $5/MTok output)
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const cost = (inputTokens * 0.001 / 1000) + (outputTokens * 0.005 / 1000);

    // Parse the response
    let responseText = response.content[0].text;
    let hotspotData;
    
    try {
      hotspotData = JSON.parse(responseText);
    } catch (parseError) {
      // Try to extract JSON if wrapped in markdown or other text
      const start = responseText.indexOf('{');
      const end = responseText.lastIndexOf('}') + 1;
      if (start !== -1 && end > start) {
        hotspotData = JSON.parse(responseText.substring(start, end));
      } else {
        throw new Error('Could not parse JSON from response');
      }
    }

    // Validate hotspot data
    if (!hotspotData.hotspots || hotspotData.hotspots.length < 3) {
      throw new Error('Invalid hotspot data structure');
    }

    // Save hotspot file
    const baseFilename = path.parse(filename).name;
    const hotspotDir = path.join(repoDir, 'hotspots', category);
    await fs.mkdir(hotspotDir, { recursive: true });
    
    const hotspotFilePath = path.join(hotspotDir, `${baseFilename}.json`);
    await fs.writeFile(hotspotFilePath, JSON.stringify(hotspotData, null, 2));
    
    const hotspotCount = hotspotData.hotspots.length;
    console.log(`   ✅ Generated ${hotspotCount} hotspots (cost: $${cost.toFixed(4)})`);
    
    return cost;

  } catch (error) {
    console.error(`   ❌ Failed to generate hotspots:`, error.message);
    // Don't throw - we want content generation to succeed even if hotspots fail
    return 0;
  }
}

/**
 * Generate search keywords for an image using Anthropic API (Claude Haiku 4.5)
 */
async function generateKeywords(filename, category, metadataPath, imageId, anthropicKey, imageBase64, mediaType) {
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  console.log(`   🏷️  Calling Claude Haiku 4.5 for keyword generation...`);

  const prompt = `Analyze this science image and generate search keywords for an elementary science education app.

Generate 3-6 keywords that a K-5 teacher would use to find this image. Keywords should be:
- NGSS-aligned where possible
- A mix of concrete observable terms (what you can see) and broader concept terms
- Single-word or two-word phrases only
- All lowercase
- Relevant to the science category: ${category}

Return ONLY a valid JSON array of strings. No other text.

Example output:
["germination", "plant lifecycle", "seed", "growth", "soil"]`;

  try {
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
            text: prompt
          }
        ]
      }]
    });

    // Calculate cost (Haiku 4.5 pricing: $1/MTok input, $5/MTok output)
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const cost = (inputTokens * 0.001 / 1000) + (outputTokens * 0.005 / 1000);

    // Parse the response
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

    // Validate keywords
    if (!Array.isArray(keywords) || keywords.length < 3) {
      throw new Error('Invalid keywords: expected array of 3+ strings');
    }

    // Normalize: lowercase, trim, filter empties
    keywords = keywords.map(k => String(k).toLowerCase().trim()).filter(k => k.length > 0);

    // Write keywords into gallery-metadata.json
    const metadataContent = await fs.readFile(metadataPath, 'utf8');
    const metadata = JSON.parse(metadataContent);
    const imageEntry = metadata.images.find(img => img.id === imageId);
    if (imageEntry) {
      imageEntry.keywords = keywords;
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    }

    console.log(`   ✅ Generated ${keywords.length} keywords: ${keywords.join(', ')} (cost: $${cost.toFixed(4)})`);

    return cost;

  } catch (error) {
    console.error(`   ❌ Failed to generate keywords:`, error.message);
    // Don't throw - we want the rest of the pipeline to succeed even if keywords fail
    return 0;
  }
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

    const prompt = `You are an expert K-5 Science Instructional Coach and NGSS Curriculum Specialist.

Your goal is to analyze the provided image to help a teacher create a rigorous, age-appropriate science lesson for a **${grade.name}** class.

Category: ${category}
Image: ${filename}

### GUIDELINES
- **Tone:** Professional, encouraging, and scientifically accurate
- **Audience:** The teacher (not the student)
- **Format:** Strict Markdown. Start directly with the first section header
- **Safety:** Ensure all suggested activities are safe for elementary students

### REQUIRED OUTPUT SECTIONS
Generate ONLY the sections below. Use Level 2 Markdown headers (##) with emojis.

## 📸 Photo Description
Describe the key scientific elements visible in 2-3 sentences at ${grade.name} reading level. Focus on observable features.

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

## 📖 Vocabulary
Provide a bulleted list of 3-6 tier 2 or tier 3 science words.
Format strictly as: * **Word:** Kid-friendly definition (1 sentence)

## 🌡️ Extension Activities
Provide 2-3 hands-on extension activities appropriate for ${grade.name} students.

## 🔗 Cross-Curricular Ideas
Provide 3-4 ideas for connecting the science in this photo to other subjects like Math, ELA, Social Studies, or Art for a ${grade.name} classroom.

## 🚀 STEM Career Connection
List and briefly describe 2-3 STEM careers that relate to the science shown in this photo. Describe the job simply for a ${grade.name} student. For each career, also provide an estimated average annual salary in USD.

## 📚 External Resources
Provide ONLY the following real, existing resources:
- **Children's Books:** Title by Author (2-3 books)

IMPORTANT: Do NOT include YouTube videos, websites, or any other external resources. Only provide children's books.

---

Remember:
- Use Markdown formatting throughout
- Include the special XML tags for pedagogical tips and UDL strategies
- Use the [[NGSS:...]] format for standards
- Keep language at ${grade.name} level where appropriate
- Be scientifically accurate and engaging`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 5000,
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

      // Calculate cost (Haiku 4.5 pricing: $1/MTok input, $5/MTok output)
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      const cost = (inputTokens * 0.001 / 1000) + (outputTokens * 0.005 / 1000);
      totalCost += cost;

      // Get the markdown content directly
      const markdownContent = response.content[0].text;

      // Create the full structure for individual grade-level file
      const gradeFileContent = {
        id: 0, // Will be set by metadata
        title: baseFilename.charAt(0).toUpperCase() + baseFilename.slice(1).replace(/-/g, ' '),
        category: category,
        imageFile: filename,
        imagePath: `images/${category}/${filename}`,
        gradeLevel: grade.name,
        content: markdownContent, // Store the full markdown content
        generatedAt: new Date().toISOString()
      };

      // Save individual grade-level file
      const contentFilePath = path.join(contentDir, `${baseFilename}-${grade.key}.json`);
      await fs.writeFile(contentFilePath, JSON.stringify(gradeFileContent, null, 2));

      // Store for combined file (using markdown as the content)
      educationalContent[grade.key.replace('-', '')] = markdownContent;

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
  
  // Extract NGSS standards from educational content for hotspot context
  const hotspotNGSS = extractAllGradeLevelStandards(educationalContent);
  const hotspotStandardsList = [...new Set(Object.values(hotspotNGSS).flat())];

  // Generate hotspots
  console.log(`\n🎯 Generating interactive hotspots...`);
  const hotspotCost = await generateHotspots(imagePath, filename, category, repoDir, anthropicKey, imageBase64, mediaType, hotspotStandardsList);
  totalCost += hotspotCost;
  
  console.log(`✅ Total cost (content + hotspots): $${totalCost.toFixed(2)}`);
  return { totalCost, imageBase64, mediaType, educationalContent };
}

// ============================================================
// Engineering Design Process Content + PDF Generation
// ============================================================

const EDP_SYSTEM_PROMPT = `You are an NGSS Engineering Design Process (EDP) Coach. Teachers upload any photograph (classroom, nature, objects, etc.). Your job: transform it into a grade-appropriate engineering challenge based on what is visible in the image.

Core Rules:
1. Visible elements only - List only what is directly observable in the photo. Do not invent objects, materials, or creatures that are not shown.
2. Reasonable inferences allowed - You may make logical connections from visible elements. Label these clearly as inferences, separate from direct observations.
3. Invent a task - If the photo shows no engineering activity, create a realistic EDP challenge inspired by visible elements and reasonable inferences.
4. Grade-adapt:
   - K-2: Use concrete nouns, simple verbs, no technical terms. Frame as playful building tasks.
   - 3-5: Include specific constraints and criteria. Use measurable success conditions.
5. No false context - Never reference students, classrooms, or ongoing projects unless the photo clearly shows them.
6. Ambiguity rule - If fewer than 3 distinct elements are visible, offer 2 task options ranked by plausibility.

Never invent elements not visible in the photo. Never use engineering jargon for K-2 tasks. Never skip any section.
Tone: Practical, coach-like, jargon-free.`;

const EDP_USER_PROMPT_TEMPLATE = `Analyze this science education photo and generate an engineering design process challenge.

Category: {category}
Photo: {filename}

Generate ALL of the following sections using ### headers. No exceptions.

### Visible Elements in Photo
List only what is directly observable (3-5 bullet points).

### Reasonable Inferences
List 1-3 logical inferences drawn from visible elements. Label each with the element it stems from.

### Engineering Task
Provide both grade bands:
- **K-2**: A simple, concrete building or design challenge using plain language.
- **3-5**: A constraint-based engineering challenge with measurable criteria.

### EDP Phase Targeted
Pick ONE phase the task would start with:
- **Ask / Define Problem** - Best for nature or real-world photos where a need can be identified.
- **Imagine / Plan** - Best when the photo suggests a solution direction already.
- **Create / Test** - Best when materials or structures are visible and can be iterated on.
Briefly explain why this phase fits.

### Suggested Materials
List 3-5 simple, classroom-available materials a teacher could use for this activity.

### Estimated Time
Provide a time range for the activity (e.g., "30-45 minutes" or "Two 30-minute sessions").

### Why This Works for Teachers
One sentence connecting the task to a specific NGSS ETS1 standard.`;

/**
 * Generate EDP content via Claude API and render to PDF
 * Called during the image processing pipeline after lesson PDFs are generated.
 */
async function generateEDPContentAndPDF(anthropicKey, imageBase64, mediaType, filename, category, repoDir, targetImagePath, logoPath, nameNoExt) {
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  const userPrompt = EDP_USER_PROMPT_TEMPLATE
    .replace('{category}', category)
    .replace('{filename}', filename);

  console.log('   🔧 Calling Claude Haiku 4.5 for EDP content...');

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: EDP_SYSTEM_PROMPT,
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
          text: userPrompt
        }
      ]
    }]
  });

  // Calculate cost (Haiku 4.5: $1/MTok input, $5/MTok output)
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cost = (inputTokens * 0.001 / 1000) + (outputTokens * 0.005 / 1000);

  const markdownContent = response.content[0].text;

  // Save EDP content JSON
  const edpData = {
    title: nameNoExt.charAt(0).toUpperCase() + nameNoExt.slice(1).replace(/-/g, ' '),
    category,
    imageFile: filename,
    imagePath: `images/${category}/${filename}`,
    content: markdownContent,
    inputTokens,
    outputTokens,
    cost,
    generatedAt: new Date().toISOString()
  };

  const contentDir = path.join(repoDir, 'content', category);
  await fs.mkdir(contentDir, { recursive: true });
  await fs.writeFile(
    path.join(contentDir, `${nameNoExt}-edp.json`),
    JSON.stringify(edpData, null, 2)
  );
  console.log(`   ✅ EDP content saved: ${nameNoExt}-edp.json`);

  // Generate EDP PDF
  const { generateEDPpdf } = require('./edp-pdf-generator');

  const pdfBuffer = await generateEDPpdf({
    title: edpData.title,
    category,
    markdownContent,
    imagePath: targetImagePath,
    logoPath
  });

  const pdfDir = path.join(repoDir, 'pdfs', category);
  await fs.mkdir(pdfDir, { recursive: true });
  await fs.writeFile(path.join(pdfDir, `${nameNoExt}-edp.pdf`), pdfBuffer);
  console.log(`   ✅ EDP PDF saved: ${nameNoExt}-edp.pdf`);

  return cost;
}

// ============================================================
// Comment Email Notification
// ============================================================

/**
 * Send email notification when a new comment is created
 * Triggers on Firestore document creation in the 'comments' collection
 */
exports.onCommentCreated = functions.firestore
  .document('comments/{commentId}')
  .onCreate(async (snapshot, context) => {
    const comment = snapshot.data();
    const commentId = context.params.commentId;

    console.log(`💬 New comment detected: ${commentId}`);

    // Get SMTP credentials from environment variables
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;

    if (!gmailUser || !gmailPass) {
      console.error('❌ Gmail credentials not configured.');
      console.error('Add GMAIL_USER and GMAIL_APP_PASSWORD to functions/.env');
      return null;
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    });

    // Format timestamp
    let timeStr = 'just now';
    if (comment.timestamp && comment.timestamp.toDate) {
      timeStr = comment.timestamp.toDate().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    }

    // Build email
    const mailOptions = {
      from: `"SIAS Comments" <${gmailUser}>`,
      to: 'mr.alexdjones@gmail.com',
      subject: `💬 New Comment on SIAS Photo #${comment.imageId}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 12px 12px 0 0;">
            <h2 style="color: white; margin: 0; font-size: 20px;">💬 New Comment on SIAS</h2>
          </div>
          <div style="background: #f8f9fa; padding: 24px; border: 1px solid #e9ecef; border-top: none; border-radius: 0 0 12px 12px;">
            <div style="background: white; padding: 16px; border-radius: 8px; border: 1px solid #e9ecef; margin-bottom: 16px;">
              <div style="display: flex; align-items: center; margin-bottom: 12px;">
                ${comment.photoURL
                  ? `<img src="${comment.photoURL}" alt="" style="width: 40px; height: 40px; border-radius: 50%; margin-right: 12px;">`
                  : `<div style="width: 40px; height: 40px; border-radius: 50%; background: #667eea; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 12px;">${(comment.displayName || '?')[0].toUpperCase()}</div>`
                }
                <div>
                  <strong style="color: #333; font-size: 15px;">${comment.displayName || 'User'}</strong>
                  <div style="color: #888; font-size: 13px;">${timeStr}</div>
                </div>
              </div>
              <p style="color: #444; font-size: 15px; line-height: 1.5; margin: 0; padding: 12px; background: #f8f9fa; border-radius: 6px;">
                "${comment.text}"
              </p>
            </div>
            <div style="color: #888; font-size: 13px;">
              <p style="margin: 4px 0;">📸 Photo ID: ${comment.imageId}</p>
              <p style="margin: 4px 0;">🔑 Comment ID: ${commentId}</p>
            </div>
            <hr style="border: none; border-top: 1px solid #e9ecef; margin: 16px 0;">
            <p style="color: #aaa; font-size: 12px; margin: 0; text-align: center;">
              Science In A Snapshot — Comment Notification
            </p>
          </div>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`✅ Email notification sent for comment: ${commentId}`);
      return null;
    } catch (error) {
      console.error('❌ Error sending email notification:', error);
      return null;
    }
  });

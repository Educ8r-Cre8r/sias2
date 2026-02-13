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

// Storage bucket name for gallery assets (images, PDFs, 5E lessons)
const GALLERY_BUCKET = 'sias-8178a.firebasestorage.app';

/**
 * Upload a local file to Firebase Storage with proper metadata.
 * @param {string} localPath - Absolute path to the local file
 * @param {string} storagePath - Destination path in Storage (e.g. 'images/life-science/bee.jpg')
 * @param {string} contentType - MIME type (e.g. 'image/jpeg', 'application/pdf')
 */
async function uploadToGalleryStorage(localPath, storagePath, contentType) {
  const bucket = admin.storage().bucket(GALLERY_BUCKET);
  await bucket.upload(localPath, {
    destination: storagePath,
    metadata: {
      contentType,
      cacheControl: 'public, max-age=31536000',
    },
  });
  console.log(`   ☁️  Uploaded to Storage: ${storagePath}`);
}

/**
 * Upload a buffer to Firebase Storage with proper metadata.
 * @param {Buffer} buffer - File content
 * @param {string} storagePath - Destination path in Storage
 * @param {string} contentType - MIME type
 */
async function uploadBufferToGalleryStorage(buffer, storagePath, contentType) {
  const bucket = admin.storage().bucket(GALLERY_BUCKET);
  await bucket.file(storagePath).save(buffer, {
    metadata: {
      contentType,
      cacheControl: 'public, max-age=31536000',
    },
  });
  console.log(`   ☁️  Uploaded to Storage: ${storagePath}`);
}

/**
 * Delete a file from Firebase Storage (gallery bucket). Silently ignores missing files.
 * @param {string} storagePath - Path in Storage to delete
 */
async function deleteFromGalleryStorage(storagePath) {
  const bucket = admin.storage().bucket(GALLERY_BUCKET);
  try {
    await bucket.file(storagePath).delete();
    console.log(`   🗑️  Deleted from Storage: ${storagePath}`);
  } catch (e) {
    console.log(`   ⏭️  Not in Storage (skip): ${storagePath}`);
  }
}

// Grade levels for content generation
const GRADE_LEVELS = [
  { key: 'kindergarten', name: 'Kindergarten', ngssGrade: 'K' },
  { key: 'first-grade', name: 'First Grade', ngssGrade: '1' },
  { key: 'second-grade', name: 'Second Grade', ngssGrade: '2' },
  { key: 'third-grade', name: 'Third Grade', ngssGrade: '3' },
  { key: 'fourth-grade', name: 'Fourth Grade', ngssGrade: '4' },
  { key: 'fifth-grade', name: 'Fifth Grade', ngssGrade: '5' }
];

// Category -> NGSS domain code prefix mapping
const CATEGORY_TO_NGSS_DOMAIN = {
  'physical-science': 'PS',
  'life-science': 'LS',
  'earth-space-science': 'ESS'
};

// Complete K-5 NGSS Performance Expectations with official statements
// Source: https://www.nextgenscience.org/search-standards (verified Feb 2026)
const NGSS_PE_STANDARDS = {
  // ── Physical Science (29 standards) ──
  'K-PS2-1': 'Plan and conduct an investigation to compare the effects of different strengths or different directions of pushes and pulls on the motion of an object.',
  'K-PS2-2': 'Analyze data to determine if a design solution works as intended to change the speed or direction of an object with a push or a pull.',
  'K-PS3-1': 'Make observations to determine the effect of sunlight on Earth\'s surface.',
  'K-PS3-2': 'Use tools and materials to design and build a structure that will reduce the warming effect of sunlight on an area.',
  '1-PS4-1': 'Plan and conduct investigations to provide evidence that vibrating materials can make sound and that sound can make materials vibrate.',
  '1-PS4-2': 'Make observations to construct an evidence-based account that objects in darkness can be seen only when illuminated.',
  '1-PS4-3': 'Plan and conduct investigations to determine the effect of placing objects made with different materials in the path of a beam of light.',
  '1-PS4-4': 'Use tools and materials to design and build a device that uses light or sound to solve the problem of communicating over a distance.',
  '2-PS1-1': 'Plan and conduct an investigation to describe and classify different kinds of materials by their observable properties.',
  '2-PS1-2': 'Analyze data obtained from testing different materials to determine which materials have the properties that are best suited for an intended purpose.',
  '2-PS1-3': 'Make observations to construct an evidence-based account of how an object made of a small set of pieces can be disassembled and made into a new object.',
  '2-PS1-4': 'Construct an argument with evidence that some changes caused by heating or cooling can be reversed and some cannot.',
  '3-PS2-1': 'Plan and conduct an investigation to provide evidence of the effects of balanced and unbalanced forces on the motion of an object.',
  '3-PS2-2': 'Make observations and/or measurements of an object\'s motion to provide evidence that a pattern can be used to predict future motion.',
  '3-PS2-3': 'Ask questions to determine cause and effect relationships of electric or magnetic interactions between two objects not in contact with each other.',
  '3-PS2-4': 'Define a simple design problem that can be solved by applying scientific ideas about magnets.',
  '4-PS3-1': 'Use evidence to construct an explanation relating the speed of an object to the energy of that object.',
  '4-PS3-2': 'Make observations to provide evidence that energy can be transferred from place to place by sound, light, heat, and electric currents.',
  '4-PS3-3': 'Ask questions and predict outcomes about the changes in energy that occur when objects collide.',
  '4-PS3-4': 'Apply scientific ideas to design, test, and refine a device that converts energy from one form to another.',
  '4-PS4-1': 'Develop a model of waves to describe patterns in terms of amplitude and wavelength and that waves can cause objects to move.',
  '4-PS4-2': 'Develop a model to describe that light reflecting from objects and entering the eye allows objects to be seen.',
  '4-PS4-3': 'Generate and compare multiple solutions that use patterns to transfer information.',
  '5-PS1-1': 'Develop a model to describe that matter is made of particles too small to be seen.',
  '5-PS1-2': 'Measure and graph quantities to provide evidence that regardless of the type of change that occurs when heating, cooling, or mixing substances, the total weight of matter is conserved.',
  '5-PS1-3': 'Make observations and measurements to identify materials based on their properties.',
  '5-PS1-4': 'Conduct an investigation to determine whether the mixing of two or more substances results in new substances.',
  '5-PS2-1': 'Support an argument that the gravitational force exerted by Earth on objects is directed down.',
  '5-PS3-1': 'Use models to describe that energy in animals\' food (used for body repair, growth, motion, and to maintain body warmth) was once energy from the sun.',
  // ── Life Science (19 standards) ──
  'K-LS1-1': 'Use observations to describe patterns of what plants and animals (including humans) need to survive.',
  '1-LS1-1': 'Use materials to design a solution to a human problem by mimicking how plants and/or animals use their external parts to help them survive, grow, and meet their needs.',
  '1-LS1-2': 'Read texts and use media to determine patterns in behavior of parents and offspring that help offspring survive.',
  '1-LS3-1': 'Make observations to construct an evidence-based account that young plants and animals are like, but not exactly like, their parents.',
  '2-LS2-1': 'Plan and conduct an investigation to determine if plants need sunlight and water to grow.',
  '2-LS2-2': 'Develop a simple model that mimics the function of an animal in dispersing seeds or pollinating plants.',
  '2-LS4-1': 'Make observations of plants and animals to compare the diversity of life in different habitats.',
  '3-LS1-1': 'Develop models to describe that organisms have unique and diverse life cycles but all have in common birth, growth, reproduction, and death.',
  '3-LS2-1': 'Construct an argument that some animals form groups that help members survive.',
  '3-LS3-1': 'Analyze and interpret data to provide evidence that plants and animals have traits inherited from parents and that variation of these traits exists in a group of similar organisms.',
  '3-LS3-2': 'Use evidence to support the explanation that traits can be influenced by the environment.',
  '3-LS4-1': 'Analyze and interpret data from fossils to provide evidence of the organisms and the environments in which they lived long ago.',
  '3-LS4-2': 'Use evidence to construct an explanation for how the variations in characteristics among individuals of the same species may provide advantages in surviving, finding mates, and reproducing.',
  '3-LS4-3': 'Construct an argument with evidence that in a particular habitat some organisms can survive well, some survive less well, and some cannot survive at all.',
  '3-LS4-4': 'Make a claim about the merit of a solution to a problem caused when the environment changes and the types of plants and animals that live there may change.',
  '4-LS1-1': 'Construct an argument that plants and animals have internal and external structures that function to support survival, growth, behavior, and reproduction.',
  '4-LS1-2': 'Use a model to describe that animals receive different types of information through their senses, process the information in their brain, and respond to the information in different ways.',
  '5-LS1-1': 'Support an argument that plants get the materials they need for growth chiefly from air and water.',
  '5-LS2-1': 'Develop a model to describe the movement of matter among plants, animals, decomposers, and the environment.',
  // ── Earth & Space Science (24 standards) ──
  'K-ESS2-1': 'Use and share observations of local weather conditions to describe patterns over time.',
  'K-ESS2-2': 'Construct an argument supported by evidence for how plants and animals (including humans) can change the environment to meet their needs.',
  'K-ESS3-1': 'Use a model to represent the relationship between the needs of different plants and animals (including humans) and the places they live.',
  'K-ESS3-2': 'Ask questions to obtain information about the purpose of weather forecasting to prepare for, and respond to, severe weather.',
  'K-ESS3-3': 'Communicate solutions that will reduce the impact of humans on the land, water, air, and/or other living things in the local environment.',
  '1-ESS1-1': 'Use observations of the sun, moon, and stars to describe patterns that can be predicted.',
  '1-ESS1-2': 'Make observations at different times of year to relate the amount of daylight to the time of year.',
  '2-ESS1-1': 'Use information from several sources to provide evidence that Earth events can occur quickly or slowly.',
  '2-ESS2-1': 'Compare multiple solutions designed to slow or prevent wind or water from changing the shape of the land.',
  '2-ESS2-2': 'Develop a model to represent the shapes and kinds of land and bodies of water in an area.',
  '2-ESS2-3': 'Obtain information to identify where water is found on Earth and that it can be solid or liquid.',
  '3-ESS2-1': 'Represent data in tables and graphical displays to describe typical weather conditions expected during a particular season.',
  '3-ESS2-2': 'Obtain and combine information to describe climates in different regions of the world.',
  '3-ESS3-1': 'Make a claim about the merit of a design solution that reduces the impacts of a weather-related hazard.',
  '4-ESS1-1': 'Identify evidence from patterns in rock formations and fossils in rock layers to support an explanation for changes in a landscape over time.',
  '4-ESS2-1': 'Make observations and/or measurements to provide evidence of the effects of weathering or the rate of erosion by water, ice, wind, or vegetation.',
  '4-ESS2-2': 'Analyze and interpret data from maps to describe patterns of Earth\'s features.',
  '4-ESS3-1': 'Obtain and combine information to describe that energy and fuels are derived from natural resources and their uses affect the environment.',
  '4-ESS3-2': 'Generate and compare multiple solutions to reduce the impacts of natural Earth processes on humans.',
  '5-ESS1-1': 'Support an argument that differences in the apparent brightness of the sun compared to other stars is due to their relative distances from Earth.',
  '5-ESS1-2': 'Represent data in graphical displays to reveal patterns of daily changes in length and direction of shadows, day and night, and the seasonal appearance of some stars in the night sky.',
  '5-ESS2-1': 'Develop a model using an example to describe ways the geosphere, biosphere, hydrosphere, and/or atmosphere interact.',
  '5-ESS2-2': 'Describe and graph the amounts and percentages of water and fresh water in various reservoirs to provide evidence about the distribution of water on Earth.',
  '5-ESS3-1': 'Obtain and combine information about ways individual communities use science ideas to protect the Earth\'s resources and environment.'
};

/**
 * Get NGSS PE standards filtered by category domain and grade level
 */
function getFilteredNGSSStandards(category, ngssGrade) {
  const domainPrefix = CATEGORY_TO_NGSS_DOMAIN[category];
  if (!domainPrefix) return {};

  const filtered = {};
  for (const [code, statement] of Object.entries(NGSS_PE_STANDARDS)) {
    // Extract domain letters from code (e.g., 'PS' from '3-PS2-1', 'ESS' from '2-ESS1-1')
    const domainMatch = code.match(/-([A-Z]+)\d/);
    if (!domainMatch) continue;
    const codeDomain = domainMatch[1];

    // Only include standards matching the category domain
    if (codeDomain !== domainPrefix) continue;

    // Check if grade level matches
    const codeGrade = code.split('-')[0];
    if (codeGrade === ngssGrade) {
      filtered[code] = statement;
    }
  }

  return filtered;
}

/**
 * Build ngss-index.json from gallery-metadata.json.
 * PE codes come from each image's ngssStandards field (all grade levels).
 * DCI / CCC codes come from content-file markdown (special [[NGSS:...]] tags).
 * This keeps the NGSS coverage map on the admin dashboard up-to-date
 * automatically after each image is processed.
 */
async function buildNgssIndex(repoDir) {
  const metadataContent = await fs.readFile(path.join(repoDir, 'gallery-metadata.json'), 'utf8');
  const galleryData = JSON.parse(metadataContent);

  const ngssIndex = {
    performanceExpectations: {},
    disciplinaryCoreIdeas: {},
    crosscuttingConcepts: {},
    allStandards: []
  };

  // Regex to distinguish PE codes (K-PS2-1) from DCI codes (K-PS2.A)
  const pePattern = /^[K1-5]-[A-Z]{2,4}\d?-\d+$/;

  let processed = 0;

  for (const image of galleryData.images) {
    // ── PEs: read from metadata ngssStandards (all grade levels) ──
    if (image.ngssStandards && typeof image.ngssStandards === 'object') {
      const peSet = new Set();
      for (const gradeStandards of Object.values(image.ngssStandards)) {
        if (!Array.isArray(gradeStandards)) continue;
        for (const code of gradeStandards) {
          if (pePattern.test(code)) {
            peSet.add(code);
          }
        }
      }
      peSet.forEach(pe => {
        if (!ngssIndex.performanceExpectations[pe]) ngssIndex.performanceExpectations[pe] = [];
        if (!ngssIndex.performanceExpectations[pe].includes(image.id)) {
          ngssIndex.performanceExpectations[pe].push(image.id);
        }
      });
    }

    // ── DCI & CCC: read from content-file markdown ──
    const baseFile = image.contentFile.replace('.json', '');
    const gradeFile = path.join(repoDir, baseFile + '-third-grade.json');
    const fallbackFile = path.join(repoDir, image.contentFile);

    let content = null;
    try {
      try {
        content = JSON.parse(await fs.readFile(gradeFile, 'utf8'));
      } catch {
        content = JSON.parse(await fs.readFile(fallbackFile, 'utf8'));
      }
    } catch {
      // No content file — PEs still counted from metadata above
    }

    if (content && content.content) {
      const md = content.content;

      // Extract DCI codes (e.g., [[NGSS:DCI:3-LS4.C]])
      const dciRegex = /\[\[NGSS:DCI:([^\]]+)\]\]/g;
      let dciMatch;
      while ((dciMatch = dciRegex.exec(md)) !== null) {
        const code = dciMatch[1];
        if (!ngssIndex.disciplinaryCoreIdeas[code]) ngssIndex.disciplinaryCoreIdeas[code] = [];
        if (!ngssIndex.disciplinaryCoreIdeas[code].includes(image.id)) {
          ngssIndex.disciplinaryCoreIdeas[code].push(image.id);
        }
      }

      // Extract CCC names (e.g., [[NGSS:CCC:Patterns]])
      const cccRegex = /\[\[NGSS:CCC:([^\]]+)\]\]/g;
      let cccMatch;
      while ((cccMatch = cccRegex.exec(md)) !== null) {
        const name = cccMatch[1];
        if (!ngssIndex.crosscuttingConcepts[name]) ngssIndex.crosscuttingConcepts[name] = [];
        if (!ngssIndex.crosscuttingConcepts[name].includes(image.id)) {
          ngssIndex.crosscuttingConcepts[name].push(image.id);
        }
      }
    }

    processed++;
  }

  // Build flat list for autocomplete/search
  const allStds = new Set();
  Object.keys(ngssIndex.performanceExpectations).forEach(k => allStds.add('PE: ' + k));
  Object.keys(ngssIndex.disciplinaryCoreIdeas).forEach(k => allStds.add('DCI: ' + k));
  Object.keys(ngssIndex.crosscuttingConcepts).forEach(k => allStds.add('CCC: ' + k));
  ngssIndex.allStandards = [...allStds].sort();

  await fs.writeFile(path.join(repoDir, 'ngss-index.json'), JSON.stringify(ngssIndex, null, 2));
  console.log(`📊 Rebuilt ngss-index.json (${processed} images, ${Object.keys(ngssIndex.performanceExpectations).length} PEs, ${Object.keys(ngssIndex.disciplinaryCoreIdeas).length} DCIs, ${Object.keys(ngssIndex.crosscuttingConcepts).length} CCCs)`);
}

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

    // Check if this is a reprocess request (flagged via custom metadata)
    const isReprocess = object.metadata?.reprocess === 'true';

    // Add to queue
    await db.collection('imageQueue').add({
      filePath,
      category,
      filename,
      bucketName: object.bucket,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      attempts: 0,
      reprocess: isReprocess
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
  memory: '2GB',
  timeoutSeconds: 540,
  secrets: ['ANTHROPIC_API_KEY', 'GITHUB_TOKEN']
}).pubsub.schedule('every 1 minutes').onRun(async () => {

  // Check if any item is currently being processed
  const processingCheck = await db.collection('imageQueue')
    .where('status', '==', 'processing')
    .limit(1)
    .get();

  if (!processingCheck.empty) {
    // Check for stale "processing" items (OOM crashes don't trigger catch blocks)
    const staleDoc = processingCheck.docs[0];
    const staleData = staleDoc.data();
    const startedAt = staleData.startedAt ? staleData.startedAt.toDate() : null;
    const minutesProcessing = startedAt ? (Date.now() - startedAt.getTime()) / 60000 : 999;

    if (minutesProcessing > 12) {
      // Item has been "processing" for over 12 minutes — likely crashed (OOM/timeout)
      console.warn(`⚠️ Stale processing detected: ${staleData.filename} (${Math.round(minutesProcessing)}m). Resetting to pending.`);
      const attempts = (staleData.attempts || 0) + 1;
      if (attempts >= 3) {
        await staleDoc.ref.update({ status: 'failed', error: 'Exceeded max attempts (likely OOM crash)', attempts });
        console.error(`❌ ${staleData.filename} failed after ${attempts} attempts`);
      } else {
        await staleDoc.ref.update({ status: 'pending', attempts });
        console.log(`🔄 Reset ${staleData.filename} to pending (attempt ${attempts})`);
      }
    } else {
      console.log('⏸️  Another image is being processed, waiting...');
    }
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

  const taskType = item.type || 'image-processing';
  console.log(`🚀 Processing: ${item.filename} (${taskType})`);

  await doc.ref.update({
    status: 'processing',
    startedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  try {
    if (taskType === '5e-generation') {
      await process5EFromQueue(item);
    } else {
      await processImageFromQueue(item);
    }

    await doc.ref.update({
      status: 'completed',
      completedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    setTimeout(() => doc.ref.delete(), 3600000);
    console.log(`✅ Completed: ${item.filename} (${taskType})`);

  } catch (error) {
    console.error(`❌ Failed: ${error.message}`);
    const attempts = (item.attempts || 0) + 1;

    if (attempts >= 3) {
      await doc.ref.update({ status: 'failed', error: error.message, attempts });
      // Only move to failed/ for image-processing tasks (not 5E follow-ups)
      if (taskType !== '5e-generation') {
        const bucket = admin.storage().bucket();
        try {
          await bucket.file(item.filePath).move(`failed/${Date.now()}_${item.filename}`);
        } catch (e) {}
      }
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

  const processingStartTime = Date.now();

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
    await git.clone(repoUrl, repoDir, ['--depth', '1']);
    console.log('✅ Repository cloned');

    const repoGit = simpleGit(repoDir);
    await repoGit.addConfig('user.name', 'SIAS Automation');
    await repoGit.addConfig('user.email', 'mr.alexdjones@gmail.com');

    const isReprocess = queueItem.reprocess === true;
    const targetImagePath = path.join(repoDir, 'images', category, filename);
    const nameNoExt = path.parse(filename).name;

    if (isReprocess) {
      console.log(`🔄 Re-processing existing image: ${filename}`);
    } else {
      // Check for duplicates - see if this image already exists in metadata
      const metadataCheck = JSON.parse(await fs.readFile(path.join(repoDir, 'gallery-metadata.json'), 'utf8'));
      const imageExists = metadataCheck.images.some(img => img.filename === filename && img.category === category);

      if (imageExists) {
        console.warn(`⚠️  Duplicate detected: ${filename} already exists in ${category}`);
        // Move to a "duplicates" folder in storage
        await bucket.file(filePath).move(`duplicates/${category}/${filename}`);
        console.log('📦 Moved to duplicates folder');
        return null;
      }

      // Upload original image to Storage
      await uploadToGalleryStorage(tempFilePath, `images/${category}/${filename}`, 'image/jpeg');

      // Generate optimized image variants in /tmp and upload to Storage
      const tmpThumbPath = path.join(tempDir, `thumb-${filename}`);
      const tmpWebpPath = path.join(tempDir, `webp-${nameNoExt}.webp`);
      const tmpPlaceholderPath = path.join(tempDir, `placeholder-${filename}`);

      try {
        // Generate 600px thumbnail
        await sharp(tempFilePath).resize({ height: 600 }).toFile(tmpThumbPath);
        // Generate WebP from thumbnail
        await sharp(tmpThumbPath).webp({ quality: 80 }).toFile(tmpWebpPath);
        // Generate 20px blur-up placeholder
        await sharp(tempFilePath).resize({ width: 20 }).toFile(tmpPlaceholderPath);
        console.log(`🖼️  Generated optimized variants (thumb, webp, placeholder)`);

        // Upload all variants to Storage
        await uploadToGalleryStorage(tmpThumbPath, `images/${category}/thumbs/${filename}`, 'image/jpeg');
        await uploadToGalleryStorage(tmpWebpPath, `images/${category}/webp/${nameNoExt}.webp`, 'image/webp');
        await uploadToGalleryStorage(tmpPlaceholderPath, `images/${category}/placeholders/${filename}`, 'image/jpeg');

        // Clean up temp variant files
        await fs.rm(tmpThumbPath, { force: true });
        await fs.rm(tmpWebpPath, { force: true });
        await fs.rm(tmpPlaceholderPath, { force: true });
      } catch (optimizeError) {
        console.warn(`⚠️  Image optimization failed (non-blocking): ${optimizeError.message}`);
      }
    }

    // Copy image to repo for PDF generation (PDFs embed the image)
    await fs.mkdir(path.join(repoDir, 'images', category), { recursive: true });
    await fs.copyFile(tempFilePath, targetImagePath);

    // Read gallery-metadata.json
    const metadataPath = path.join(repoDir, 'gallery-metadata.json');
    const metadataContent = await fs.readFile(metadataPath, 'utf8');
    const metadata = JSON.parse(metadataContent);

    let nextId;
    if (isReprocess) {
      // Find existing image entry by filename and category
      const existingImage = metadata.images.find(
        img => img.filename === filename && img.category === category
      );
      if (!existingImage) {
        throw new Error(`Re-process failed: ${filename} not found in gallery-metadata.json`);
      }
      nextId = existingImage.id;
      console.log(`🔄 Re-processing image ID ${nextId}: "${existingImage.title}"`);
    } else {
      // Generate a title from the filename
      const title = generateTitle(filename);

      // Get the next ID
      nextId = metadata.images.length > 0
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
    }

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
    const ngssStandards = extractAllGradeLevelStandards(educationalContent, category);
    const totalStandards = Object.values(ngssStandards).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`✅ Extracted ${totalStandards} NGSS standards across all grade levels (${CATEGORY_TO_NGSS_DOMAIN[category] || '?'} domain)`);

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

        // Upload PDF to Storage instead of writing to git repo
        await uploadBufferToGalleryStorage(pdfBuffer, `pdfs/${category}/${nameNoExt}-${grade.key}.pdf`, 'application/pdf');
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

    // Queue 5E Lesson Plan generation as a separate follow-up task
    // (5E adds ~5 min of API calls which exceeds the 540s function timeout if combined with the main pipeline)
    console.log('🟣 Queueing 5E Lesson Plan generation as follow-up task...');
    try {
      await db.collection('imageQueue').add({
        type: '5e-generation',
        filename,
        category,
        filePath: `processed/${category}/${filename}`,
        nameNoExt,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        attempts: 0
      });
      console.log('✅ 5E generation queued for next processing cycle');
    } catch (queueErr) {
      console.warn(`⚠️ Failed to queue 5E generation: ${queueErr.message}`);
    }

    // Calculate processing duration
    const processingDurationMs = Date.now() - processingStartTime;
    const processingMinutes = Math.floor(processingDurationMs / 60000);
    const processingSeconds = Math.round((processingDurationMs % 60000) / 1000);
    const processingTimeStr = `${processingMinutes}m ${processingSeconds}s`;

    // Update metadata with cost and processing time
    const metadataFinal = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
    const imageFinalEntry = metadataFinal.images.find(img => img.id === nextId);
    if (imageFinalEntry) {
      imageFinalEntry.processingCost = parseFloat(totalCost.toFixed(4));
      imageFinalEntry.processingTime = processingTimeStr;
      imageFinalEntry.processedAt = new Date().toISOString();
      await fs.writeFile(metadataPath, JSON.stringify(metadataFinal, null, 2));
      console.log(`✅ Added processing cost ($${totalCost.toFixed(4)}) and time (${processingTimeStr}) to metadata`);
    }

    // Write cost to Firestore for real-time admin dashboard access
    // (metadata in git/Hosting has a deploy delay; Firestore is instant)
    await db.collection('processingCosts').doc(filename).set({
      cost: parseFloat(totalCost.toFixed(4)),
      processingTime: processingTimeStr,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      phase: 'image',
      imageId: nextId,
      category
    });
    console.log(`💾 Wrote processing cost to Firestore: $${totalCost.toFixed(4)}`)

    // Rebuild ngss-index.json for admin dashboard coverage map
    await buildNgssIndex(repoDir);

    // Remove temp image from repo before commit (was only needed for PDF generation)
    // Binary files (images, PDFs) are now in Storage, not git
    try { await fs.rm(targetImagePath, { force: true }); } catch (e) {}
    // Remove image directory if empty (for new images)
    try { await fs.rmdir(path.join(repoDir, 'images', category)); } catch (e) {}
    try { await fs.rmdir(path.join(repoDir, 'images')); } catch (e) {}

    // Commit and push to GitHub (JSON files only — binaries are in Storage)
    console.log('📤 Committing to GitHub...');
    await repoGit.add('.');
    const commitAction = isReprocess ? 'Re-process' : 'Add';
    await repoGit.commit(`${commitAction} ${filename} with educational content, hotspots, keywords, NGSS standards

- Category: ${category}
- Generated content for all grade levels (K-5)
- Generated interactive hotspots (3-4 per image)
- Generated search keywords
- Extracted ${totalStandards} NGSS standards for gallery badges
- Uploaded ${pdfCount} lesson PDFs + EDP PDF to Storage
- Uploaded image variants to Storage
- 5E lesson plans queued for follow-up generation
- Processing time: ${processingTimeStr}
- Total cost: $${totalCost.toFixed(4)}

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

    // Don't move file to failed/ here — let processQueue handle retries
    // Moving here breaks retry logic since subsequent attempts can't find the file
    try {
      console.log('⚠️ Processing failed, file remains in uploads/ for retry by processQueue');
    } catch (moveError) {
      console.error('❌ Error in failure handler:', moveError);
    }

    throw error;
  }
}

/**
 * Process a 5E lesson plan generation task from the queue.
 * This is a follow-up task queued by processImageFromQueue to avoid timeout.
 * Downloads the image from processed/, clones repo, generates 5E content + PDFs, pushes.
 */
async function process5EFromQueue(queueItem) {
  const { filename, category, filePath, nameNoExt } = queueItem;
  const bucket = admin.storage().bucket();
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  console.log(`🟣 5E Generation: ${filename}`);
  console.log(`📂 Category: ${category}`);

  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, filename);

  try {
    // Download image from processed/ folder
    await bucket.file(filePath).download({ destination: tempFilePath });
    console.log(`⬇️  Downloaded from: ${filePath}`);

    // Read image as base64
    const imageBuffer = await fs.readFile(tempFilePath);
    const imageBase64 = imageBuffer.toString('base64');
    const metadata = await sharp(tempFilePath).metadata();
    const mediaType = `image/${metadata.format}`;

    // Clone repo
    const repoDir = path.join(tempDir, 'sias2-repo');
    const githubToken = process.env.GITHUB_TOKEN;
    const repoUrl = `https://${githubToken}@github.com/Educ8r-Cre8r/sias2.git`;

    try {
      await fs.rm(repoDir, { recursive: true, force: true });
    } catch (e) {}

    // Sparse checkout: only download files needed for 5E generation
    // (avoids downloading ~500MB of images/PDFs we don't need)
    console.log('📦 Cloning repository (sparse checkout)...');
    const git = simpleGit();
    await git.clone(repoUrl, repoDir, ['--depth', '1', '--filter=blob:none', '--sparse']);
    const repoGit = simpleGit(repoDir);
    await repoGit.addConfig('user.name', 'SIAS Automation');
    await repoGit.addConfig('user.email', 'mr.alexdjones@gmail.com');
    // Set sparse checkout — only need JSON files + logo (binaries are in Storage)
    await repoGit.raw(['sparse-checkout', 'set', '--no-cone',
      'sias_logo.png',
      'gallery-metadata.json',
      `content/${category}/`,
    ]);
    console.log('✅ Repository cloned (sparse)');

    // Use the already-downloaded temp image for PDF generation (no need to clone from git)
    const targetImagePath = tempFilePath;
    const logoPath = path.join(repoDir, 'sias_logo.png');

    // Generate 5E content and PDFs
    const fiveECost = await generate5EContentAndPDFs(
      anthropicKey, imageBase64, mediaType, filename, category, repoDir, targetImagePath, logoPath, nameNoExt
    );

    // Update metadata with 5E cost added to existing processingCost
    const metadataPath = path.join(repoDir, 'gallery-metadata.json');
    const metadataData = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
    const imageEntry = metadataData.images.find(img => img.filename === filename);
    const combinedCost = parseFloat(((imageEntry?.processingCost || 0) + fiveECost).toFixed(4));
    if (imageEntry) {
      imageEntry.processingCost = combinedCost;
      await fs.writeFile(metadataPath, JSON.stringify(metadataData, null, 2));
      console.log(`✅ Updated processing cost (+$${fiveECost.toFixed(4)}) in metadata`);
    }

    // Update Firestore with combined total cost (instant for admin dashboard)
    await db.collection('processingCosts').doc(filename).set({
      cost: combinedCost,
      phase: 'complete',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`💾 Updated Firestore processing cost: $${combinedCost} (image + 5E)`);

    // Commit and push
    console.log('📤 Committing 5E content to GitHub...');
    await repoGit.add('.');
    await repoGit.commit(`Add 5E lesson plans for ${filename}

- Generated 5E lesson plan content JSONs for all grade levels (K-5)
- Uploaded 5E lesson plan PDFs to Storage
- Total 5E cost: $${fiveECost.toFixed(4)}

Co-Authored-By: SIAS Automation <mr.alexdjones@gmail.com>`);

    await repoGit.push('origin', 'main');
    console.log('✅ 5E content pushed to GitHub');

    // Clean up
    await fs.rm(tempFilePath, { force: true });
    await fs.rm(repoDir, { recursive: true, force: true });

    console.log('🎉 ============================================');
    console.log(`✅ 5E generation complete: ${filename}`);
    console.log(`💰 5E cost: $${fiveECost.toFixed(4)}`);
    console.log('🎉 ============================================');

    return { success: true, filename, cost: fiveECost };

  } catch (error) {
    console.error('❌ Error in 5E generation:', error);

    // Clean up temp files on error
    try {
      await fs.rm(tempFilePath, { force: true });
      await fs.rm(path.join(tempDir, 'sias2-repo'), { recursive: true, force: true });
    } catch (e) {}

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
function extractAllGradeLevelStandards(educational, category) {
  const ngssStandards = {};
  const domainPrefix = category ? CATEGORY_TO_NGSS_DOMAIN[category] : null;

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
        let standards = extractNGSSStandards(educational[inputKey]);
        // Filter out cross-domain codes as safety net
        if (domainPrefix && standards.length > 0) {
          standards = standards.filter(code => {
            const match = code.match(/-([A-Z]+)\d/);
            if (!match) return true; // keep unrecognized formats
            const codeDomain = match[1];
            return codeDomain === domainPrefix || codeDomain === 'ETS';
          });
        }
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
            },
            cache_control: { type: 'ephemeral' }
          },
          {
            type: 'text',
            text: prompt
          }
        ]
      }]
    });

    // Calculate cost with prompt caching support
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const cacheWriteTokens = response.usage.cache_creation_input_tokens || 0;
    const cacheReadTokens = response.usage.cache_read_input_tokens || 0;
    const cost = (inputTokens * 0.001 / 1000)
      + (cacheWriteTokens * 0.00125 / 1000)
      + (cacheReadTokens * 0.0001 / 1000)
      + (outputTokens * 0.005 / 1000);
    if (cacheReadTokens > 0) console.log(`   💾 Cache hit: ${cacheReadTokens} tokens read from cache`);

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
            },
            cache_control: { type: 'ephemeral' }
          },
          {
            type: 'text',
            text: prompt
          }
        ]
      }]
    });

    // Calculate cost with prompt caching support
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const cacheWriteTokens = response.usage.cache_creation_input_tokens || 0;
    const cacheReadTokens = response.usage.cache_read_input_tokens || 0;
    const cost = (inputTokens * 0.001 / 1000)
      + (cacheWriteTokens * 0.00125 / 1000)
      + (cacheReadTokens * 0.0001 / 1000)
      + (outputTokens * 0.005 / 1000);
    if (cacheReadTokens > 0) console.log(`   💾 Cache hit: ${cacheReadTokens} tokens read from cache`);

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
// Build expanded content system prompt (must exceed 4,096 tokens for Haiku 4.5 caching)
function buildContentSystemPrompt() {
  const standardsText = Object.entries(NGSS_PE_STANDARDS)
    .map(([code, statement]) => `- ${code}: ${statement}`)
    .join('\n');

  return `You are an expert K-5 Science Instructional Coach and NGSS Curriculum Specialist.

Your goal is to analyze the provided image to help a teacher create a rigorous, age-appropriate science lesson for elementary students.

## Science Domains and Topics
Each photograph is categorized into one of three NGSS science domains:
- **physical-science (PS):** forces, motion, energy, matter, properties of materials, waves, light, sound, shadows, electricity, magnetism
- **life-science (LS):** living organisms, life cycles, habitats, body structures, ecosystems, heredity, adaptation, survival
- **earth-space-science (ESS):** rocks, minerals, weather, water cycle, landforms, erosion, natural resources, space, Earth systems

You MUST analyze each image THROUGH THE LENS of the specified domain's concepts and ONLY use NGSS standards with the matching domain code prefix (PS, LS, or ESS) for the specified grade level.

### GUIDELINES
- **Tone:** Professional, encouraging, and scientifically accurate
- **Audience:** The teacher (not the student)
- **Format:** Strict Markdown. Start directly with the first section header
- **Safety:** Ensure all suggested activities are safe for elementary students

## Complete K-5 NGSS Performance Expectations Reference
Below is the complete set of K-5 NGSS Performance Expectations. Each user prompt will specify which grade level and domain to use — select only the standards matching both the grade AND domain from this reference.

${standardsText}

## Required Output Format
Generate ONLY the sections below. Use Level 2 Markdown headers (##) with emojis. No exceptions.

## 📸 Photo Description
Describe the key scientific elements visible in 2-3 sentences at the specified grade's reading level. Focus on observable features relevant to the specified domain.

## 🔬 Scientific Phenomena
Identify the specific "Anchoring Phenomenon" this image represents from the specified domain's perspective. Explain WHY it is happening scientifically, in language appropriate for elementary teachers.

## 📚 Core Science Concepts
Detail 2-4 fundamental concepts from the specified domain illustrated by this photo. Use numbered or bulleted lists.

**CRITICAL:** Somewhere within this section, you MUST include:
1. A short pedagogical tip wrapped in <pedagogical-tip>...</pedagogical-tip> tags
2. A Universal Design for Learning (UDL) suggestion wrapped in <udl-suggestions>...</udl-suggestions> tags

## 🔍 Zoom In / Zoom Out Concepts
Provide two distinct perspectives:
1. **Zoom In:** A microscopic or unseen process (e.g., cellular level, atomic)
2. **Zoom Out:** The larger system connection (e.g., ecosystem, watershed, planetary)

## 🤔 Potential Student Misconceptions
List 1-3 common naive conceptions students at the specified grade might have about this topic and provide the scientific clarification.

## 🎓 NGSS Connections

### RULES FOR THIS SECTION:
1. You MUST ONLY select standards from the VALIDATED LIST provided in the user prompt. Do NOT invent or guess standard codes.
2. You MUST ONLY use the specified domain codes — no codes from other domains.
3. You MUST copy the standard statement EXACTLY as written. Do NOT paraphrase.
4. Select ALL standards from the provided list that are genuinely relevant to this image. Do not limit yourself to just 1-2.

### Format Requirements:
- List each relevant PE code followed by its EXACT official statement
- Wrap Disciplinary Core Ideas (DCI) in double brackets: [[NGSS:DCI:Code]]
- Wrap Crosscutting Concepts (CCC) in double brackets: [[NGSS:CCC:Name]]
  Valid CCCs: Patterns, Cause and Effect, Scale Proportion and Quantity, Systems and System Models, Energy and Matter, Structure and Function, Stability and Change
  Example: [[NGSS:CCC:Patterns]]

## 💬 Discussion Questions
Provide 3-4 open-ended questions. Label EVERY question with its Bloom's Taxonomy level and Depth of Knowledge (DOK) level.
Example: "Why did the ice melt? (Bloom's: Analyze | DOK: 2)"

## 📖 Vocabulary
Provide a bulleted list of 3-6 tier 2 or tier 3 science words related to the specified domain.
Format strictly as: * **Word:** Kid-friendly definition (1 sentence)

## 🌡️ Extension Activities
Provide 2-3 hands-on extension activities appropriate for the specified grade that reinforce the specified domain's concepts.

## 🔗 Cross-Curricular Ideas
Provide 3-4 ideas for connecting the science in this photo to other subjects like Math, ELA, Social Studies, or Art for the specified grade classroom.

## 🚀 STEM Career Connection
List and briefly describe 2-3 STEM careers that relate to the science shown in this photo. Describe the job simply for the specified grade level. For each career, also provide an estimated average annual salary in USD.

## 📚 External Resources
Provide ONLY the following real, existing resources:
- **Children's Books:** Title by Author (2-3 books)

IMPORTANT: Do NOT include YouTube videos, websites, or any other external resources. Only provide children's books.

---

Remember:
- Use Markdown formatting throughout
- Include the special XML tags for pedagogical tips and UDL strategies
- Use the [[NGSS:...]] format for standards
- ONLY use the specified domain standards
- Keep language at the specified grade level where appropriate
- Be scientifically accurate and engaging`;
}

// Pre-build the content system prompt once (stays identical across all API calls for caching)
const CONTENT_SYSTEM_PROMPT = buildContentSystemPrompt();

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

  // NGSS standards are now embedded in NGSS_PE_STANDARDS constant (no file I/O needed)

  console.log(`📝 Generating content for ${GRADE_LEVELS.length} grade levels...`);

  // Store all grade-level content for the combined file
  const educationalContent = {};

  for (const grade of GRADE_LEVELS) {
    console.log(`   📝 Generating ${grade.name} content...`);

    // Get filtered NGSS standards for this grade level and category
    const filteredStandards = getFilteredNGSSStandards(category, grade.ngssGrade);
    const domainPrefix = CATEGORY_TO_NGSS_DOMAIN[category] || '';
    const domainName = { 'PS': 'Physical Science', 'LS': 'Life Science', 'ESS': 'Earth and Space Science' }[domainPrefix] || category;
    const standardsList = Object.entries(filteredStandards).map(([code, statement]) => `- ${code}: ${statement}`).join('\n');
    const excludedDomains = domainPrefix === 'PS' ? 'no LS or ESS codes' : domainPrefix === 'LS' ? 'no PS or ESS codes' : 'no PS or LS codes';

    const prompt = `Analyze this science education photograph and generate educational content.

Category: ${category}
NGSS Domain: ${domainName} (${domainPrefix} codes only — ${excludedDomains})
Image: ${filename}
Grade Level: ${grade.name}

### VALIDATED ${grade.ngssGrade}-${domainPrefix} Performance Expectations:
${standardsList || 'No standards available for this grade level and domain.'}

DCI bracket example: [[NGSS:DCI:${Object.keys(filteredStandards)[0] ? Object.keys(filteredStandards)[0].replace(/-\d+$/, '') + '.A' : grade.ngssGrade + '-' + domainPrefix + '1.A'}]]

Use ONLY the standards listed above. Follow the complete output format specified in the system instructions.`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 5000,
        system: [{
          type: 'text',
          text: CONTENT_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' }
        }],
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageBase64
              },
              cache_control: { type: 'ephemeral' }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }]
      });

      // Calculate cost with prompt caching support
      // Haiku 4.5: input $1/MTok, output $5/MTok, cache write $1.25/MTok, cache read $0.10/MTok
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      const cacheWriteTokens = response.usage.cache_creation_input_tokens || 0;
      const cacheReadTokens = response.usage.cache_read_input_tokens || 0;
      const cost = (inputTokens * 0.001 / 1000)
        + (cacheWriteTokens * 0.00125 / 1000)
        + (cacheReadTokens * 0.0001 / 1000)
        + (outputTokens * 0.005 / 1000);
      if (cacheReadTokens > 0) console.log(`   💾 Cache hit: ${cacheReadTokens} tokens read from cache`);
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
  const hotspotNGSS = extractAllGradeLevelStandards(educationalContent, category);
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
    system: [{
      type: 'text',
      text: EDP_SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' }
    }],
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: imageBase64
          },
          cache_control: { type: 'ephemeral' }
        },
        {
          type: 'text',
          text: userPrompt
        }
      ]
    }]
  });

  // Calculate cost with prompt caching support
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cacheWriteTokens = response.usage.cache_creation_input_tokens || 0;
  const cacheReadTokens = response.usage.cache_read_input_tokens || 0;
  const cost = (inputTokens * 0.001 / 1000)
    + (cacheWriteTokens * 0.00125 / 1000)
    + (cacheReadTokens * 0.0001 / 1000)
    + (outputTokens * 0.005 / 1000);
  if (cacheReadTokens > 0) console.log(`   💾 Cache hit: ${cacheReadTokens} tokens read from cache`);

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

  // Upload EDP PDF to Storage instead of writing to git repo
  await uploadBufferToGalleryStorage(pdfBuffer, `pdfs/${category}/${nameNoExt}-edp.pdf`, 'application/pdf');
  console.log(`   ✅ EDP PDF uploaded to Storage: ${nameNoExt}-edp.pdf`);

  return cost;
}

// ============================================================
// 5E Lesson Plan Generation
// ============================================================

// Build expanded system prompt with NGSS standards + template (must exceed 4,096 tokens for Haiku 4.5 caching)
function buildExpandedSystemPrompt() {
  const standardsText = Object.entries(NGSS_PE_STANDARDS)
    .map(([code, statement]) => `- ${code}: ${statement}`)
    .join('\n');

  return `You are an expert K-5 Science Curriculum Developer specializing in the 5E Instructional Model (Engage, Explore, Explain, Elaborate, Evaluate). You create grade-appropriate, NGSS-aligned 5E lesson plans based on science photographs.

## Core Principles
1. Every lesson must be directly inspired by what is visible or inferable from the photograph.
2. Activities must be age-appropriate, safe, and use classroom-available materials.
3. All NGSS connections must use only standards from the specified grade level and science domain.
4. The 5E phases must flow logically — each phase builds on the previous one.
5. Language complexity must match the target grade level.
6. Include concrete, actionable teacher directions — not vague suggestions.

## Tone
Professional yet approachable. Write as if advising a colleague teacher who needs a ready-to-use lesson plan.

## Science Domains and Topics
Each photograph is categorized into one of three NGSS science domains:
- **physical-science (PS):** forces, motion, energy, matter, properties of materials, waves, light, sound, shadows, electricity, magnetism
- **life-science (LS):** living organisms, life cycles, habitats, body structures, ecosystems, heredity, adaptation, survival
- **earth-space-science (ESS):** rocks, minerals, weather, water cycle, landforms, erosion, natural resources, space, Earth systems

You MUST create each lesson through the lens of the specified domain's concepts and ONLY use NGSS standards with the matching domain code prefix (PS, LS, or ESS) for the specified grade level.

## Complete K-5 NGSS Performance Expectations Reference
Below is the complete set of K-5 NGSS Performance Expectations organized by standard code. Each user prompt will specify which grade level and domain to use — select only the standards matching both the grade AND domain from this reference.

${standardsText}

## Required Output Format
Generate ALL of the following sections using ### headers. No exceptions. Every section must be included in full.

### Core Science Concepts from Image Analysis
Identify 3-4 key concepts from the specified domain that are visible or inferable from the photograph and appropriate for the specified grade level. Use bullet points.

### Lesson Title
Create a short, engaging, creative lesson title appropriate for the specified grade level. Just the title — no extra text.

### Lesson Overview
Provide these details:
- **Grade Level:** [specified grade]
- **Subject:** Science ([specified domain])
- **Time Allotment:** Estimate total time (e.g., "Two 45-minute sessions" or "60-90 minutes")
- **NGSS Standards:** List 1-3 relevant NGSS PE codes from the filtered standards provided

### Learning Objectives
Write 3-4 measurable learning objectives using age-appropriate language for the specified grade level. Begin each with "Students will be able to..."

### 5E Lesson Sequence

#### 1. ENGAGE (10-15 minutes)
- **Objective:** Capture student interest and activate prior knowledge using the photograph.
- **Materials:** List specific materials needed.
- **Activity:** Describe exactly how to use this photograph to hook students. Include:
  - How to display/introduce the photograph
  - 3-4 specific discussion questions to spark curiosity (calibrated to the specified grade level)
  - A prediction or wonder prompt
- **Transition:** One sentence bridging to the Explore phase.

#### 2. EXPLORE (20-25 minutes)
- **Objective:** Students investigate and discover concepts through hands-on activity.
- **Materials:** List specific, classroom-available materials.
- **Activity:** Design a hands-on investigation where students discover concepts independently. Include:
  - Step-by-step student directions
  - How the activity connects to what was observed in the photograph
  - What students should record or document
- **Teacher Role:** Describe how the teacher facilitates without giving answers.
- **Expected Student Outcomes:** What students should discover or produce.

#### 3. EXPLAIN (15-20 minutes)
- **Objective:** Introduce formal vocabulary and concepts after exploration.
- **Materials:** List materials for this phase.
- **Activity:** Describe teacher-led instruction that includes:
  - Group share-out from Explore phase
  - Key vocabulary with grade-appropriate definitions (3-5 terms)
  - Connections back to the photograph and Explore activity
  - Check for understanding strategy
- **Vocabulary:** List each term with a student-friendly definition.
- **Expected Student Outcomes:** What students should understand after this phase.

#### 4. ELABORATE (15-20 minutes)
- **Objective:** Students apply and deepen their understanding.
- **Materials:** List specific materials.
- **Activity:** Design an extension activity that:
  - Applies concepts to a new context or scenario
  - Connects to real-world applications
  - Is appropriately challenging for the specified grade level
- **Teacher Role:** Facilitation notes.
- **Expected Student Outcomes:** Evidence of deeper understanding.

#### 5. EVALUATE
- **Objective:** Assess student understanding.
- **Activity:** Describe assessment including:
  - Formative assessment strategy used during the lesson
  - Exit ticket or summative assessment (provide specific questions)
  - Success criteria for student understanding
- **Expected Student Outcomes:** How to determine if students met the learning objectives.

### Differentiation
- **Support:** 2-3 specific scaffolding strategies for struggling learners
- **Challenge:** 2-3 specific extension ideas for advanced learners

### Extension Activities
List 2-3 additional activities teachers can use for early finishers, homework, or follow-up lessons.`;
}

// Pre-build the system prompt once (stays identical across all API calls for caching)
const FIVE_E_SYSTEM_PROMPT = buildExpandedSystemPrompt();

function build5EUserPrompt(category, filename, grade) {
  const domainPrefix = CATEGORY_TO_NGSS_DOMAIN[category] || '';
  const domainName = { 'PS': 'Physical Science', 'LS': 'Life Science', 'ESS': 'Earth and Space Science' }[domainPrefix] || category;

  const filteredStandards = getFilteredNGSSStandards(category, grade.ngssGrade);
  const standardsList = Object.entries(filteredStandards)
    .map(([code, statement]) => `- ${code}: ${statement}`)
    .join('\n');

  return `Analyze this science education photograph and generate a complete 5E Lesson Plan.

Category: ${category}
Photo: ${filename}
Grade Level: ${grade.name}
NGSS Domain: ${domainName} (${domainPrefix} codes only)

### Applicable NGSS Performance Expectations for ${grade.name} (${domainPrefix} domain)
${standardsList || 'No specific PE standards for this grade/domain combination. Use general science practices.'}

Use ONLY the standards listed above. Follow the complete output format specified in the system instructions.`;
}

/**
 * Generate 5E Lesson Plan content and PDFs for all grade levels
 * Called during the image processing pipeline after EDP is generated.
 */
async function generate5EContentAndPDFs(anthropicKey, imageBase64, mediaType, filename, category, repoDir, targetImagePath, logoPath, nameNoExt) {
  const anthropic = new Anthropic({ apiKey: anthropicKey });
  const { generate5EPDF } = require('./5e-pdf-generator');

  const contentDir = path.join(repoDir, 'content', category);
  await fs.mkdir(contentDir, { recursive: true });

  let totalCost = 0;
  let count = 0;

  for (const grade of GRADE_LEVELS) {
    console.log(`   🟣 Generating ${grade.name} 5E content...`);

    const userPrompt = build5EUserPrompt(category, filename, grade);

    // Retry with exponential backoff (3 attempts: 5s, 15s, 45s)
    let response;
    const RETRY_DELAYS = [5000, 15000, 45000];
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        response = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 8192,
          system: [{
            type: 'text',
            text: FIVE_E_SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' }
          }],
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: imageBase64
                },
                cache_control: { type: 'ephemeral' }
              },
              {
                type: 'text',
                text: userPrompt
              }
            ]
          }]
        });
        break; // Success — exit retry loop
      } catch (apiErr) {
        if (attempt < 3) {
          const delay = RETRY_DELAYS[attempt - 1];
          console.warn(`   ⚠️ Retry ${attempt}/3 for ${grade.name} 5E after error: ${apiErr.message} (waiting ${delay / 1000}s)`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw apiErr; // Final attempt failed
        }
      }
    }

    // Calculate cost with prompt caching support
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const cacheWriteTokens = response.usage.cache_creation_input_tokens || 0;
    const cacheReadTokens = response.usage.cache_read_input_tokens || 0;
    const cost = (inputTokens * 0.001 / 1000)
      + (cacheWriteTokens * 0.00125 / 1000)
      + (cacheReadTokens * 0.0001 / 1000)
      + (outputTokens * 0.005 / 1000);
    if (cacheReadTokens > 0) console.log(`   💾 Cache hit: ${cacheReadTokens} tokens read from cache`);
    totalCost += cost;

    const markdownContent = response.content[0].text;
    const title = nameNoExt.charAt(0).toUpperCase() + nameNoExt.slice(1).replace(/-/g, ' ');

    // Save 5E content JSON
    const fiveEData = {
      title,
      category,
      imageFile: filename,
      imagePath: `images/${category}/${filename}`,
      gradeLevel: grade.name,
      gradeLevelKey: grade.key,
      content: markdownContent,
      inputTokens,
      outputTokens,
      cost,
      generatedAt: new Date().toISOString()
    };

    await fs.writeFile(
      path.join(contentDir, `${nameNoExt}-5e-${grade.key}.json`),
      JSON.stringify(fiveEData, null, 2)
    );

    // Generate 5E PDF
    try {
      const pdfBuffer = await generate5EPDF({
        title,
        category,
        gradeLevel: grade.key,
        markdownContent,
        imagePath: targetImagePath,
        logoPath
      });

      // Upload 5E PDF to Storage instead of writing to git repo
      await uploadBufferToGalleryStorage(pdfBuffer, `5e_lessons/${category}/${nameNoExt}-${grade.key}.pdf`, 'application/pdf');
      count++;
      console.log(`   ✅ ${grade.name} 5E content saved + PDF uploaded (cost: $${cost.toFixed(4)})`);
    } catch (pdfErr) {
      console.warn(`   ⚠️ ${grade.name} 5E PDF failed (non-blocking): ${pdfErr.message}`);
    }

    // Release memory: null out large variables after each grade to reduce OOM risk
    response = null;

    // Small delay between API calls to avoid rate limiting
    if (grade !== GRADE_LEVELS[GRADE_LEVELS.length - 1]) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`✅ Generated ${count} 5E Lesson Plan PDFs (total cost: $${totalCost.toFixed(4)})`);
  return totalCost;
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

// ============================================================
// Stats Aggregation — Firestore Triggers
// ============================================================

/**
 * Update aggregation document when a rating is created or updated.
 * Trigger: ratings/{photoId} onWrite
 */
exports.onRatingWrite = functions.firestore
  .document('ratings/{photoId}')
  .onWrite(async (change, context) => {
    const photoId = context.params.photoId;
    const data = change.after.exists ? change.after.data() : null;

    if (!data) return null;

    const statsRef = db.collection('aggregations').doc('galleryStats');
    await statsRef.set({
      stats: {
        [photoId]: {
          r: data.averageRating || 0,
          rc: data.totalRatings || 0
        }
      },
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    }, { mergeFields: [`stats.${photoId}.r`, `stats.${photoId}.rc`, 'lastUpdated'] });

    console.log(`📊 Aggregation updated — rating for photo ${photoId}`);
    return null;
  });

/**
 * Update aggregation document when a view count changes.
 * Trigger: views/{photoId} onWrite
 */
exports.onViewWrite = functions.firestore
  .document('views/{photoId}')
  .onWrite(async (change, context) => {
    const photoId = context.params.photoId;
    const data = change.after.exists ? change.after.data() : null;

    if (!data) return null;

    const statsRef = db.collection('aggregations').doc('galleryStats');
    await statsRef.set({
      stats: {
        [photoId]: {
          v: data.count || 0
        }
      },
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    }, { mergeFields: [`stats.${photoId}.v`, 'lastUpdated'] });

    console.log(`📊 Aggregation updated — views for photo ${photoId}`);
    return null;
  });

/**
 * Update aggregation document when a comment is created, updated, or deleted.
 * Counts only approved comments.
 * Trigger: comments/{commentId} onWrite
 */
exports.onCommentWrite = functions.firestore
  .document('comments/{commentId}')
  .onWrite(async (change, context) => {
    const afterData = change.after.exists ? change.after.data() : null;
    const beforeData = change.before.exists ? change.before.data() : null;
    const imageId = (afterData && afterData.imageId) || (beforeData && beforeData.imageId);

    if (!imageId) {
      console.warn('📊 Comment write trigger: no imageId found');
      return null;
    }

    // Count only approved comments for this image
    const approvedSnap = await db.collection('comments')
      .where('imageId', '==', String(imageId))
      .where('status', '==', 'approved')
      .get();

    const statsRef = db.collection('aggregations').doc('galleryStats');
    await statsRef.set({
      stats: {
        [String(imageId)]: {
          c: approvedSnap.size
        }
      },
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    }, { mergeFields: [`stats.${String(imageId)}.c`, 'lastUpdated'] });

    console.log(`📊 Aggregation updated — comments for image ${imageId}: ${approvedSnap.size} approved`);
    return null;
  });

/**
 * One-time backfill: build the aggregation document from all existing data.
 * Admin-only callable.
 */
exports.adminBackfillStats = functions
  .runWith({ memory: '512MB', timeoutSeconds: 120 })
  .https.onCall(async (data, context) => {
    await verifyAdmin(context);

    console.log('📊 Backfilling gallery stats aggregation...');

    // Read all ratings
    const ratingsSnap = await db.collection('ratings').get();
    const ratingsMap = {};
    ratingsSnap.forEach(doc => {
      ratingsMap[doc.id] = doc.data();
    });

    // Read all views
    const viewsSnap = await db.collection('views').get();
    const viewsMap = {};
    viewsSnap.forEach(doc => {
      viewsMap[doc.id] = doc.data();
    });

    // Count approved comments per image
    const commentsSnap = await db.collection('comments')
      .where('status', '==', 'approved')
      .get();
    const commentCounts = {};
    commentsSnap.forEach(doc => {
      const imgId = doc.data().imageId;
      if (imgId) {
        commentCounts[String(imgId)] = (commentCounts[String(imgId)] || 0) + 1;
      }
    });

    // Build aggregation
    const allIds = new Set([
      ...Object.keys(ratingsMap),
      ...Object.keys(viewsMap),
      ...Object.keys(commentCounts)
    ]);

    const stats = {};
    allIds.forEach(id => {
      const rating = ratingsMap[id] || {};
      const view = viewsMap[id] || {};
      stats[id] = {
        r: rating.averageRating || 0,
        rc: rating.totalRatings || 0,
        v: view.count || 0,
        c: commentCounts[id] || 0
      };
    });

    await db.collection('aggregations').doc('galleryStats').set({
      stats,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      backfilledAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`📊 Backfill complete: ${allIds.size} photos aggregated`);
    return { success: true, count: allIds.size };
  });

// ============================================================
// Admin Dashboard — Cloud Functions
// ============================================================

const ADMIN_EMAIL = 'mr.alexdjones@gmail.com';

/**
 * Verify the caller is an authorized admin
 */
async function verifyAdmin(context) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }
  if (context.auth.token.email !== ADMIN_EMAIL) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access only');
  }
}

/**
 * Admin: Delete an image and ALL associated files
 * Callable from the admin dashboard.
 */
exports.adminDeleteImage = functions
  .runWith({ memory: '1GB', timeoutSeconds: 300, secrets: ['GITHUB_TOKEN'] })
  .https.onCall(async (data, context) => {
    await verifyAdmin(context);

    const imageId = data.imageId;
    if (!imageId && imageId !== 0) {
      throw new functions.https.HttpsError('invalid-argument', 'imageId is required');
    }

    console.log(`🗑️  Admin delete requested for image ID: ${imageId}`);

    const tempDir = os.tmpdir();
    const repoDir = path.join(tempDir, 'sias2-admin-delete');

    try {
      // Clean up any existing repo directory
      try {
        await fs.rm(repoDir, { recursive: true, force: true });
      } catch (e) { /* doesn't exist */ }

      // Clone the repo
      const githubToken = process.env.GITHUB_TOKEN;
      const repoUrl = `https://${githubToken}@github.com/Educ8r-Cre8r/sias2.git`;

      console.log('📦 Cloning repository...');
      const git = simpleGit();
      await git.clone(repoUrl, repoDir, ['--depth', '1']);
      const repoGit = simpleGit(repoDir);
      await repoGit.addConfig('user.name', 'SIAS Admin');
      await repoGit.addConfig('user.email', ADMIN_EMAIL);
      console.log('✅ Repository cloned');

      // Read gallery-metadata.json from the cloned repo
      const metadataPath = path.join(repoDir, 'gallery-metadata.json');
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));

      // Find the image entry
      const imageIndex = metadata.images.findIndex(img => img.id === imageId);
      if (imageIndex === -1) {
        throw new functions.https.HttpsError('not-found', `Image with ID ${imageId} not found`);
      }

      const image = metadata.images[imageIndex];
      const { filename, category, title } = image;
      const nameNoExt = filename.replace(/\.[^.]+$/, '');
      const grades = ['kindergarten', 'first-grade', 'second-grade', 'third-grade', 'fourth-grade', 'fifth-grade'];

      console.log(`📸 Deleting: "${title}" (${filename}) from ${category}`);

      // Build list of all files to delete
      const filesToDelete = [
        // Image variants
        `images/${category}/${filename}`,
        `images/${category}/thumbs/${filename}`,
        `images/${category}/webp/${nameNoExt}.webp`,
        `images/${category}/placeholders/${filename}`,
        // Content files
        `content/${category}/${nameNoExt}.json`,
        ...grades.map(g => `content/${category}/${nameNoExt}-${g}.json`),
        `content/${category}/${nameNoExt}-edp.json`,
        // 5E content files
        ...grades.map(g => `content/${category}/${nameNoExt}-5e-${g}.json`),
        // Hotspots
        `hotspots/${category}/${nameNoExt}.json`,
        // PDFs
        ...grades.map(g => `pdfs/${category}/${nameNoExt}-${g}.pdf`),
        `pdfs/${category}/${nameNoExt}-edp.pdf`,
        // 5E lesson PDFs
        ...grades.map(g => `5e_lessons/${category}/${nameNoExt}-${g}.pdf`),
      ];

      // Delete each file (silently skip missing ones)
      let deletedCount = 0;
      let skippedCount = 0;

      for (const filePath of filesToDelete) {
        const fullPath = path.join(repoDir, filePath);
        try {
          await fs.unlink(fullPath);
          deletedCount++;
          console.log(`  ✅ Deleted: ${filePath}`);
        } catch (err) {
          skippedCount++;
          console.log(`  ⏭️  Skipped (not found): ${filePath}`);
        }
      }

      console.log(`📊 Deleted ${deletedCount} git files, skipped ${skippedCount}`);

      // Remove the image entry from metadata
      metadata.images.splice(imageIndex, 1);
      metadata.totalImages = metadata.images.length;
      metadata.lastUpdated = new Date().toISOString();

      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
      console.log('✅ Updated gallery-metadata.json');

      // Rebuild ngss-index.json so coverage map stays accurate
      await buildNgssIndex(repoDir);

      // Commit and push (git first — if this fails, nothing else is modified)
      await repoGit.add('-A');
      await repoGit.commit(`Delete "${title}" (${filename}) and all associated files

- Removed ${deletedCount} files from ${category}
- Skipped ${skippedCount} missing files
- Updated gallery-metadata.json (${metadata.totalImages} images remaining)

Deleted via SIAS Admin Dashboard
Co-Authored-By: SIAS Admin <${ADMIN_EMAIL}>`);

      // Push with retry — fetch + rebase on conflict (handles concurrent pushes)
      try {
        await repoGit.push('origin', 'main');
      } catch (pushErr) {
        console.log('⚠️  Push failed, attempting fetch + rebase retry...');
        await repoGit.fetch(['--unshallow']);
        await repoGit.fetch('origin', 'main');
        await repoGit.rebase(['origin/main']);
        await repoGit.push('origin', 'main');
      }
      console.log('✅ Changes pushed to GitHub');

      // Delete binary files from Firebase Storage (after git push succeeds)
      console.log('☁️  Deleting binary files from Storage...');
      const storageFilesToDelete = [
        // Image variants
        `images/${category}/${filename}`,
        `images/${category}/thumbs/${filename}`,
        `images/${category}/webp/${nameNoExt}.webp`,
        `images/${category}/placeholders/${filename}`,
        // PDFs
        ...grades.map(g => `pdfs/${category}/${nameNoExt}-${g}.pdf`),
        `pdfs/${category}/${nameNoExt}-edp.pdf`,
        // 5E lesson PDFs
        ...grades.map(g => `5e_lessons/${category}/${nameNoExt}-${g}.pdf`),
        // Processed source image
        `processed/${category}/${filename}`,
      ];

      let storageDeleted = 0;
      for (const storagePath of storageFilesToDelete) {
        try {
          await deleteFromGalleryStorage(storagePath);
          storageDeleted++;
        } catch (e) { /* already logged by helper */ }
      }
      console.log(`☁️  Deleted ${storageDeleted} files from Storage`);

      // Delete Firestore records associated with this image
      const imageIdStr = String(imageId);
      let firestoreDeleted = 0;

      // Delete from ratings collection (keyed by photoId)
      try {
        const ratingsDoc = db.collection('ratings').doc(imageIdStr);
        const ratingsSnap = await ratingsDoc.get();
        if (ratingsSnap.exists) {
          await ratingsDoc.delete();
          firestoreDeleted++;
        }
      } catch (e) { console.log('  ⏭️  No ratings doc for', imageIdStr); }

      // Delete from views collection
      try {
        const viewsDoc = db.collection('views').doc(imageIdStr);
        const viewsSnap = await viewsDoc.get();
        if (viewsSnap.exists) {
          await viewsDoc.delete();
          firestoreDeleted++;
        }
      } catch (e) { console.log('  ⏭️  No views doc for', imageIdStr); }

      // Delete userRatings where photoId matches
      try {
        const userRatingsSnap = await db.collection('userRatings')
          .where('photoId', '==', imageIdStr).get();
        if (!userRatingsSnap.empty) {
          const batch = db.batch();
          userRatingsSnap.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
          firestoreDeleted += userRatingsSnap.size;
        }
      } catch (e) { console.log('  ⏭️  Error cleaning userRatings:', e.message); }

      // Delete favorites where photoId matches
      try {
        const favSnap = await db.collection('favorites')
          .where('photoId', '==', imageIdStr).get();
        if (!favSnap.empty) {
          const batch = db.batch();
          favSnap.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
          firestoreDeleted += favSnap.size;
        }
      } catch (e) { console.log('  ⏭️  Error cleaning favorites:', e.message); }

      // Delete comments where imageId matches
      try {
        const commentsSnap = await db.collection('comments')
          .where('imageId', '==', imageIdStr).get();
        if (!commentsSnap.empty) {
          const batch = db.batch();
          commentsSnap.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
          firestoreDeleted += commentsSnap.size;
        }
      } catch (e) { console.log('  ⏭️  Error cleaning comments:', e.message); }

      // Remove from stats aggregation
      try {
        await db.collection('aggregations').doc('galleryStats').update({
          [`stats.${imageIdStr}`]: admin.firestore.FieldValue.delete()
        });
      } catch (e) { console.log('  ⏭️  Error cleaning aggregation:', e.message); }

      // Remove processing cost doc
      try {
        await db.collection('processingCosts').doc(filename).delete();
        firestoreDeleted++;
      } catch (e) { console.log('  ⏭️  Error cleaning processingCosts:', e.message); }

      console.log(`🔥 Deleted ${firestoreDeleted} Firestore records`);

      // Clean up temp directory
      try {
        await fs.rm(repoDir, { recursive: true, force: true });
      } catch (e) { /* ignore cleanup errors */ }

      console.log(`✅ Admin delete complete for "${title}"`);

      // Log deletion to imageQueue for the admin activity feed
      await db.collection('imageQueue').add({
        type: 'deletion',
        filename,
        category,
        title: title || filename,
        imageId,
        status: 'deleted',
        filesDeleted: deletedCount + storageDeleted,
        firestoreDeleted,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        imageId,
        title,
        filename,
        category,
        filesDeleted: deletedCount + storageDeleted,
        filesSkipped: skippedCount,
        firestoreDeleted,
      };

    } catch (error) {
      // Clean up on failure
      try {
        await fs.rm(repoDir, { recursive: true, force: true });
      } catch (e) { /* ignore */ }

      console.error('❌ Admin delete failed:', error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', 'Delete failed: ' + error.message);
    }
  });

/**
 * Admin: Clear completed items from the processing queue
 */
exports.adminClearCompletedQueue = functions
  .https.onCall(async (data, context) => {
    await verifyAdmin(context);

    console.log('🧹 Admin clearing completed queue items...');

    const snapshot = await db.collection('imageQueue')
      .where('status', '==', 'completed')
      .get();

    if (snapshot.empty) {
      console.log('No completed items to clear');
      return { success: true, count: 0 };
    }

    const batch = db.batch();
    snapshot.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    console.log(`✅ Cleared ${snapshot.size} completed queue items`);

    return { success: true, count: snapshot.size };
  });

/**
 * Admin: Re-process an image by copying it back to uploads/ in Storage
 * This triggers the existing queueImage pipeline automatically.
 */
exports.adminReprocessImage = functions
  .runWith({ memory: '512MB', timeoutSeconds: 60 })
  .https.onCall(async (data, context) => {
    await verifyAdmin(context);

    const { imageId } = data;
    if (!imageId) {
      throw new functions.https.HttpsError('invalid-argument', 'imageId is required');
    }

    console.log(`🔄 Admin re-processing image ID: ${imageId}`);

    try {
      // Read gallery-metadata.json from Hosting (it's a static file, not in Storage)
      const metaUrl = 'https://sias-8178a.web.app/gallery-metadata.json';
      const metaResponse = await fetch(metaUrl);
      if (!metaResponse.ok) {
        throw new Error(`Failed to fetch gallery-metadata.json: ${metaResponse.status}`);
      }
      const metadata = await metaResponse.json();

      const image = metadata.images.find(img => img.id === imageId);
      if (!image) {
        throw new functions.https.HttpsError('not-found', `Image ${imageId} not found`);
      }

      // Download the original image from Storage
      const galleryBucket = admin.storage().bucket(GALLERY_BUCKET);
      console.log(`📥 Downloading image from Storage: ${image.imagePath}`);
      let imageBuffer;
      try {
        const [buffer] = await galleryBucket.file(image.imagePath).download();
        imageBuffer = buffer;
      } catch (downloadErr) {
        throw new functions.https.HttpsError('not-found', `Source image not found in Storage: ${image.imagePath}`);
      }

      // Compress image if it exceeds 2MB to stay within processQueue's size limit
      const maxSize = 2 * 1024 * 1024; // 2MB
      if (imageBuffer.length > maxSize) {
        console.log(`📐 Image is ${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB, compressing...`);
        imageBuffer = await sharp(imageBuffer)
          .jpeg({ quality: 85 })
          .toBuffer();
        console.log(`✅ Compressed to ${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB`);
      }

      // Upload to uploads/{category}/{filename} in Storage to trigger queueImage
      // Set reprocess metadata flag so processQueue skips the duplicate check
      const bucket = admin.storage().bucket();
      const destPath = `uploads/${image.category}/${image.filename}`;
      const destFile = bucket.file(destPath);
      await destFile.save(imageBuffer, {
        metadata: {
          contentType: 'image/jpeg',
          metadata: { reprocess: 'true' }
        }
      });

      console.log(`✅ Uploaded ${image.imagePath} → Storage:${destPath}, queueImage will trigger`);

      return { success: true, message: `Image ${imageId} queued for re-processing` };
    } catch (error) {
      console.error('Re-process error:', error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError('internal', 'Re-process failed: ' + error.message);
    }
  });

/**
 * Admin: Update image metadata (title, keywords) in gallery-metadata.json
 * Commits and pushes changes to GitHub.
 */
exports.adminUpdateImageMetadata = functions
  .runWith({ memory: '1GB', timeoutSeconds: 300, secrets: ['GITHUB_TOKEN'] })
  .https.onCall(async (data, context) => {
    await verifyAdmin(context);

    const { imageId, title, keywords, ngssStandards } = data;
    if (!imageId && imageId !== 0) {
      throw new functions.https.HttpsError('invalid-argument', 'imageId is required');
    }
    if (title !== undefined && typeof title !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'title must be a string');
    }
    if (keywords !== undefined && !Array.isArray(keywords)) {
      throw new functions.https.HttpsError('invalid-argument', 'keywords must be an array');
    }
    if (ngssStandards !== undefined) {
      if (typeof ngssStandards !== 'object' || Array.isArray(ngssStandards)) {
        throw new functions.https.HttpsError('invalid-argument', 'ngssStandards must be an object');
      }
      const validGrades = ['kindergarten', 'grade1', 'grade2', 'grade3', 'grade4', 'grade5'];
      for (const [grade, standards] of Object.entries(ngssStandards)) {
        if (!validGrades.includes(grade)) {
          throw new functions.https.HttpsError('invalid-argument', `Invalid grade level: ${grade}`);
        }
        if (!Array.isArray(standards)) {
          throw new functions.https.HttpsError('invalid-argument', `Standards for ${grade} must be an array`);
        }
      }
    }

    console.log(`✏️  Admin updating metadata for image ID: ${imageId}`);

    const tempDir = os.tmpdir();
    const repoDir = path.join(tempDir, 'sias2-admin-update');

    try {
      try { await fs.rm(repoDir, { recursive: true, force: true }); } catch (e) {}

      const githubToken = process.env.GITHUB_TOKEN;
      const repoUrl = `https://${githubToken}@github.com/Educ8r-Cre8r/sias2.git`;
      const git = simpleGit();
      await git.clone(repoUrl, repoDir, ['--depth', '1']);
      const repoGit = simpleGit(repoDir);
      await repoGit.addConfig('user.name', 'SIAS Admin');
      await repoGit.addConfig('user.email', ADMIN_EMAIL);

      const metadataPath = path.join(repoDir, 'gallery-metadata.json');
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));

      const image = metadata.images.find(img => img.id === imageId);
      if (!image) {
        throw new functions.https.HttpsError('not-found', `Image ${imageId} not found`);
      }

      const changes = [];
      if (title !== undefined && title.trim()) {
        image.title = title.trim();
        changes.push(`title: "${image.title}"`);
      }
      if (keywords !== undefined) {
        image.keywords = keywords.map(k => String(k).toLowerCase().trim()).filter(k => k.length > 0);
        changes.push(`keywords: [${image.keywords.length} items]`);
      }
      if (ngssStandards !== undefined) {
        image.ngssStandards = {};
        const validGrades = ['kindergarten', 'grade1', 'grade2', 'grade3', 'grade4', 'grade5'];
        for (const grade of validGrades) {
          image.ngssStandards[grade] = (ngssStandards[grade] || []).filter(s => typeof s === 'string' && s.length > 0);
        }
        const totalStandards = Object.values(image.ngssStandards).flat().length;
        changes.push(`ngssStandards: [${totalStandards} total]`);
      }

      if (changes.length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'No changes provided');
      }

      metadata.lastUpdated = new Date().toISOString();
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

      await repoGit.add('gallery-metadata.json');
      await repoGit.commit(`Update metadata for "${image.title}" (ID ${imageId})\n\nChanges: ${changes.join(', ')}\n\nUpdated via SIAS Admin Dashboard`);
      await repoGit.push('origin', 'main');

      console.log(`✅ Metadata updated and pushed for image ${imageId}`);

      try { await fs.rm(repoDir, { recursive: true, force: true }); } catch (e) {}

      return { success: true, imageId, title: image.title, keywords: image.keywords, ngssStandards: image.ngssStandards };
    } catch (error) {
      try { await fs.rm(repoDir, { recursive: true, force: true }); } catch (e) {}
      console.error('Update metadata error:', error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError('internal', 'Update failed: ' + error.message);
    }
  });

/**
 * Admin: Edit educational content for a specific image + grade level.
 * Saves updated content JSON, regenerates the PDF, backs up original, commits to GitHub.
 */
exports.adminEditContent = functions
  .runWith({ memory: '1GB', timeoutSeconds: 540, secrets: ['GITHUB_TOKEN'] })
  .https.onCall(async (data, context) => {
    await verifyAdmin(context);

    const { imageId, gradeLevel, content } = data;

    if (!imageId && imageId !== 0) {
      throw new functions.https.HttpsError('invalid-argument', 'imageId is required');
    }
    if (!gradeLevel || typeof gradeLevel !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'gradeLevel is required');
    }
    if (!content || typeof content !== 'string' || content.trim().length < 50) {
      throw new functions.https.HttpsError('invalid-argument', 'content is required and must be substantial');
    }

    const isEDP = gradeLevel === 'edp';
    const validGrades = GRADE_LEVELS.map(g => g.key);
    if (!isEDP && !validGrades.includes(gradeLevel)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid gradeLevel: ' + gradeLevel);
    }

    const gradeLabel = isEDP ? 'EDP' : GRADE_LEVELS.find(g => g.key === gradeLevel)?.name || gradeLevel;
    console.log(`✏️  Admin editing ${gradeLabel} content for image ID: ${imageId}`);

    const tempDir = os.tmpdir();
    const repoDir = path.join(tempDir, 'sias2-admin-content-edit');

    try {
      try { await fs.rm(repoDir, { recursive: true, force: true }); } catch (e) {}

      const githubToken = process.env.GITHUB_TOKEN;
      const repoUrl = `https://${githubToken}@github.com/Educ8r-Cre8r/sias2.git`;
      const git = simpleGit();
      await git.clone(repoUrl, repoDir, ['--depth', '1']);
      const repoGit = simpleGit(repoDir);
      await repoGit.addConfig('user.name', 'SIAS Admin');
      await repoGit.addConfig('user.email', ADMIN_EMAIL);

      // Find image in metadata
      const metadataPath = path.join(repoDir, 'gallery-metadata.json');
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
      const image = metadata.images.find(img => img.id === imageId);
      if (!image) {
        throw new functions.https.HttpsError('not-found', `Image ${imageId} not found`);
      }

      const nameNoExt = image.filename.replace(/\.[^/.]+$/, '');
      const category = image.category;
      const suffix = isEDP ? 'edp' : gradeLevel;

      // Paths
      const contentJsonPath = path.join(repoDir, 'content', category, `${nameNoExt}-${suffix}.json`);
      const pdfPath = path.join(repoDir, 'pdfs', category, `${nameNoExt}-${suffix}.pdf`);

      // Read existing content JSON
      let existingJson;
      try {
        existingJson = JSON.parse(await fs.readFile(contentJsonPath, 'utf8'));
      } catch (e) {
        throw new functions.https.HttpsError('not-found', `Content file not found: ${nameNoExt}-${suffix}.json`);
      }

      // Backup original
      const backupDir = path.join(repoDir, 'content-backups', category);
      await fs.mkdir(backupDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `${nameNoExt}-${suffix}-${timestamp}.json`);
      await fs.writeFile(backupPath, JSON.stringify(existingJson, null, 2));

      // Update content JSON
      existingJson.content = content;
      existingJson.editedAt = new Date().toISOString();
      await fs.writeFile(contentJsonPath, JSON.stringify(existingJson, null, 2));

      // Regenerate PDF — download image from Storage for cover image
      let pdfWarning = false;
      try {
        const galleryBucket = admin.storage().bucket(GALLERY_BUCKET);
        const tempImagePath = path.join(tempDir, `edit-${image.filename}`);
        await galleryBucket.file(`images/${category}/${image.filename}`).download({ destination: tempImagePath });

        const logoPath = path.join(repoDir, 'sias_logo.png');
        const storagePdfPath = `pdfs/${category}/${nameNoExt}-${suffix}.pdf`;

        let pdfBuffer;
        if (isEDP) {
          const { generateEDPpdf } = require('./edp-pdf-generator');
          pdfBuffer = await generateEDPpdf({
            title: image.title,
            category,
            markdownContent: content,
            imagePath: tempImagePath,
            logoPath
          });
        } else {
          const { generatePDF } = require('./pdf-generator');
          pdfBuffer = await generatePDF({
            title: image.title,
            category,
            gradeLevel,
            markdownContent: content,
            imagePath: tempImagePath,
            logoPath
          });
        }

        // Upload regenerated PDF to Storage instead of writing to git
        await uploadBufferToGalleryStorage(pdfBuffer, storagePdfPath, 'application/pdf');
        console.log(`   ✅ ${gradeLabel} PDF regenerated and uploaded to Storage`);

        await fs.rm(tempImagePath, { force: true });
      } catch (pdfErr) {
        console.warn(`   ⚠️ PDF regeneration failed (content still saved): ${pdfErr.message}`);
        pdfWarning = true;
      }

      // Commit and push
      await repoGit.add('.');
      await repoGit.commit(`Edit ${gradeLabel} content for "${image.title}" (ID ${imageId})\n\nEdited via SIAS Admin Dashboard`);
      await repoGit.push('origin', 'main');

      console.log(`✅ Content edited and pushed for image ${imageId} (${gradeLabel})`);

      try { await fs.rm(repoDir, { recursive: true, force: true }); } catch (e) {}

      return { success: true, imageId, gradeLevel, pdfWarning };
    } catch (error) {
      try { await fs.rm(repoDir, { recursive: true, force: true }); } catch (e) {}
      console.error('Edit content error:', error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError('internal', 'Edit failed: ' + error.message);
    }
  });

/**
 * Admin: Audit Firebase Storage for orphaned/missing files
 * Compares actual Storage files against expected files from metadata.
 */
exports.adminAuditStorage = functions
  .runWith({ memory: '512MB', timeoutSeconds: 120 })
  .https.onCall(async (data, context) => {
    await verifyAdmin(context);

    const images = data.images;
    if (!images || !Array.isArray(images)) {
      throw new functions.https.HttpsError('invalid-argument', 'images array is required');
    }

    console.log(`🔍 Admin storage audit: checking ${images.length} images...`);

    const bucket = admin.storage().bucket();
    const grades = ['kindergarten', 'first-grade', 'second-grade', 'third-grade', 'fourth-grade', 'fifth-grade'];

    // Build expected files set from metadata
    const expectedFiles = new Set();
    for (const image of images) {
      const { filename, category } = image;
      if (!filename || !category) continue;
      const nameNoExt = filename.replace(/\.[^.]+$/, '');

      expectedFiles.add(`images/${category}/${filename}`);
      expectedFiles.add(`images/${category}/thumbs/${filename}`);
      expectedFiles.add(`images/${category}/webp/${nameNoExt}.webp`);
      expectedFiles.add(`images/${category}/placeholders/${filename}`);

      expectedFiles.add(`content/${category}/${nameNoExt}.json`);
      grades.forEach(g => expectedFiles.add(`content/${category}/${nameNoExt}-${g}.json`));
      expectedFiles.add(`content/${category}/${nameNoExt}-edp.json`);

      expectedFiles.add(`hotspots/${category}/${nameNoExt}.json`);

      grades.forEach(g => expectedFiles.add(`pdfs/${category}/${nameNoExt}-${g}.pdf`));
      expectedFiles.add(`pdfs/${category}/${nameNoExt}-edp.pdf`);
    }

    // List actual files in Storage
    const prefixes = ['images/', 'content/', 'hotspots/', 'pdfs/'];
    const actualFiles = new Map();

    for (const prefix of prefixes) {
      try {
        const [files] = await bucket.getFiles({ prefix });
        for (const file of files) {
          if (file.name.endsWith('/')) continue;
          if (file.name.startsWith('uploads/') || file.name.startsWith('processed/') ||
              file.name.startsWith('failed/') || file.name.startsWith('duplicates/')) continue;
          actualFiles.set(file.name, parseInt(file.metadata.size || 0));
        }
      } catch (e) {
        console.error(`Error listing ${prefix}:`, e);
      }
    }

    // Compare
    const orphaned = [];
    for (const [filePath, size] of actualFiles) {
      if (!expectedFiles.has(filePath)) {
        orphaned.push({ path: filePath, size });
      }
    }

    const missing = [];
    for (const expectedPath of expectedFiles) {
      if (!actualFiles.has(expectedPath)) {
        missing.push({ path: expectedPath });
      }
    }

    console.log(`✅ Audit complete: ${orphaned.length} orphaned, ${missing.length} missing`);

    return {
      success: true,
      totalExpected: expectedFiles.size,
      totalActual: actualFiles.size,
      orphaned,
      missing,
      orphanedCount: orphaned.length,
      missingCount: missing.length,
      orphanedSize: orphaned.reduce((sum, f) => sum + f.size, 0)
    };
  });

/**
 * Admin: Get GitHub Actions deploy status
 * Proxies the GitHub API to keep the token server-side.
 */
exports.adminGetDeployStatus = functions
  .runWith({ memory: '256MB', timeoutSeconds: 15, secrets: ['GITHUB_TOKEN'] })
  .https.onCall(async (data, context) => {
    await verifyAdmin(context);

    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      throw new functions.https.HttpsError('internal', 'GitHub token not configured');
    }

    try {
      const response = await fetch(
        'https://api.github.com/repos/Educ8r-Cre8r/sias2/actions/runs?per_page=5',
        {
          headers: {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'SIAS-Admin-Dashboard'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const json = await response.json();

      const runs = (json.workflow_runs || []).map(run => ({
        id: run.id,
        runNumber: run.run_number,
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        htmlUrl: run.html_url,
        commitMessage: run.head_commit?.message || ''
      }));

      return { runs };
    } catch (error) {
      console.error('Deploy status error:', error);
      throw new functions.https.HttpsError('internal', 'Failed to fetch deploy status: ' + error.message);
    }
  });

/**
 * Admin: Update hotspot positions for a specific image.
 * Saves updated hotspot JSON and commits to GitHub.
 */
exports.adminUpdateHotspots = functions
  .runWith({ memory: '1GB', timeoutSeconds: 300, secrets: ['GITHUB_TOKEN'] })
  .https.onCall(async (data, context) => {
    await verifyAdmin(context);

    const { imageId, hotspots } = data;

    if (!imageId && imageId !== 0) {
      throw new functions.https.HttpsError('invalid-argument', 'imageId is required');
    }
    if (!Array.isArray(hotspots) || hotspots.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'hotspots array is required');
    }

    // Validate hotspot structure
    for (const h of hotspots) {
      if (!h.id || !h.x || !h.y || !h.label) {
        throw new functions.https.HttpsError('invalid-argument',
          `Hotspot ${h.id || '?'} missing required fields (id, x, y, label)`);
      }
      const x = parseInt(h.x);
      const y = parseInt(h.y);
      if (isNaN(x) || isNaN(y) || x < 0 || x > 100 || y < 0 || y > 100) {
        throw new functions.https.HttpsError('invalid-argument',
          `Hotspot ${h.id} has coordinates out of range (0-100%)`);
      }
    }

    console.log(`🎯 Admin updating hotspots for image ID: ${imageId}`);

    const tempDir = os.tmpdir();
    const repoDir = path.join(tempDir, 'sias2-admin-hotspots');

    try {
      try { await fs.rm(repoDir, { recursive: true, force: true }); } catch (e) {}

      const githubToken = process.env.GITHUB_TOKEN;
      const repoUrl = `https://${githubToken}@github.com/Educ8r-Cre8r/sias2.git`;
      const git = simpleGit();
      await git.clone(repoUrl, repoDir, ['--depth', '1']);
      const repoGit = simpleGit(repoDir);
      await repoGit.addConfig('user.name', 'SIAS Admin');
      await repoGit.addConfig('user.email', ADMIN_EMAIL);

      // Find image in metadata
      const metadataPath = path.join(repoDir, 'gallery-metadata.json');
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
      const image = metadata.images.find(img => img.id === imageId);
      if (!image) {
        throw new functions.https.HttpsError('not-found', `Image ${imageId} not found`);
      }

      const nameNoExt = image.filename.replace(/\.[^/.]+$/, '');
      const category = image.category;

      // Build hotspot file path
      const hotspotDir = path.join(repoDir, 'hotspots', category);
      const hotspotFilePath = path.join(hotspotDir, `${nameNoExt}.json`);

      // Ensure directory exists
      await fs.mkdir(hotspotDir, { recursive: true });

      // Write updated hotspot JSON
      const hotspotData = { hotspots };
      await fs.writeFile(hotspotFilePath, JSON.stringify(hotspotData, null, 2));
      console.log(`✅ Updated hotspot file: hotspots/${category}/${nameNoExt}.json`);

      // Commit and push only the hotspot file
      await repoGit.add(`hotspots/${category}/${nameNoExt}.json`);
      await repoGit.commit(
        `Update hotspot positions for "${image.title}" (ID ${imageId})\n\n` +
        `- Updated ${hotspots.length} hotspot positions\n` +
        `- Category: ${category}\n\n` +
        `Updated via SIAS Admin Dashboard`
      );
      await repoGit.push('origin', 'main');

      console.log(`✅ Hotspots updated and pushed for image ${imageId}`);

      try { await fs.rm(repoDir, { recursive: true, force: true }); } catch (e) {}

      return { success: true, imageId, hotspotCount: hotspots.length };
    } catch (error) {
      try { await fs.rm(repoDir, { recursive: true, force: true }); } catch (e) {}
      console.error('Update hotspots error:', error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError('internal', 'Update failed: ' + error.message);
    }
  });

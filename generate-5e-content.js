#!/usr/bin/env node

/**
 * 5E Lesson Plan Content Generator for Science In A Snapshot
 *
 * Generates 5E instructional model lesson plans for all photos using the Claude API.
 * Each photo gets 6 API calls (one per grade level: K-5), producing grade-specific
 * 5E lesson plans based on the photograph.
 *
 * Usage:
 *   node generate-5e-content.js              # Full batch (~168 images × 6 grades)
 *   node generate-5e-content.js --dry-run    # Preview without API calls
 *   node generate-5e-content.js --limit=5    # First 5 images
 *   node generate-5e-content.js --category=life-science  # One category
 *   node generate-5e-content.js --resume     # Skip images that already have 5E content
 */

require('dotenv').config({ override: true });
const fs = require('fs').promises;
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

// Try to load sharp for image metadata detection
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  sharp = null;
}

// ============================================================
// Configuration
// ============================================================

const GRADE_LEVELS = [
  { key: 'kindergarten', name: 'Kindergarten', ngssGrade: 'K' },
  { key: 'first-grade', name: 'First Grade', ngssGrade: '1' },
  { key: 'second-grade', name: 'Second Grade', ngssGrade: '2' },
  { key: 'third-grade', name: 'Third Grade', ngssGrade: '3' },
  { key: 'fourth-grade', name: 'Fourth Grade', ngssGrade: '4' },
  { key: 'fifth-grade', name: 'Fifth Grade', ngssGrade: '5' }
];

const CATEGORY_TO_NGSS_DOMAIN = {
  'physical-science': 'PS',
  'life-science': 'LS',
  'earth-space-science': 'ESS'
};

// Complete K-5 NGSS Performance Expectations (same as functions/index.js)
const NGSS_PE_STANDARDS = {
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
    const domainMatch = code.match(/-([A-Z]+)\d/);
    if (!domainMatch) continue;
    const codeDomain = domainMatch[1];
    if (codeDomain !== domainPrefix) continue;
    const codeGrade = code.split('-')[0];
    if (codeGrade === ngssGrade) {
      filtered[code] = statement;
    }
  }
  return filtered;
}

// ============================================================
// 5E Lesson Plan Prompts
// ============================================================

const FIVE_E_SYSTEM_PROMPT = `You are an expert K-5 Science Curriculum Developer specializing in the 5E Instructional Model (Engage, Explore, Explain, Elaborate, Evaluate). You create grade-appropriate, NGSS-aligned 5E lesson plans based on science photographs.

## Core Principles
1. Every lesson must be directly inspired by what is visible or inferable from the photograph.
2. Activities must be age-appropriate, safe, and use classroom-available materials.
3. All NGSS connections must use only standards from the specified grade level and science domain.
4. The 5E phases must flow logically — each phase builds on the previous one.
5. Language complexity must match the target grade level.
6. Include concrete, actionable teacher directions — not vague suggestions.

## Tone
Professional yet approachable. Write as if advising a colleague teacher who needs a ready-to-use lesson plan.`;

function build5EUserPrompt(category, filename, grade) {
  const domainPrefix = CATEGORY_TO_NGSS_DOMAIN[category] || '';
  const domainName = { 'PS': 'Physical Science', 'LS': 'Life Science', 'ESS': 'Earth and Space Science' }[domainPrefix] || category;
  const domainTopics = category === 'physical-science'
    ? 'forces, motion, energy, matter, properties of materials, waves, light, sound, shadows, electricity, magnetism'
    : category === 'life-science'
      ? 'living organisms, life cycles, habitats, body structures, ecosystems, heredity, adaptation, survival'
      : 'rocks, minerals, weather, water cycle, landforms, erosion, natural resources, space, Earth systems';

  const filteredStandards = getFilteredNGSSStandards(category, grade.ngssGrade);
  const standardsList = Object.entries(filteredStandards)
    .map(([code, statement]) => `- ${code}: ${statement}`)
    .join('\n');

  return `Analyze this science education photograph and generate a complete 5E Lesson Plan.

Category: ${category}
Photo: ${filename}
Grade Level: ${grade.name}
NGSS Domain: ${domainName} (${domainPrefix} codes only)

### CRITICAL DOMAIN CONSTRAINT
This image is categorized as **${category}**. You MUST create the lesson through the lens of ${domainName.toLowerCase()} concepts.
- Focus on: ${domainTopics}
- Only use NGSS standards with ${domainPrefix} domain codes for grade ${grade.ngssGrade}.

### Available NGSS Performance Expectations for ${grade.name} (${domainPrefix} domain)
${standardsList || 'No specific PE standards for this grade/domain combination. Use general science practices.'}

Generate ALL of the following sections using ### headers. No exceptions.

### Core Science Concepts from Image Analysis
Identify 3-4 key ${domainName.toLowerCase()} concepts visible or inferable from this photograph that are appropriate for ${grade.name}. Use bullet points.

### Lesson Title
Create a short, engaging, creative lesson title appropriate for ${grade.name} students. Just the title — no extra text.

### Lesson Overview
Provide these details:
- **Grade Level:** ${grade.name}
- **Subject:** Science (${domainName})
- **Time Allotment:** Estimate total time (e.g., "Two 45-minute sessions" or "60-90 minutes")
- **NGSS Standards:** List 1-3 relevant NGSS PE codes from the list above

### Learning Objectives
Write 3-4 measurable learning objectives using age-appropriate language for ${grade.name}. Begin each with "Students will be able to..."

### 5E Lesson Sequence

#### 1. ENGAGE (10-15 minutes)
- **Objective:** Capture student interest and activate prior knowledge using the photograph.
- **Materials:** List specific materials needed.
- **Activity:** Describe exactly how to use this photograph to hook students. Include:
  - How to display/introduce the photograph
  - 3-4 specific discussion questions to spark curiosity (calibrated to ${grade.name} level)
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
  - Key vocabulary with ${grade.name}-friendly definitions (3-5 terms)
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
  - Is appropriately challenging for ${grade.name}
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

// ============================================================
// CLI Argument Parsing
// ============================================================

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    resume: args.includes('--resume'),
    limit: parseInt((args.find(a => a.startsWith('--limit=')) || '').split('=')[1]) || Infinity,
    category: (args.find(a => a.startsWith('--category=')) || '').split('=')[1] || null,
    help: args.includes('--help') || args.includes('-h')
  };
}

function formatTime(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// Content Generation
// ============================================================

async function generate5EContent(anthropic, imagePath, filename, category, grade) {
  // Read image as base64
  const imageBuffer = await fs.readFile(imagePath);
  const imageBase64 = imageBuffer.toString('base64');

  // Detect media type
  let mediaType = 'image/jpeg';
  if (sharp) {
    try {
      const metadata = await sharp(imagePath).metadata();
      mediaType = `image/${metadata.format}`;
    } catch (e) {
      // Fall back to jpeg
    }
  } else {
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.png') mediaType = 'image/png';
    else if (ext === '.webp') mediaType = 'image/webp';
    else if (ext === '.gif') mediaType = 'image/gif';
  }

  const userPrompt = build5EUserPrompt(category, filename, grade);

  // Retry with exponential backoff (3 attempts: 5s, 15s, 45s)
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [5000, 15000, 45000];
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        system: FIVE_E_SYSTEM_PROMPT,
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

      return {
        content: response.content[0].text,
        inputTokens,
        outputTokens,
        cost
      };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt - 1];
        console.warn(`    ⚠️ Retry ${attempt}/${MAX_RETRIES} for ${grade.name} after error: ${err.message} (waiting ${delay / 1000}s)`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// ============================================================
// Main
// ============================================================

async function main() {
  const config = parseArgs();

  if (config.help) {
    console.log(`
🟣 5E Lesson Plan Content Generator

Usage: node generate-5e-content.js [options]

Options:
  --dry-run            Preview what would be generated (no API calls)
  --limit=N            Process only the first N images
  --category=NAME      Only process one category
  --resume             Skip images that already have 5E content
  --help, -h           Show this help message
    `);
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY && !config.dryRun) {
    console.error('Error: ANTHROPIC_API_KEY environment variable not set');
    console.log('Set it in .env or: export ANTHROPIC_API_KEY=your_key_here');
    process.exit(1);
  }

  const startTime = Date.now();

  console.log('');
  console.log('🟣 ============================================');
  console.log('   SIAS 5E Lesson Plan Content Generator');
  console.log('   ============================================');
  console.log('');

  // Read gallery metadata
  const metadataPath = path.join(__dirname, 'gallery-metadata.json');
  const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));

  // Filter images
  let images = metadata.images.filter(img => img.hasContent);
  if (config.category) {
    images = images.filter(img => img.category === config.category);
    console.log(`📁 Category filter: ${config.category}`);
  }
  if (config.limit < Infinity) {
    images = images.slice(0, config.limit);
    console.log(`🔢 Limit: ${config.limit} images`);
  }

  const totalCalls = images.length * GRADE_LEVELS.length;
  console.log(`📊 Images: ${images.length} | Grades: ${GRADE_LEVELS.length} | Total API calls: ${totalCalls}`);
  if (config.dryRun) console.log('🏃 DRY RUN — no API calls will be made');
  if (config.resume) console.log('⏩ Resume mode — skipping existing 5E content');
  console.log('');

  const anthropic = config.dryRun ? null : new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  let totalCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let callIndex = 0;

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const baseFilename = path.parse(image.filename).name;

    for (const grade of GRADE_LEVELS) {
      callIndex++;
      const contentPath = path.join(__dirname, 'content', image.category, `${baseFilename}-5e-${grade.key}.json`);

      // Resume: skip if already exists
      if (config.resume && await fileExists(contentPath)) {
        skipped++;
        continue;
      }

      // Dry run
      if (config.dryRun) {
        console.log(`  [${callIndex}/${totalCalls}] Would generate: content/${image.category}/${baseFilename}-5e-${grade.key}.json`);
        generated++;
        continue;
      }

      const itemStart = Date.now();

      try {
        // Find the image file
        const imagePath = path.join(__dirname, image.imagePath);
        if (!await fileExists(imagePath)) {
          console.error(`  [${callIndex}/${totalCalls}] SKIP: Image not found — ${image.imagePath}`);
          failed++;
          continue;
        }

        console.log(`  [${callIndex}/${totalCalls}] ${image.title} — ${grade.name}...`);

        const result = await generate5EContent(anthropic, imagePath, image.filename, image.category, grade);

        // Save as JSON
        const fiveEData = {
          title: image.title,
          category: image.category,
          imageFile: image.filename,
          imagePath: image.imagePath,
          gradeLevel: grade.name,
          gradeLevelKey: grade.key,
          content: result.content,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          cost: result.cost,
          generatedAt: new Date().toISOString()
        };

        // Ensure content directory exists
        const contentDir = path.dirname(contentPath);
        await fs.mkdir(contentDir, { recursive: true });

        await fs.writeFile(contentPath, JSON.stringify(fiveEData, null, 2));

        totalCost += result.cost;
        totalInputTokens += result.inputTokens;
        totalOutputTokens += result.outputTokens;
        generated++;

        const elapsed = Date.now() - itemStart;
        console.log(`    ✅ Done (${result.inputTokens} in / ${result.outputTokens} out, $${result.cost.toFixed(4)}, ${formatTime(elapsed)})`);

        // Rate limit delay
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (err) {
        failed++;
        console.error(`  [${callIndex}/${totalCalls}] ❌ FAILED: ${image.title} ${grade.name} — ${err.message}`);
      }
    }
  }

  // Summary
  const totalTime = Date.now() - startTime;
  console.log('');
  console.log('🟣 ============================================');
  console.log(`   ✅ Generated: ${generated}`);
  if (skipped > 0) console.log(`   ⏩ Skipped:   ${skipped}`);
  if (failed > 0)  console.log(`   ❌ Failed:    ${failed}`);
  console.log(`   ⏱️  Time:      ${formatTime(totalTime)}`);
  if (!config.dryRun && generated > 0) {
    console.log(`   🪙 Tokens:    ${totalInputTokens.toLocaleString()} in / ${totalOutputTokens.toLocaleString()} out`);
    console.log(`   💰 Cost:      $${totalCost.toFixed(4)}`);
    console.log(`   📄 Avg/call:  $${(totalCost / generated).toFixed(4)}`);
  }
  console.log('   ============================================');
  console.log('');

  if (failed > 0) {
    console.log('⚠️  Some calls failed. Re-run with --resume to retry only missing files.');
  }

  if (!config.dryRun && generated > 0) {
    console.log(`📁 Output: content/{category}/{name}-5e-{grade}.json (${generated} files)`);
    console.log('Next step: node generate-5e-pdfs.js');
    console.log('');
  }
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});

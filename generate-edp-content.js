#!/usr/bin/env node

/**
 * Engineering Design Process Content Generator for Science In A Snapshot
 *
 * Generates engineering challenge content for all photos using the Claude API.
 * Each photo gets ONE call that produces both K-2 and 3-5 grade band tasks.
 *
 * Usage:
 *   node generate-edp-content.js              # Full batch (~150 images)
 *   node generate-edp-content.js --dry-run    # Preview without API calls
 *   node generate-edp-content.js --limit=5    # First 5 images
 *   node generate-edp-content.js --category=life-science  # One category
 *   node generate-edp-content.js --resume     # Skip images that already have EDP content
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

const CATEGORIES = ['life-science', 'earth-space-science', 'physical-science'];

// The engineering design process system prompt
const EDP_SYSTEM_PROMPT = `You are an NGSS Engineering Design Process (EDP) Coach. Teachers upload any photograph (classroom, nature, objects, etc.). Your job: transform it into a grade-appropriate engineering challenge based on what is visible in the image.

## Core Rules

1. **Visible elements only** - List only what is directly observable in the photo. Do not invent objects, materials, or creatures that are not shown.
2. **Reasonable inferences allowed** - You may make logical connections from visible elements (e.g., a spider on dry soil implies the creature needs shelter; a stack of books implies weight and balance). Label these clearly as inferences, separate from direct observations.
3. **Invent a task** - If the photo shows no engineering activity, create a realistic EDP challenge inspired by visible elements and reasonable inferences.
4. **Grade-adapt** -
   - **K-2**: Use concrete nouns, simple verbs, no technical terms. Frame as playful building tasks ("Make a bridge for bugs").
   - **3-5**: Include specific constraints and criteria ("Design a 10cm-wide shelter that withstands wind using only natural materials"). Use measurable success conditions.
5. **No false context** - Never reference students, classrooms, or ongoing projects unless the photo clearly shows them.
6. **Ambiguity rule** - If fewer than 3 distinct elements are visible in the photo, offer 2 task options ranked by plausibility.

## What You Must Never Do

- Invent elements not visible in the photo.
- Assume the photo shows student work or an active project when no people or projects are visible.
- Use engineering jargon for K-2 tasks (avoid "prototype," "constraints," "criteria" at this level).
- Skip any section of the required output structure.

## Tone

Practical, coach-like, and jargon-free. Write as if speaking directly to a busy teacher who needs something they can use immediately.`;

const EDP_USER_PROMPT = `Analyze this science education photo and generate an engineering design process challenge.

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

async function generateEDPContent(anthropic, imagePath, filename, category) {
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

  // Build the user prompt with photo-specific details
  const userPrompt = EDP_USER_PROMPT
    .replace('{category}', category)
    .replace('{filename}', filename);

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

  return {
    content: response.content[0].text,
    inputTokens,
    outputTokens,
    cost
  };
}

// ============================================================
// Main
// ============================================================

async function main() {
  const config = parseArgs();

  if (config.help) {
    console.log(`
Engineering Design Process Content Generator

Usage: node generate-edp-content.js [options]

Options:
  --dry-run            Preview what would be generated (no API calls)
  --limit=N            Process only the first N images
  --category=NAME      Only process one category
  --resume             Skip images that already have EDP content
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
  console.log('============================================');
  console.log('   SIAS EDP Content Generator');
  console.log('============================================');
  console.log('');

  // Read gallery metadata
  const metadataPath = path.join(__dirname, 'gallery-metadata.json');
  const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));

  // Filter images
  let images = metadata.images.filter(img => img.hasContent);
  if (config.category) {
    images = images.filter(img => img.category === config.category);
    console.log(`Category filter: ${config.category}`);
  }
  if (config.limit < Infinity) {
    images = images.slice(0, config.limit);
    console.log(`Limit: ${config.limit} images`);
  }

  console.log(`Images to process: ${images.length}`);
  if (config.dryRun) console.log('DRY RUN — no API calls will be made');
  if (config.resume) console.log('Resume mode — skipping existing EDP content');
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

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const baseFilename = path.parse(image.filename).name;
    const edpContentPath = path.join(__dirname, 'content', image.category, `${baseFilename}-edp.json`);

    // Resume: skip if already exists
    if (config.resume && await fileExists(edpContentPath)) {
      skipped++;
      continue;
    }

    // Dry run
    if (config.dryRun) {
      console.log(`  [${i + 1}/${images.length}] Would generate: content/${image.category}/${baseFilename}-edp.json`);
      generated++;
      continue;
    }

    const itemStart = Date.now();

    try {
      // Find the image file
      const imagePath = path.join(__dirname, image.imagePath);
      if (!await fileExists(imagePath)) {
        console.error(`  [${i + 1}/${images.length}] SKIP: Image not found — ${image.imagePath}`);
        failed++;
        continue;
      }

      console.log(`  [${i + 1}/${images.length}] Generating EDP content for: ${image.title}...`);

      const result = await generateEDPContent(anthropic, imagePath, image.filename, image.category);

      // Save as JSON
      const edpData = {
        title: image.title,
        category: image.category,
        imageFile: image.filename,
        imagePath: image.imagePath,
        content: result.content,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cost: result.cost,
        generatedAt: new Date().toISOString()
      };

      // Ensure content directory exists
      const contentDir = path.dirname(edpContentPath);
      await fs.mkdir(contentDir, { recursive: true });

      await fs.writeFile(edpContentPath, JSON.stringify(edpData, null, 2));

      totalCost += result.cost;
      totalInputTokens += result.inputTokens;
      totalOutputTokens += result.outputTokens;
      generated++;

      const elapsed = Date.now() - itemStart;
      console.log(`    Done (${result.inputTokens} in / ${result.outputTokens} out, $${result.cost.toFixed(4)}, ${formatTime(elapsed)})`);

      // Rate limit delay
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (err) {
      failed++;
      console.error(`  [${i + 1}/${images.length}] FAILED: ${image.title} — ${err.message}`);
    }
  }

  // Summary
  const totalTime = Date.now() - startTime;
  console.log('');
  console.log('============================================');
  console.log(`   Generated: ${generated}`);
  if (skipped > 0) console.log(`   Skipped:   ${skipped}`);
  if (failed > 0)  console.log(`   Failed:    ${failed}`);
  console.log(`   Time:      ${formatTime(totalTime)}`);
  if (!config.dryRun && generated > 0) {
    console.log(`   Tokens:    ${totalInputTokens.toLocaleString()} in / ${totalOutputTokens.toLocaleString()} out`);
    console.log(`   Cost:      $${totalCost.toFixed(4)}`);
    console.log(`   Avg/image: $${(totalCost / generated).toFixed(4)}`);
  }
  console.log('============================================');
  console.log('');

  if (failed > 0) {
    console.log('Some images failed. Re-run with --resume to retry only missing files.');
  }

  if (!config.dryRun && generated > 0) {
    console.log(`Output: content/{category}/{name}-edp.json (${generated} files)`);
    console.log('Next step: node generate-edp-pdfs.js');
    console.log('');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

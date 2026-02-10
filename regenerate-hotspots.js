#!/usr/bin/env node

/**
 * Regenerate hotspots for existing images using the updated prompt
 * with NGSS standards, category context, and vocabulary scaffolding.
 *
 * Usage:
 *   node regenerate-hotspots.js [--limit N] [--start-id N] [--dry-run]
 *
 * Requires ANTHROPIC_API_KEY environment variable.
 */

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

// Parse CLI args
const args = process.argv.slice(2);
const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : null;
const startId = args.includes('--start-id') ? parseInt(args[args.indexOf('--start-id') + 1]) : 1;
const dryRun = args.includes('--dry-run');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY environment variable is required');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const ROOT_DIR = __dirname;

function getCategoryExamples(category) {
  switch (category) {
    case 'life-science':
      return 'living organisms, habitats, body structures, life cycles, and ecosystems';
    case 'earth-space-science':
      return 'rocks, weather, water, landforms, and space';
    case 'physical-science':
      return 'forces, motion, energy, matter, and physical properties';
    default:
      return 'scientific concepts';
  }
}

function formatCategory(category) {
  return category.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

async function regenerateHotspot(image) {
  const imagePath = path.join(ROOT_DIR, image.imagePath);

  if (!fs.existsSync(imagePath)) {
    console.log(`   ⚠️  Image file not found: ${imagePath}`);
    return null;
  }

  // Read image as base64
  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString('base64');

  // Determine media type
  const ext = path.extname(image.filename).toLowerCase();
  const mediaType = ext === '.png' ? 'image/png'
    : ext === '.webp' ? 'image/webp'
    : 'image/jpeg';

  // Flatten NGSS standards from all grade levels into a unique list
  const ngssStandards = image.ngssStandards
    ? [...new Set(Object.values(image.ngssStandards).flat())]
    : [];

  const categoryDisplay = formatCategory(image.category);
  const categoryExamples = getCategoryExamples(image.category);

  const ngssContext = ngssStandards.length > 0
    ? `\nThe following NGSS standards have been identified for this image: ${ngssStandards.join(', ')}. Each hotspot fact should connect to one of these standards or their underlying disciplinary core ideas.`
    : '';

  const prompt = `Analyze this ${categoryDisplay} image and create interactive hotspots for elementary students (grades K-5).

This image belongs to the "${categoryDisplay}" category. Focus your hotspots on ${categoryDisplay.toLowerCase()} concepts — for example, ${categoryExamples}.
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

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    temperature: 1.0,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: imageBase64 }
        },
        { type: 'text', text: prompt }
      ]
    }]
  });

  // Calculate cost
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cost = (inputTokens * 0.001 / 1000) + (outputTokens * 0.005 / 1000);

  // Parse response
  let responseText = response.content[0].text;
  let hotspotData;
  try {
    hotspotData = JSON.parse(responseText);
  } catch {
    const start = responseText.indexOf('{');
    const end = responseText.lastIndexOf('}') + 1;
    if (start !== -1 && end > start) {
      hotspotData = JSON.parse(responseText.substring(start, end));
    } else {
      throw new Error('Could not parse JSON from response');
    }
  }

  if (!hotspotData.hotspots || hotspotData.hotspots.length < 3) {
    throw new Error(`Only got ${hotspotData.hotspots?.length || 0} hotspots`);
  }

  return { hotspotData, cost };
}

async function main() {
  // Load metadata
  const metadataPath = path.join(ROOT_DIR, 'gallery-metadata.json');
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

  // Filter images
  let images = metadata.images
    .filter(img => img.hasContent && img.id >= startId)
    .sort((a, b) => a.id - b.id);

  if (limit) {
    images = images.slice(0, limit);
  }

  console.log(`\n🎯 Regenerating hotspots for ${images.length} images (starting at id ${startId})`);
  if (dryRun) console.log('   (DRY RUN — no files will be written)\n');
  else console.log();

  let totalCost = 0;
  let success = 0;
  let failed = 0;

  for (const image of images) {
    const baseFilename = path.parse(image.filename).name;
    const hotspotDir = path.join(ROOT_DIR, 'hotspots', image.category);
    const hotspotFilePath = path.join(hotspotDir, `${baseFilename}.json`);

    process.stdout.write(`[${image.id}/${metadata.totalImages}] ${image.title} (${image.category})... `);

    try {
      const result = await regenerateHotspot(image);
      if (!result) {
        failed++;
        continue;
      }

      const { hotspotData, cost } = result;
      totalCost += cost;

      if (!dryRun) {
        fs.mkdirSync(hotspotDir, { recursive: true });
        fs.writeFileSync(hotspotFilePath, JSON.stringify(hotspotData, null, 2));
      }

      const hotspotCount = hotspotData.hotspots.length;
      console.log(`✅ ${hotspotCount} hotspots ($${cost.toFixed(4)})`);

      // Preview vocabulary for first few
      if (success < 3) {
        for (const h of hotspotData.hotspots) {
          console.log(`      🔹 "${h.label}" → vocab: ${h.vocabulary?.term || 'none'}`);
        }
      }

      success++;

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1500));

    } catch (error) {
      console.log(`❌ ${error.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Done! ${success} succeeded, ${failed} failed. Total cost: $${totalCost.toFixed(4)}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

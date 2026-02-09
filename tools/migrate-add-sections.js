#!/usr/bin/env node

/**
 * Migration Script: Add Cross-Curricular Ideas & STEM Career Connection
 *
 * Generates 4 missing sections for existing content files using Claude API:
 *   - Zoom In / Zoom Out Concepts
 *   - Potential Student Misconceptions
 *   - Cross-Curricular Ideas
 *   - STEM Career Connection
 *
 * Usage:
 *   node tools/migrate-add-sections.js --test              # Test on one file
 *   node tools/migrate-add-sections.js --run               # Process all files
 *   node tools/migrate-add-sections.js --dry-run           # Preview only
 *   node tools/migrate-add-sections.js --run --category=life-science  # One category
 */

import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import Anthropic from '@anthropic-ai/sdk';
import { createReadStream } from 'fs';
import readline from 'readline';

const require = createRequire(import.meta.url);
const { generatePDF } = require('../functions/pdf-generator');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------------------------------------------------------
// Configuration
// -------------------------------------------------------------------

const ROOT_DIR = path.join(__dirname, '..');
const CONTENT_DIR = path.join(ROOT_DIR, 'content');
const IMAGES_DIR = path.join(ROOT_DIR, 'images');
const PDFS_DIR = path.join(ROOT_DIR, 'pdfs');
const LOGO_PATH = path.join(ROOT_DIR, 'sias_logo.png');
const METADATA_PATH = path.join(ROOT_DIR, 'gallery-metadata.json');

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 2000;
const RATE_LIMIT_DELAY = 1000; // ms between API calls

const GRADE_LEVELS = [
  { key: 'kindergarten', name: 'Kindergarten' },
  { key: 'first-grade', name: 'First Grade' },
  { key: 'second-grade', name: 'Second Grade' },
  { key: 'third-grade', name: 'Third Grade' },
  { key: 'fourth-grade', name: 'Fourth Grade' },
  { key: 'fifth-grade', name: 'Fifth Grade' }
];

const CATEGORIES = ['life-science', 'earth-space-science', 'physical-science'];

// Sections we check for / generate
const MISSING_SECTION_PATTERNS = [
  { header: '## 🔍 Zoom In / Zoom Out', regex: /##\s*🔍\s*Zoom In\s*\/\s*Zoom Out/ },
  { header: '## 🤔 Potential Student Misconceptions', regex: /##\s*🤔\s*Potential Student Misconceptions/ },
  { header: '## 🔗 Cross-Curricular Ideas', regex: /##\s*🔗\s*Cross-Curricular Ideas/ },
  { header: '## 🚀 STEM Career Connection', regex: /##\s*🚀\s*STEM Career Connection/ }
];

// -------------------------------------------------------------------
// CLI Argument Parsing
// -------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    test: args.includes('--test'),
    run: args.includes('--run'),
    dryRun: args.includes('--dry-run'),
    category: (args.find(a => a.startsWith('--category=')) || '').split('=')[1] || null,
    help: args.includes('--help') || args.includes('-h')
  };
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function formatTime(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

async function fileExists(filePath) {
  try { await fs.access(filePath); return true; } catch { return false; }
}

/**
 * Determine which sections are missing from the markdown content.
 */
function getMissingSections(markdown) {
  if (!markdown) return MISSING_SECTION_PATTERNS;
  return MISSING_SECTION_PATTERNS.filter(s => !s.regex.test(markdown));
}

/**
 * Detect the educational key format used in a base JSON file.
 * Returns a mapping function: gradeKey -> baseKey
 */
function detectBaseKeyFormat(educational) {
  if (!educational) return (key) => key.replace(/-/g, '');
  // Check if it uses 'grade1' format or 'firstgrade' format
  if ('grade1' in educational || 'grade2' in educational) {
    return (key) => {
      const map = {
        'kindergarten': 'kindergarten',
        'first-grade': 'grade1',
        'second-grade': 'grade2',
        'third-grade': 'grade3',
        'fourth-grade': 'grade4',
        'fifth-grade': 'grade5'
      };
      return map[key] || key.replace(/-/g, '');
    };
  }
  // Default: 'firstgrade' format (from cloud function)
  return (key) => key.replace(/-/g, '');
}

/**
 * Build the prompt to generate only the missing sections.
 */
function buildMigrationPrompt(existingMarkdown, gradeName, missingSections) {
  const sectionPrompts = [];

  for (const section of missingSections) {
    if (section.header.includes('Zoom In')) {
      sectionPrompts.push(`## 🔍 Zoom In / Zoom Out Concepts
Provide two distinct perspectives:
1. **Zoom In:** A microscopic or unseen process (e.g., cellular level, atomic)
2. **Zoom Out:** The larger system connection (e.g., ecosystem, watershed, planetary)`);
    } else if (section.header.includes('Misconceptions')) {
      sectionPrompts.push(`## 🤔 Potential Student Misconceptions
List 1-3 common naive conceptions ${gradeName} students might have about this topic and provide the scientific clarification.`);
    } else if (section.header.includes('Cross-Curricular')) {
      sectionPrompts.push(`## 🔗 Cross-Curricular Ideas
Provide 3-4 ideas for connecting the science in this photo to other subjects like Math, ELA, Social Studies, or Art for a ${gradeName} classroom.`);
    } else if (section.header.includes('STEM Career')) {
      sectionPrompts.push(`## 🚀 STEM Career Connection
List and briefly describe 2-3 STEM careers that relate to the science shown in this photo. Describe the job simply for a ${gradeName} student. For each career, also provide an estimated average annual salary in USD.`);
    }
  }

  return `You are an expert K-5 Science Instructional Coach and NGSS Curriculum Specialist.

You previously generated educational content about a science photo for a **${gradeName}** class. Here is that existing content:

---
${existingMarkdown}
---

Now generate ONLY these additional sections. Match the tone, rigor, and grade-level appropriateness of the existing content.

${sectionPrompts.join('\n\n')}

Output ONLY the sections above with their ## headers. Do not repeat any existing sections. Do not include --- separators.`;
}

/**
 * Insert new sections into existing markdown content.
 * Inserts before "## 📚 External Resources" if present, otherwise appends.
 */
function insertSections(existingMarkdown, newSectionsMarkdown) {
  if (!newSectionsMarkdown || !newSectionsMarkdown.trim()) return existingMarkdown;

  // Clean up: remove leading/trailing whitespace and separators
  const cleanNew = newSectionsMarkdown.trim().replace(/^---\s*\n?/, '').replace(/\n?---\s*$/, '');

  // Try to insert before External Resources
  const resourcesMatch = existingMarkdown.match(/\n(---\s*\n)?##\s*📚\s*External Resources/);
  if (resourcesMatch) {
    const insertPos = existingMarkdown.indexOf(resourcesMatch[0]);
    return existingMarkdown.slice(0, insertPos) + '\n\n' + cleanNew + '\n\n' + existingMarkdown.slice(insertPos);
  }

  // Try to insert before trailing ---
  const trailingDash = existingMarkdown.lastIndexOf('\n---');
  if (trailingDash !== -1 && trailingDash > existingMarkdown.length - 20) {
    return existingMarkdown.slice(0, trailingDash) + '\n\n' + cleanNew + existingMarkdown.slice(trailingDash);
  }

  // Fallback: append
  return existingMarkdown + '\n\n' + cleanNew;
}

/**
 * Remove YouTube Videos entries from External Resources section.
 * Strips lines containing YouTube video references (title, description, URL).
 */
function stripYouTubeVideos(markdown) {
  if (!markdown) return markdown;

  // Remove "**YouTube Videos:**" header line and all subsequent lines until
  // the next section (##), separator (---), or end of content.
  // This handles multi-line YouTube entries with URLs, descriptions, etc.
  let result = markdown.replace(
    /\n*-?\s*\*\*YouTube Videos?:?\*\*.*?(?=\n##\s|\n---|\n\n-\s*\*\*[A-Z]|$)/gs,
    ''
  );

  // Also remove standalone YouTube URLs and their preceding description lines
  // that might not be under the bold header format
  result = result.replace(/\n\s*(?:- )?"?(?:https?:\/\/(?:www\.)?youtube\.com\/watch\S+|https?:\/\/youtu\.be\/\S+)"?\s*\n?/g, '\n');

  // Clean up multiple consecutive blank lines
  result = result.replace(/\n{3,}/g, '\n\n');

  return result;
}

// -------------------------------------------------------------------
// Main Migration Logic
// -------------------------------------------------------------------

async function main() {
  const config = parseArgs();

  if (config.help || (!config.test && !config.run && !config.dryRun)) {
    console.log(`
🔄 SIAS Migration: Add Missing Sections

Usage:
  node tools/migrate-add-sections.js --test                    Test on one file
  node tools/migrate-add-sections.js --run                     Process all files
  node tools/migrate-add-sections.js --run --category=NAME     One category only
  node tools/migrate-add-sections.js --dry-run                 Preview only
  --help, -h                                                   Show this help
`);
    return;
  }

  // Validate API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !config.dryRun) {
    console.error('❌ ANTHROPIC_API_KEY environment variable not set.');
    console.error('   Set it with: export ANTHROPIC_API_KEY="sk-ant-..."');
    process.exit(1);
  }

  const anthropic = config.dryRun ? null : new Anthropic({ apiKey });
  const startTime = Date.now();

  console.log('');
  console.log('🔄 ============================================');
  console.log('   SIAS Migration: Add Missing Sections');
  console.log('   ============================================');
  console.log(`   Model: ${MODEL}`);
  console.log(`   Mode:  ${config.test ? 'TEST (one file)' : config.dryRun ? 'DRY RUN' : 'FULL RUN'}`);
  if (config.category) console.log(`   Category: ${config.category}`);
  console.log('');

  // Read gallery metadata to get image list
  const metadata = JSON.parse(await fs.readFile(METADATA_PATH, 'utf8'));
  let images = metadata.images.filter(img => img.hasContent);
  if (config.category) {
    images = images.filter(img => img.category === config.category);
  }

  // Load logo once
  let logoBuffer = null;
  try { logoBuffer = await fs.readFile(LOGO_PATH); } catch {}

  // Counters
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let totalApiCalls = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalIndex = 0;
  const totalFiles = images.length * GRADE_LEVELS.length;

  console.log(`📊 Images: ${images.length} | Grades: ${GRADE_LEVELS.length} | Total files: ${totalFiles}`);
  console.log('');

  for (const image of images) {
    const baseFilename = path.parse(image.filename).name;

    // Load image once per photo (for all 6 grade levels)
    let imageBase64 = null;
    let mediaType = 'image/jpeg';
    if (!config.dryRun) {
      try {
        const imgPath = path.join(ROOT_DIR, image.imagePath);
        const imgBuffer = await fs.readFile(imgPath);
        imageBase64 = imgBuffer.toString('base64');
        const ext = path.extname(image.filename).toLowerCase();
        if (ext === '.png') mediaType = 'image/png';
        else if (ext === '.webp') mediaType = 'image/webp';
      } catch (e) {
        console.warn(`   ⚠️  Image not found: ${image.imagePath} — skipping photo`);
        skipped += GRADE_LEVELS.length;
        totalIndex += GRADE_LEVELS.length;
        continue;
      }
    }

    // Load base JSON for updating educational object
    const baseJsonPath = path.join(CONTENT_DIR, image.category, `${baseFilename}.json`);
    let baseJson = null;
    let baseKeyMapper = null;
    try {
      baseJson = JSON.parse(await fs.readFile(baseJsonPath, 'utf8'));
      baseKeyMapper = detectBaseKeyFormat(baseJson.educational);
    } catch {
      // Base file may not exist for some photos
    }

    for (const grade of GRADE_LEVELS) {
      totalIndex++;
      const gradeFilePath = path.join(CONTENT_DIR, image.category, `${baseFilename}-${grade.key}.json`);

      try {
        // Read grade-level content file
        const gradeJson = JSON.parse(await fs.readFile(gradeFilePath, 'utf8'));
        const existingMarkdown = gradeJson.content;

        if (!existingMarkdown) {
          console.warn(`   ⚠️  No content in ${baseFilename}-${grade.key}.json — skipping`);
          skipped++;
          continue;
        }

        // Check which sections are missing
        const missing = getMissingSections(existingMarkdown);

        // Check if YouTube videos need stripping
        const hasYouTube = /\*\*YouTube Videos?:?\*\*/i.test(existingMarkdown) ||
                           /https?:\/\/(?:www\.)?(?:youtube\.com\/watch|youtu\.be\/)/i.test(existingMarkdown);

        if (missing.length === 0 && !hasYouTube) {
          skipped++;
          continue;
        }

        const pct = ((totalIndex / totalFiles) * 100).toFixed(0);
        const label = `[${totalIndex}/${totalFiles}] ${pct}% ${image.category}/${baseFilename}-${grade.key}`;

        if (config.dryRun) {
          const tasks = [];
          if (missing.length > 0) tasks.push(`missing ${missing.length} sections`);
          if (hasYouTube) tasks.push('strip YouTube');
          console.log(`  ${label} — ${tasks.join(', ')}`);
          processed++;
          continue;
        }

        const callStart = Date.now();
        let updatedMarkdown = existingMarkdown;
        let newSections = '';

        // --- API Call (only if sections are missing) ---
        if (missing.length > 0) {
          const prompt = buildMigrationPrompt(existingMarkdown, grade.name, missing);

          const messageContent = [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: imageBase64 }
            },
            { type: 'text', text: prompt }
          ];

          const response = await anthropic.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            messages: [{ role: 'user', content: messageContent }]
          });

          newSections = response.content[0].text;
          totalApiCalls++;
          totalInputTokens += response.usage.input_tokens;
          totalOutputTokens += response.usage.output_tokens;

          updatedMarkdown = insertSections(updatedMarkdown, newSections);
        }

        // --- Strip YouTube Videos ---
        if (hasYouTube) {
          updatedMarkdown = stripYouTubeVideos(updatedMarkdown);
        }

        gradeJson.content = updatedMarkdown;

        // In test mode, show the changes before saving
        if (config.test) {
          console.log('');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log(`📋 Changes for: ${baseFilename}-${grade.key}`);
          console.log(`   Image: ${image.imagePath}`);
          console.log(`   Grade: ${grade.name}`);
          if (missing.length > 0) console.log(`   Added: ${missing.length} new sections`);
          if (hasYouTube) console.log(`   Removed: YouTube Videos`);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          if (newSections) {
            console.log('');
            console.log(newSections);
          }
          console.log('');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

          // Prompt for approval
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await new Promise(resolve => {
            rl.question('\n✅ Apply this change and regenerate PDF? (y/n): ', resolve);
          });
          rl.close();

          if (answer.toLowerCase() !== 'y') {
            console.log('❌ Skipped. No changes made.');
            return;
          }
        }

        // Save grade-level file
        await fs.writeFile(gradeFilePath, JSON.stringify(gradeJson, null, 2));

        // Update base JSON educational object
        if (baseJson && baseKeyMapper) {
          const baseKey = baseKeyMapper(grade.key);
          if (baseJson.educational && baseJson.educational[baseKey] !== undefined) {
            baseJson.educational[baseKey] = updatedMarkdown;
          }
          // Also update top-level content if this is third-grade (default)
          if (grade.key === 'third-grade') {
            baseJson.content = updatedMarkdown;
          }
          await fs.writeFile(baseJsonPath, JSON.stringify(baseJson, null, 2));
        }

        // Regenerate PDF
        try {
          let imageBuffer = null;
          try {
            imageBuffer = await fs.readFile(path.join(ROOT_DIR, image.imagePath));
          } catch {}

          const pdfBuffer = await generatePDF({
            title: image.title,
            category: image.category,
            gradeLevel: grade.key,
            markdownContent: updatedMarkdown,
            imagePath: imageBuffer || path.join(ROOT_DIR, image.imagePath),
            logoPath: logoBuffer || LOGO_PATH
          });

          const pdfDir = path.join(PDFS_DIR, image.category);
          await fs.mkdir(pdfDir, { recursive: true });
          await fs.writeFile(path.join(pdfDir, `${baseFilename}-${grade.key}.pdf`), pdfBuffer);
        } catch (pdfErr) {
          console.warn(`   ⚠️  PDF regeneration failed for ${baseFilename}-${grade.key}: ${pdfErr.message}`);
        }

        const elapsed = Date.now() - callStart;
        processed++;
        console.log(`  ✅ ${label} (${formatTime(elapsed)})`);

        // In test mode, stop after one file
        if (config.test) {
          console.log('');
          console.log('🧪 Test complete! Review the output:');
          console.log(`   JSON: content/${image.category}/${baseFilename}-${grade.key}.json`);
          console.log(`   PDF:  pdfs/${image.category}/${baseFilename}-${grade.key}.pdf`);
          console.log('');
          console.log('If it looks good, run with --run to process all files.');
          return;
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));

      } catch (err) {
        failed++;
        console.error(`  ❌ [${totalIndex}/${totalFiles}] FAILED: ${baseFilename}-${grade.key} — ${err.message}`);
      }
    }
  }

  // Summary
  const totalTime = Date.now() - startTime;
  const inputCost = totalInputTokens * 0.001 / 1000;
  const outputCost = totalOutputTokens * 0.005 / 1000;
  const totalCost = inputCost + outputCost;

  console.log('');
  console.log('📊 ============================================');
  console.log(`   ✅ Processed: ${processed}`);
  console.log(`   ⏩ Skipped:   ${skipped} (already had all sections)`);
  if (failed > 0) console.log(`   ❌ Failed:    ${failed}`);
  console.log(`   ⏱️  Time:      ${formatTime(totalTime)}`);
  if (totalApiCalls > 0) {
    console.log(`   🤖 API Calls: ${totalApiCalls}`);
    console.log(`   📊 Tokens:    ${totalInputTokens.toLocaleString()} in / ${totalOutputTokens.toLocaleString()} out`);
    console.log(`   💰 Cost:      $${totalCost.toFixed(2)} (Haiku 4.5)`);
  }
  console.log('   ============================================');
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * backfill-rubrics.js
 * Generate rubric JSONs (AI) + PDFs for all existing images and upload to Firebase Storage.
 * Saves rubric JSONs locally to content/{category}/ for git commit.
 * Idempotent — skips images that already have rubrics in Storage.
 *
 * Usage: node tools/backfill-rubrics.js [--force] [--start N] [--limit N] [--dry-run]
 *   --force    Regenerate even if file already exists in Storage
 *   --start N  Start from image index N (default: 0)
 *   --limit N  Process only N images (default: all)
 *   --dry-run  Show what would be done without making API calls or uploads
 *
 * Requires: @anthropic-ai/sdk, pdfkit, firebase-admin
 * Cost: ~$0.028 per image (6 Claude Haiku API calls)
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import Anthropic from '@anthropic-ai/sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const require = createRequire(join(ROOT, 'functions/'));

// Load generators from functions/ (CommonJS modules)
const { generateRubricPDF } = require('./rubric-generator');
const { extractDiscussionQuestions } = require('./exit-ticket-generator');

const BUCKET_NAME = 'sias-8178a.firebasestorage.app';
const GRADES = [
  { key: 'kindergarten', name: 'Kindergarten' },
  { key: 'first-grade', name: 'First Grade' },
  { key: 'second-grade', name: 'Second Grade' },
  { key: 'third-grade', name: 'Third Grade' },
  { key: 'fourth-grade', name: 'Fourth Grade' },
  { key: 'fifth-grade', name: 'Fifth Grade' },
];

const RUBRIC_SYSTEM_PROMPT = `You are an expert K-5 Science Assessment Developer. You create 4-point rubric scoring criteria for science discussion questions based on photographs. Your rubrics are used by elementary teachers to evaluate student responses.

## Rubric Scale
- Exceeds Expectations (4): Student demonstrates deep understanding with specific details, scientific vocabulary, and connections beyond the question's scope.
- Meets Expectations (3): Student demonstrates solid understanding with accurate details and reasonable explanations.
- Approaching Expectations (2): Student shows partial understanding with some accurate elements but incomplete reasoning.
- Beginning (1): Student provides minimal, vague, or inaccurate response with little evidence of understanding.

## Guidelines
1. Criteria must be grade-appropriate — use vocabulary and expectations matching the specified grade level.
2. Each level must be clearly distinguishable from adjacent levels.
3. "Exceeds" should describe what an exemplary student response looks like — not just "more than Meets."
4. "Beginning" should still describe an attempt, not a blank response.
5. Criteria should reference observable/measurable student behaviors, not subjective judgments.
6. Keep each criterion to 1-2 sentences for printability.
7. Reference specific science concepts from the photo/content when writing criteria.

Output format: Respond ONLY with valid JSON matching this schema:
{
  "questions": [
    {
      "questionText": "the full question text without Bloom's/DOK annotations",
      "bloomsLevel": "Analyze",
      "dokLevel": 2,
      "rubric": {
        "exceeds": "description...",
        "meets": "description...",
        "approaching": "description...",
        "beginning": "description..."
      }
    }
  ]
}`;

// ── Parse CLI args ──
const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');
const startIdx = args.includes('--start') ? parseInt(args[args.indexOf('--start') + 1]) || 0 : 0;
const limitArg = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : null;

// ── Initialize Firebase Admin ──
const serviceKeyPath = join(__dirname, 'serviceAccountKey.json');
if (!existsSync(serviceKeyPath) && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Missing credentials. Either:');
  console.error('  1. Place a service account key at tools/serviceAccountKey.json');
  console.error('  2. Set GOOGLE_APPLICATION_CREDENTIALS env var');
  process.exit(1);
}

const credential = existsSync(serviceKeyPath)
  ? cert(JSON.parse(readFileSync(serviceKeyPath, 'utf-8')))
  : undefined;

initializeApp({
  ...(credential ? { credential } : {}),
  storageBucket: BUCKET_NAME,
});
const bucket = getStorage().bucket();

// ── Initialize Anthropic ──
const apiKey = process.env.ANTHROPIC_API_KEY || '';
if (!apiKey && !dryRun) {
  console.error('Missing ANTHROPIC_API_KEY environment variable.');
  console.error('Set it: export ANTHROPIC_API_KEY="sk-ant-..."');
  process.exit(1);
}
const anthropic = dryRun ? null : new Anthropic({ apiKey });

// ── Helpers ──
async function fileExistsInStorage(storagePath) {
  try {
    const [exists] = await bucket.file(storagePath).exists();
    return exists;
  } catch {
    return false;
  }
}

async function uploadBuffer(buffer, storagePath) {
  const file = bucket.file(storagePath);
  await file.save(buffer, {
    metadata: {
      contentType: 'application/pdf',
      cacheControl: 'public, max-age=31536000',
    },
  });
}

function progressBar(current, total, width = 30) {
  const pct = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return `[${bar}] ${pct}% (${current}/${total})`;
}

function generateTitle(filename) {
  return filename.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Main ──
async function main() {
  const metadataPath = join(ROOT, 'gallery-metadata.json');
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
  const allImages = metadata.images;

  const endIdx = limitArg ? Math.min(startIdx + limitArg, allImages.length) : allImages.length;
  const images = allImages.slice(startIdx, endIdx);
  const estimatedCost = (images.length * 0.028).toFixed(2);

  console.log(`\n📊 Rubric Backfill`);
  console.log(`   Images: ${images.length} (index ${startIdx} to ${endIdx - 1} of ${allImages.length})`);
  console.log(`   Grades per image: ${GRADES.length}`);
  console.log(`   Total rubrics: ${images.length * GRADES.length}`);
  console.log(`   Estimated cost: ~$${estimatedCost}`);
  console.log(`   Force regenerate: ${force}`);
  console.log(`   Dry run: ${dryRun}`);
  console.log(`   Bucket: ${BUCKET_NAME}\n`);

  const logoPath = join(ROOT, 'sias_logo.png');
  const logoBuffer = existsSync(logoPath) ? readFileSync(logoPath) : null;

  let totalUploaded = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let totalCost = 0;
  let totalJsonsSaved = 0;
  const startTime = Date.now();

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const nameNoExt = image.filename.replace(/\.[^/.]+$/, '');
    const category = image.category;
    const title = image.title || generateTitle(image.filename);

    let imageUploaded = 0;
    let imageSkipped = 0;
    let imageFailed = 0;

    // Process grades sequentially (each requires an API call)
    for (const grade of GRADES) {
      const storagePath = `exit_ticket_rubrics/${category}/${nameNoExt}-rubric-${grade.key}.pdf`;
      const rubricJsonPath = join(ROOT, 'content', category, `${nameNoExt}-rubric-${grade.key}.json`);

      // Check if already exists (skip unless --force)
      if (!force) {
        const exists = await fileExistsInStorage(storagePath);
        if (exists) {
          imageSkipped++;
          continue;
        }
      }

      // Read content JSON
      const contentPath = join(ROOT, 'content', category, `${nameNoExt}-${grade.key}.json`);
      if (!existsSync(contentPath)) continue;

      if (dryRun) {
        imageUploaded++;
        continue;
      }

      try {
        const contentData = JSON.parse(readFileSync(contentPath, 'utf-8'));

        // Extract discussion questions
        const questions = extractDiscussionQuestions(contentData.content);
        if (questions.length === 0) continue;

        // Extract content summary for the prompt
        const descMatch = contentData.content.match(/##\s*📸\s*Photo Description\s*\n([\s\S]*?)(?=\n##\s|$)/);
        const contentSummary = descMatch ? descMatch[1].trim().substring(0, 300) : '';
        const questionsForPrompt = questions.map((q, idx) => `${idx + 1}. ${q}`).join('\n');

        // Call Claude Haiku for rubric criteria
        const response = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4096,
          system: [{ type: 'text', text: RUBRIC_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          messages: [{
            role: 'user',
            content: `Photo: ${image.filename}\nCategory: ${category}\nGrade Level: ${grade.name}\n\nDiscussion questions:\n${questionsForPrompt}\n\nContent summary:\n${contentSummary}\n\nGenerate a 4-point rubric for each question.`
          }]
        });

        // Track cost
        const usage = response.usage || {};
        const callCost = ((usage.input_tokens || 0) * 1 + (usage.cache_creation_input_tokens || 0) * 1.25 + (usage.cache_read_input_tokens || 0) * 0.1 + (usage.output_tokens || 0) * 5) / 1000000;
        totalCost += callCost;

        // Parse AI response
        const responseText = response.content[0].text.trim();
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in AI response');
        }

        const rubricData = JSON.parse(jsonMatch[0]);
        const rubricJsonContent = {
          title,
          category,
          gradeLevel: grade.key,
          questions: rubricData.questions,
          generatedAt: new Date().toISOString(),
          cost: parseFloat(callCost.toFixed(6))
        };

        // Save rubric JSON locally (for git commit later)
        const contentDir = join(ROOT, 'content', category);
        if (!existsSync(contentDir)) mkdirSync(contentDir, { recursive: true });
        writeFileSync(rubricJsonPath, JSON.stringify(rubricJsonContent, null, 2));
        totalJsonsSaved++;

        // Generate PDF
        const rubricPdfBuffer = await generateRubricPDF({
          title,
          category,
          gradeLevel: grade.key,
          rubricData: rubricJsonContent,
          logoPath: logoBuffer,
        });

        // Upload PDF to Storage
        await uploadBuffer(rubricPdfBuffer, storagePath);
        imageUploaded++;
      } catch (err) {
        console.error(`\n   ⚠️ ${nameNoExt}-${grade.key}: ${err.message}`);
        imageFailed++;
      }
    }

    totalUploaded += imageUploaded;
    totalSkipped += imageSkipped;
    totalFailed += imageFailed;

    // Progress line
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const costStr = totalCost > 0 ? ` $${totalCost.toFixed(4)}` : '';
    const status = imageUploaded > 0 ? `✅ ${imageUploaded} new` : `⏭️ ${imageSkipped} skipped`;
    process.stdout.write(`\r   ${progressBar(i + 1, images.length)} ${status} — ${title} (${elapsed}s${costStr})`);
  }

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\n✅ Rubric backfill complete in ${totalElapsed}s`);
  console.log(`   Uploaded:   ${totalUploaded} PDFs`);
  console.log(`   JSONs saved: ${totalJsonsSaved} (to content/)`);
  console.log(`   Skipped:    ${totalSkipped}`);
  console.log(`   Failed:     ${totalFailed}`);
  console.log(`   Total cost: $${totalCost.toFixed(4)}`);
  console.log(`   Total:      ${totalUploaded + totalSkipped + totalFailed}\n`);

  if (totalJsonsSaved > 0) {
    console.log(`📝 Rubric JSONs saved to content/. Don't forget to commit and push:\n`);
    console.log(`   git add content/`);
    console.log(`   git commit -m "Add scoring rubric JSONs for ${totalJsonsSaved / 6} images"`);
    console.log(`   git push\n`);
  }
}

main().catch(err => {
  console.error('\nBackfill failed:', err);
  process.exit(1);
});

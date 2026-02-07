#!/usr/bin/env node
/**
 * YouTube Link Checker for Science In A Snapshot
 *
 * Scans all content JSON files, extracts YouTube video URLs,
 * and checks if they are still available using YouTube's oEmbed API.
 *
 * Usage:
 *   node tools/check-youtube-links.cjs              # Full audit
 *   node tools/check-youtube-links.cjs --ci         # CI mode (warnings only, no interactive)
 *   node tools/check-youtube-links.cjs --file <path> # Check a single file
 *
 * Output:
 *   - Console summary of broken/valid links
 *   - youtube-link-report.json with full details
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ── Configuration ──────────────────────────────────────────────────
const CONTENT_DIR = path.join(__dirname, '..', 'content');
const REPORT_FILE = path.join(__dirname, '..', 'youtube-link-report.json');
const CONCURRENCY = 5;          // Max parallel HTTP requests
const REQUEST_DELAY_MS = 200;   // Delay between batches to avoid rate limiting
const REQUEST_TIMEOUT_MS = 10000;

// ── Parse CLI args ─────────────────────────────────────────────────
const args = process.argv.slice(2);
const ciMode = args.includes('--ci');
const fileIdx = args.indexOf('--file');
const singleFile = fileIdx !== -1 ? args[fileIdx + 1] : null;

// ── YouTube URL extraction ─────────────────────────────────────────
const YOUTUBE_VIDEO_REGEX = /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([\w-]{11})/g;

function extractVideoIds(markdown) {
  const ids = new Set();
  let match;
  const regex = new RegExp(YOUTUBE_VIDEO_REGEX.source, 'g');
  while ((match = regex.exec(markdown)) !== null) {
    ids.add(match[1]);
  }
  return [...ids];
}

// ── Check video availability via oEmbed ────────────────────────────
function checkVideo(videoId) {
  return new Promise((resolve) => {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;

    const req = https.get(url, { timeout: REQUEST_TIMEOUT_MS }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            resolve({ videoId, status: 'valid', title: json.title || 'Unknown', statusCode: 200 });
          } catch (e) {
            resolve({ videoId, status: 'valid', title: 'Unknown (parse error)', statusCode: 200 });
          }
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          resolve({ videoId, status: 'broken', reason: 'Private or restricted', statusCode: res.statusCode });
        } else if (res.statusCode === 404) {
          resolve({ videoId, status: 'broken', reason: 'Video not found / removed', statusCode: res.statusCode });
        } else {
          resolve({ videoId, status: 'broken', reason: `HTTP ${res.statusCode}`, statusCode: res.statusCode });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ videoId, status: 'error', reason: err.message, statusCode: 0 });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ videoId, status: 'error', reason: 'Request timeout', statusCode: 0 });
    });
  });
}

// ── Batch check with concurrency control ───────────────────────────
async function checkVideosInBatches(videoIds) {
  const results = {};
  const batches = [];

  for (let i = 0; i < videoIds.length; i += CONCURRENCY) {
    batches.push(videoIds.slice(i, i + CONCURRENCY));
  }

  let checked = 0;
  for (const batch of batches) {
    const batchResults = await Promise.all(batch.map(checkVideo));
    for (const result of batchResults) {
      results[result.videoId] = result;
      checked++;
    }

    // Progress indicator
    if (!ciMode) {
      process.stdout.write(`\r  Checked ${checked}/${videoIds.length} videos...`);
    }

    // Rate limit delay between batches
    if (batches.indexOf(batch) < batches.length - 1) {
      await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
    }
  }

  if (!ciMode) process.stdout.write('\n');
  return results;
}

// ── Scan content files ─────────────────────────────────────────────
function scanContentFiles() {
  const fileMap = []; // { filePath, category, grade, photoName, videoIds[] }

  if (singleFile) {
    // Single file mode
    const absPath = path.resolve(singleFile);
    if (!fs.existsSync(absPath)) {
      console.error(`File not found: ${absPath}`);
      process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(absPath, 'utf-8'));
    const content = data.content || '';
    const videoIds = extractVideoIds(content);
    fileMap.push({
      filePath: absPath,
      category: 'unknown',
      grade: 'unknown',
      photoName: path.basename(absPath, '.json'),
      videoIds
    });
    return fileMap;
  }

  // Full scan
  const categories = fs.readdirSync(CONTENT_DIR).filter(d =>
    fs.statSync(path.join(CONTENT_DIR, d)).isDirectory()
  );

  for (const category of categories) {
    const catDir = path.join(CONTENT_DIR, category);
    const files = fs.readdirSync(catDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(catDir, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const content = data.content || '';
        const videoIds = extractVideoIds(content);

        // Parse grade from filename (e.g., "spider_web-third-grade.json")
        const gradeMatch = file.match(/-(kindergarten|first-grade|second-grade|third-grade|fourth-grade|fifth-grade)\.json$/);
        const grade = gradeMatch ? gradeMatch[1] : 'base';
        const photoName = file.replace(/-(kindergarten|first-grade|second-grade|third-grade|fourth-grade|fifth-grade)\.json$/, '').replace('.json', '');

        fileMap.push({ filePath, category, grade, photoName, videoIds });
      } catch (err) {
        console.error(`  ⚠ Error reading ${filePath}: ${err.message}`);
      }
    }
  }

  return fileMap;
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  console.log('🔍 YouTube Link Checker — Science In A Snapshot');
  console.log('================================================\n');

  // Step 1: Scan files
  console.log('📂 Scanning content files...');
  const fileMap = scanContentFiles();

  // Collect all unique video IDs
  const allVideoIds = new Set();
  const videoToFiles = {}; // videoId -> [{ filePath, category, grade, photoName }]

  let filesWithVideos = 0;
  let totalLinks = 0;

  for (const entry of fileMap) {
    if (entry.videoIds.length > 0) {
      filesWithVideos++;
      totalLinks += entry.videoIds.length;
    }
    for (const vid of entry.videoIds) {
      allVideoIds.add(vid);
      if (!videoToFiles[vid]) videoToFiles[vid] = [];
      videoToFiles[vid].push({
        filePath: entry.filePath,
        category: entry.category,
        grade: entry.grade,
        photoName: entry.photoName
      });
    }
  }

  const uniqueIds = [...allVideoIds];
  console.log(`  Files scanned: ${fileMap.length}`);
  console.log(`  Files with video links: ${filesWithVideos}`);
  console.log(`  Total video links: ${totalLinks}`);
  console.log(`  Unique video IDs: ${uniqueIds.length}\n`);

  if (uniqueIds.length === 0) {
    console.log('✅ No YouTube video links found. Nothing to check.');
    process.exit(0);
  }

  // Step 2: Check each unique video
  console.log('🌐 Checking video availability...');
  const results = await checkVideosInBatches(uniqueIds);

  // Step 3: Compile report
  const broken = [];
  const valid = [];
  const errors = [];

  for (const [videoId, result] of Object.entries(results)) {
    const files = videoToFiles[videoId] || [];
    const entry = { ...result, url: `https://www.youtube.com/watch?v=${videoId}`, files };

    if (result.status === 'broken') broken.push(entry);
    else if (result.status === 'error') errors.push(entry);
    else valid.push(entry);
  }

  // Step 4: Output results
  console.log('\n📊 Results Summary');
  console.log('──────────────────');
  console.log(`  ✅ Valid:   ${valid.length}`);
  console.log(`  ❌ Broken:  ${broken.length}`);
  console.log(`  ⚠️  Errors:  ${errors.length}`);
  console.log('');

  if (broken.length > 0) {
    console.log('❌ BROKEN VIDEOS:');
    console.log('─────────────────');
    for (const b of broken) {
      console.log(`\n  Video: ${b.url}`);
      console.log(`  Reason: ${b.reason}`);
      console.log(`  Used in ${b.files.length} file(s):`);
      for (const f of b.files) {
        console.log(`    - ${f.photoName} (${f.grade}) [${f.category}]`);
      }
    }
    console.log('');
  }

  if (errors.length > 0) {
    console.log('⚠️  ERRORS (could not verify):');
    console.log('──────────────────────────────');
    for (const e of errors) {
      console.log(`  ${e.url} — ${e.reason}`);
    }
    console.log('');
  }

  // Step 5: Write full report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      filesScanned: fileMap.length,
      filesWithVideos,
      totalLinks,
      uniqueVideos: uniqueIds.length,
      valid: valid.length,
      broken: broken.length,
      errors: errors.length
    },
    broken: broken.map(b => ({
      videoId: b.videoId,
      url: b.url,
      reason: b.reason,
      files: b.files.map(f => ({
        path: path.relative(path.join(__dirname, '..'), f.filePath),
        photo: f.photoName,
        grade: f.grade,
        category: f.category
      }))
    })),
    valid: valid.map(v => ({
      videoId: v.videoId,
      url: v.url,
      title: v.title
    }))
  };

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  console.log(`📄 Full report written to: youtube-link-report.json`);

  // CI mode exit code
  if (ciMode && broken.length > 0) {
    console.log(`\n⚠️  CI WARNING: ${broken.length} broken YouTube link(s) detected.`);
    // Exit 0 in CI — we warn but don't block deploys
    process.exit(0);
  }

  console.log('\nDone! ✨');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

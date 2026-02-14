#!/usr/bin/env node
/**
 * One-time script: Extract Anchoring Phenomenon from each image's base content JSON
 * and add it as a "phenomenon" field in gallery-metadata.json.
 *
 * Usage: node scripts/extract-phenomena.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const METADATA_PATH = path.join(ROOT, 'gallery-metadata.json');

function extractPhenomenon(contentMarkdown) {
  if (!contentMarkdown) return '';

  // Strategy 1: Newer format — **Anchoring Phenomenon:** <text>
  const colonMatch = contentMarkdown.match(/\*\*Anchoring Phenomenon:\*\*\s*(.+)/);
  if (colonMatch) {
    return colonMatch[1]
      .replace(/\*\*/g, '')  // remove bold
      .replace(/\*/g, '')    // remove italic
      .trim();
  }

  // Strategy 2: Older format — extract first sentence from Scientific Phenomena section
  // Matches: "The **Anchoring Phenomenon** is..." or "The anchoring phenomenon shown is..."
  const sectionMatch = contentMarkdown.match(/## .*Scientific Phenomena\n+([\s\S]*?)(?=\n## )/);
  if (sectionMatch) {
    const sectionText = sectionMatch[1].trim();
    // Get the first sentence (up to the first period followed by space or end)
    const firstSentence = sectionText.match(/^(.+?\.)\s/);
    if (firstSentence) {
      // Clean markdown formatting
      let text = firstSentence[1]
        .replace(/\*\*/g, '')    // remove bold markers
        .replace(/\*/g, '')      // remove italic markers
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // remove markdown links
        .trim();
      // Remove redundant prefixes
      text = text
        .replace(/^The [Aa]nchoring [Pp]henomenon (?:shown |here )?is\s*/i, '')
        .replace(/^This image (?:demonstrates|represents|captures|shows) the [Aa]nchoring [Pp]henomenon of\s*/i, '')
        .replace(/^This image (?:demonstrates|represents|captures|shows)\s*/i, '');
      // Capitalize first letter after cleanup
      if (text.length > 0) {
        text = text.charAt(0).toUpperCase() + text.slice(1);
      }
      return text;
    }
    // Fallback: take the first line if no period-space found
    const firstLine = sectionText.split('\n')[0];
    return firstLine
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .trim();
  }

  return '';
}

function main() {
  // Read metadata
  const metadata = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
  console.log(`Loaded ${metadata.images.length} images from gallery-metadata.json`);

  let found = 0;
  let missing = 0;

  for (const image of metadata.images) {
    // Base content JSON path (no grade suffix)
    const nameNoExt = path.parse(image.filename).name;
    const contentPath = path.join(ROOT, 'content', image.category, `${nameNoExt}.json`);

    if (!fs.existsSync(contentPath)) {
      console.warn(`  SKIP: ${contentPath} not found`);
      image.phenomenon = '';
      missing++;
      continue;
    }

    try {
      const contentData = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
      const markdown = contentData.content || '';
      const phenomenon = extractPhenomenon(markdown);

      if (phenomenon) {
        image.phenomenon = phenomenon;
        found++;
      } else {
        image.phenomenon = '';
        missing++;
        console.warn(`  NO PHENOMENON: ${nameNoExt} (${image.category})`);
      }
    } catch (err) {
      console.error(`  ERROR reading ${contentPath}: ${err.message}`);
      image.phenomenon = '';
      missing++;
    }
  }

  // Write updated metadata
  fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2));

  console.log(`\nDone!`);
  console.log(`  Found phenomenon: ${found}`);
  console.log(`  Missing/empty: ${missing}`);
  console.log(`  Total images: ${metadata.images.length}`);
}

main();

/**
 * Build NGSS Standards Index
 * PE codes come from each image's ngssStandards field in gallery-metadata.json (all grade levels).
 * DCI / CCC codes come from content-file markdown (special [[NGSS:...]] tags).
 */
const fs = require('fs');
const path = require('path');

const galleryData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'gallery-metadata.json'), 'utf8'));

const ngssIndex = {
  performanceExpectations: {},
  disciplinaryCoreIdeas: {},
  crosscuttingConcepts: {},
  allStandards: []
};

// Regex to distinguish PE codes (K-PS2-1) from DCI codes (K-PS2.A)
const pePattern = /^[K1-5]-[A-Z]{2,4}\d?-\d+$/;

let processed = 0;
let errors = 0;

galleryData.images.forEach(image => {
  // ── PEs: read from metadata ngssStandards (all grade levels) ──
  const ngss = image.ngssStandards;
  if (ngss && typeof ngss === 'object') {
    const peSet = new Set();
    Object.values(ngss).forEach(gradeStandards => {
      if (!Array.isArray(gradeStandards)) return;
      gradeStandards.forEach(code => {
        if (pePattern.test(code)) {
          peSet.add(code);
        }
      });
    });
    peSet.forEach(pe => {
      if (!ngssIndex.performanceExpectations[pe]) {
        ngssIndex.performanceExpectations[pe] = [];
      }
      if (!ngssIndex.performanceExpectations[pe].includes(image.id)) {
        ngssIndex.performanceExpectations[pe].push(image.id);
      }
    });
  }

  // ── DCI & CCC: read from content-file markdown ──
  const baseFile = image.contentFile.replace('.json', '');
  const gradeFile = path.join(__dirname, '..', baseFile + '-third-grade.json');
  const fallbackFile = path.join(__dirname, '..', image.contentFile);

  let content = null;
  try {
    if (fs.existsSync(gradeFile)) {
      content = JSON.parse(fs.readFileSync(gradeFile, 'utf8'));
    } else if (fs.existsSync(fallbackFile)) {
      content = JSON.parse(fs.readFileSync(fallbackFile, 'utf8'));
    }
  } catch (e) {
    errors++;
  }

  if (content && content.content) {
    const md = content.content;

    // Extract DCI codes (e.g., [[NGSS:DCI:3-LS4.C]])
    const dciRegex = /\[\[NGSS:DCI:([^\]]+)\]\]/g;
    let dciMatch;
    while ((dciMatch = dciRegex.exec(md)) !== null) {
      const code = dciMatch[1];
      if (!ngssIndex.disciplinaryCoreIdeas[code]) {
        ngssIndex.disciplinaryCoreIdeas[code] = [];
      }
      if (!ngssIndex.disciplinaryCoreIdeas[code].includes(image.id)) {
        ngssIndex.disciplinaryCoreIdeas[code].push(image.id);
      }
    }

    // Extract CCC names (e.g., [[NGSS:CCC:Patterns]])
    const cccRegex = /\[\[NGSS:CCC:([^\]]+)\]\]/g;
    let cccMatch;
    while ((cccMatch = cccRegex.exec(md)) !== null) {
      const name = cccMatch[1];
      if (!ngssIndex.crosscuttingConcepts[name]) {
        ngssIndex.crosscuttingConcepts[name] = [];
      }
      if (!ngssIndex.crosscuttingConcepts[name].includes(image.id)) {
        ngssIndex.crosscuttingConcepts[name].push(image.id);
      }
    }
  }

  processed++;
});

// Build flat list for autocomplete/search
const allStds = new Set();
Object.keys(ngssIndex.performanceExpectations).forEach(k => allStds.add('PE: ' + k));
Object.keys(ngssIndex.disciplinaryCoreIdeas).forEach(k => allStds.add('DCI: ' + k));
Object.keys(ngssIndex.crosscuttingConcepts).forEach(k => allStds.add('CCC: ' + k));
ngssIndex.allStandards = [...allStds].sort();

console.log('Processed:', processed, '| Errors:', errors);
console.log('Performance Expectations:', Object.keys(ngssIndex.performanceExpectations).length);
console.log('Disciplinary Core Ideas:', Object.keys(ngssIndex.disciplinaryCoreIdeas).length);
console.log('Crosscutting Concepts:', Object.keys(ngssIndex.crosscuttingConcepts).length);
console.log('Total unique standards:', ngssIndex.allStandards.length);

const outputPath = path.join(__dirname, '..', 'ngss-index.json');
fs.writeFileSync(outputPath, JSON.stringify(ngssIndex, null, 2));
console.log('Written to:', outputPath);

#!/usr/bin/env node

/**
 * Consolidate Grade-Level Files
 * 
 * This script finds photos that have separate grade-level files (e.g., frog-kindergarten.json)
 * and consolidates them into a single file with an educational object.
 */

const fs = require('fs').promises;
const path = require('path');

const CONTENT_DIR = path.join(__dirname, 'content');
const CATEGORIES = ['earth-space-science', 'life-science', 'physical-science'];
const GRADE_LEVELS = ['kindergarten', 'grade1', 'grade2', 'grade3', 'grade4', 'grade5'];

const GRADE_SUFFIXES = {
  'kindergarten': '-kindergarten',
  'grade1': '-first-grade',
  'grade2': '-second-grade',
  'grade3': '-third-grade',
  'grade4': '-fourth-grade',
  'grade5': '-fifth-grade'
};

/**
 * Find base names that have grade-level files but no consolidated file
 */
async function findFilesToConsolidate(category) {
  const categoryPath = path.join(CONTENT_DIR, category);
  const files = await fs.readdir(categoryPath);
  
  const baseNames = new Set();
  const gradeFiles = {};
  
  // Find all grade-level files
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    
    for (const [gradeKey, suffix] of Object.entries(GRADE_SUFFIXES)) {
      if (file.endsWith(`${suffix}.json`)) {
        const baseName = file.replace(`${suffix}.json`, '');
        
        if (!gradeFiles[baseName]) {
          gradeFiles[baseName] = {};
        }
        gradeFiles[baseName][gradeKey] = file;
        baseNames.add(baseName);
      }
    }
  }
  
  // Check which base names don't have a consolidated file
  const needsConsolidation = [];
  for (const baseName of baseNames) {
    const consolidatedFile = `${baseName}.json`;
    const consolidatedPath = path.join(categoryPath, consolidatedFile);
    
    try {
      const content = await fs.readFile(consolidatedPath, 'utf-8');
      const data = JSON.parse(content);
      
      // Only needs consolidation if it doesn't have educational object
      if (!data.educational) {
        needsConsolidation.push({
          baseName,
          gradeFiles: gradeFiles[baseName],
          consolidatedFile
        });
      }
    } catch (error) {
      // File doesn't exist, needs consolidation
      needsConsolidation.push({
        baseName,
        gradeFiles: gradeFiles[baseName],
        consolidatedFile
      });
    }
  }
  
  return needsConsolidation;
}

/**
 * Consolidate grade-level files into a single file
 */
async function consolidateFiles(category, fileInfo) {
  const categoryPath = path.join(CONTENT_DIR, category);
  const educational = {};
  let baseData = null;
  
  // Read all grade-level files
  for (const [gradeKey, filename] of Object.entries(fileInfo.gradeFiles)) {
    const filePath = path.join(categoryPath, filename);
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    // Use first file as base
    if (!baseData) {
      baseData = {
        id: data.id,
        title: data.title,
        category: data.category,
        imageFile: data.imageFile,
        imagePath: data.imagePath
      };
    }
    
    // Extract educational content
    educational[gradeKey] = data.content;
  }
  
  // Create consolidated file
  const consolidatedData = {
    ...baseData,
    content: educational.grade3 || educational.kindergarten, // Use 3rd grade or kindergarten as general content
    educational,
    generatedAt: new Date().toISOString()
  };
  
  const outputPath = path.join(categoryPath, fileInfo.consolidatedFile);
  await fs.writeFile(outputPath, JSON.stringify(consolidatedData, null, 2), 'utf-8');
  
  return {
    success: true,
    file: fileInfo.consolidatedFile,
    gradeCount: Object.keys(fileInfo.gradeFiles).length
  };
}

/**
 * Main execution
 */
async function main() {
  console.log('🔄 Consolidating Grade-Level Files\n');
  
  let totalConsolidated = 0;
  
  for (const category of CATEGORIES) {
    console.log(`\n📁 Category: ${category}`);
    console.log('─'.repeat(50));
    
    const filesToConsolidate = await findFilesToConsolidate(category);
    
    if (filesToConsolidate.length === 0) {
      console.log('No files need consolidation.');
      continue;
    }
    
    console.log(`Found ${filesToConsolidate.length} file(s) to consolidate\n`);
    
    for (const fileInfo of filesToConsolidate) {
      const result = await consolidateFiles(category, fileInfo);
      
      if (result.success) {
        console.log(`✅ ${result.file} - Consolidated ${result.gradeCount} grade levels`);
        totalConsolidated++;
      }
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary');
  console.log('='.repeat(50));
  console.log(`Total files consolidated: ${totalConsolidated}`);
  console.log('\n✨ Done!\n');
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

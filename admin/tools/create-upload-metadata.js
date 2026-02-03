#!/usr/bin/env node

// ===================================
// Upload Metadata Creator
// Helper tool to create metadata files
// ===================================

const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

async function main() {
    console.log('\n========================================');
    console.log('  Upload Metadata Creator');
    console.log('========================================\n');

    const photos = [];
    let addMore = true;

    while (addMore) {
        console.log(`\n--- Photo ${photos.length + 1} ---`);

        const filename = await question('Filename (e.g., butterfly.jpg): ');
        if (!filename) {
            console.log('Filename is required!');
            continue;
        }

        const title = await question('Title: ');
        if (!title) {
            console.log('Title is required!');
            continue;
        }

        console.log('\nCategories:');
        console.log('  1. life-science');
        console.log('  2. earth-science');
        console.log('  3. physical-science');
        const categoryNum = await question('Select category (1-3): ');

        const categories = {
            '1': 'life-science',
            '2': 'earth-science',
            '3': 'physical-science'
        };

        const category = categories[categoryNum];
        if (!category) {
            console.log('Invalid category!');
            continue;
        }

        const hasMarkdownInput = await question('Has markdown file? (y/n): ');
        const hasMarkdown = hasMarkdownInput.toLowerCase() === 'y';

        let markdownFilename = null;
        if (hasMarkdown) {
            markdownFilename = await question('Markdown filename (e.g., content.md): ');
        }

        photos.push({
            filename,
            title,
            category,
            hasMarkdown,
            markdownFilename
        });

        const addAnother = await question('\nAdd another photo? (y/n): ');
        addMore = addAnother.toLowerCase() === 'y';
    }

    if (photos.length === 0) {
        console.log('\nNo photos added. Exiting.');
        rl.close();
        return;
    }

    // Create metadata object
    const metadata = {
        timestamp: new Date().toISOString(),
        photos
    };

    // Save to file
    const filename = `upload-metadata-${Date.now()}.json`;
    const filepath = path.join(__dirname, '../uploads/pending', filename);

    try {
        await fs.writeFile(filepath, JSON.stringify(metadata, null, 2));
        console.log(`\n✓ Metadata saved to: ${filename}`);
        console.log('\nNext steps:');
        console.log('1. Copy your photo files to admin/uploads/pending/');
        console.log('2. Copy markdown files (if any) to admin/uploads/pending/');
        console.log('3. Run: npm run process');
    } catch (error) {
        console.error('\n✗ Error saving file:', error.message);
    }

    rl.close();
}

main();

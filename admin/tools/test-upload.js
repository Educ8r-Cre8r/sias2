#!/usr/bin/env node

// Quick test to verify upload functionality
const path = require('path');
const fs = require('fs').promises;

async function testUploadSystem() {
    console.log('🧪 Testing SIAS Upload System\n');

    const projectRoot = '/Users/alexjones/Library/CloudStorage/CloudMounter-DXP6800Pro01CM/Educ8r/Claude AI/sias';

    // Test 1: Check config
    console.log('1. Testing config file...');
    try {
        const configPath = path.join(projectRoot, 'admin/config.json');
        const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
        console.log('   ✓ Config loaded');
        console.log('   Project root:', config.projectRoot);
        console.log('   Upload dir:', config.uploadsDir);
    } catch (error) {
        console.log('   ✗ Config error:', error.message);
        return;
    }

    // Test 2: Check directories
    console.log('\n2. Testing directories...');
    const dirs = [
        'admin/uploads/pending',
        'admin/uploads/processed',
        'images/life-science',
        'images/earth-space-science',
        'images/physical-science',
        'content/life-science',
        'content/earth-space-science',
        'content/physical-science'
    ];

    for (const dir of dirs) {
        try {
            const fullPath = path.join(projectRoot, dir);
            await fs.access(fullPath);
            console.log(`   ✓ ${dir}`);
        } catch (error) {
            console.log(`   ✗ ${dir} - missing or no access`);
        }
    }

    // Test 3: Check if markdown files exist
    console.log('\n3. Checking for markdown files in Downloads...');
    const downloadsDir = path.join(process.env.HOME, 'Downloads');
    try {
        const files = await fs.readdir(downloadsDir);
        const mdFiles = files.filter(f => f.endsWith('.md'));
        if (mdFiles.length > 0) {
            console.log(`   ✓ Found ${mdFiles.length} markdown file(s):`);
            mdFiles.forEach(f => console.log(`     - ${f}`));
        } else {
            console.log('   ⚠ No .md files found in Downloads');
        }
    } catch (error) {
        console.log('   ✗ Cannot access Downloads:', error.message);
    }

    // Test 4: Test markdown converter
    console.log('\n4. Testing markdown converter...');
    try {
        const MarkdownConverter = require('./markdown-to-json');
        const converter = new MarkdownConverter();

        // Create test markdown
        const testMd = '# Test Heading\n\nThis is a test markdown file.';
        const testJsonPath = path.join(projectRoot, 'admin/uploads/pending/test-output.json');

        const result = await converter.createFromString(testMd, testJsonPath);
        if (result.success) {
            console.log('   ✓ Markdown converter working');
            await fs.unlink(testJsonPath); // Clean up
        } else {
            console.log('   ✗ Markdown converter failed:', result.error);
        }
    } catch (error) {
        console.log('   ✗ Markdown converter error:', error.message);
    }

    // Test 5: Check server
    console.log('\n5. Testing server connection...');
    try {
        const response = await fetch('http://localhost:3333/api/photos');
        if (response.ok) {
            const data = await response.json();
            console.log('   ✓ Server is running');
            console.log(`   Total photos in gallery: ${data.totalImages}`);
        } else {
            console.log('   ✗ Server returned error:', response.status);
        }
    } catch (error) {
        console.log('   ✗ Cannot connect to server');
        console.log('   Make sure to run: npm run serve');
    }

    console.log('\n✅ Test complete!\n');
}

testUploadSystem().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
});

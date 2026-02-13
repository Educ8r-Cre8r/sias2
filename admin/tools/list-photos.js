#!/usr/bin/env node

// ===================================
// List Photos Tool
// Display all photos in gallery
// ===================================

const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');

async function listPhotos(format = 'table') {
    const configPath = path.join(__dirname, '../config.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));

    const metadataPath = path.join(config.projectRoot, config.metadataFile);
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));

    if (format === 'json') {
        console.log(JSON.stringify(metadata.images, null, 2));
        return;
    }

    console.log(chalk.cyan('\n========================================'));
    console.log(chalk.cyan('  Gallery Photos'));
    console.log(chalk.cyan('========================================\n'));

    console.log(chalk.gray(`Total images: ${metadata.totalImages}`));
    console.log(chalk.gray(`Last updated: ${new Date(metadata.lastUpdated).toLocaleString()}\n`));

    // Group by category
    const byCategory = {};
    metadata.images.forEach(img => {
        if (!byCategory[img.category]) {
            byCategory[img.category] = [];
        }
        byCategory[img.category].push(img);
    });

    // Display by category
    Object.entries(byCategory).forEach(([category, photos]) => {
        const icon = category === 'life-science' ? '🌱' :
                     category === 'earth-space-science' ? '🌍' : '🧪';

        console.log(chalk.bold(`\n${icon} ${category.toUpperCase().replace(/-/g, ' ')} (${photos.length})`));
        console.log(chalk.gray('─'.repeat(60)));

        photos.forEach(photo => {
            const content = photo.hasContent ? chalk.green('📄') : chalk.gray('∅');
            console.log(`  ${chalk.blue(`ID ${photo.id}`)} ${content} ${photo.title}`);
            console.log(chalk.gray(`       ${photo.filename}`));
        });
    });

    console.log(chalk.cyan('\n========================================\n'));
    console.log(chalk.gray('To delete a photo: npm run delete <id>'));
    console.log(chalk.gray('Example: npm run delete 73\n'));
}

// If run directly
if (require.main === module) {
    const format = process.argv[2] || 'table';
    listPhotos(format).catch(error => {
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
    });
}

module.exports = listPhotos;

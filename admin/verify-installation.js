#!/usr/bin/env node

// ===================================
// Installation Verification Script
// ===================================

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

console.log(chalk.cyan('\n========================================'));
console.log(chalk.cyan('  SIAS Admin - Installation Verification'));
console.log(chalk.cyan('========================================\n'));

const checks = [];

// Check 1: Node.js version
try {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

    if (majorVersion >= 16) {
        checks.push({ name: 'Node.js version', status: 'pass', detail: nodeVersion });
    } else {
        checks.push({ name: 'Node.js version', status: 'fail', detail: `${nodeVersion} (need 16+)` });
    }
} catch (error) {
    checks.push({ name: 'Node.js version', status: 'fail', detail: error.message });
}

// Check 2: Dependencies installed
const requiredDeps = ['sharp', 'marked', 'simple-git', 'chalk'];
requiredDeps.forEach(dep => {
    try {
        require.resolve(dep);
        checks.push({ name: `Package: ${dep}`, status: 'pass', detail: '✓' });
    } catch (error) {
        checks.push({ name: `Package: ${dep}`, status: 'fail', detail: 'Not installed' });
    }
});

// Check 3: Directory structure
const requiredDirs = [
    'css',
    'js',
    'tools',
    'uploads/pending',
    'uploads/processed'
];

requiredDirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (fs.existsSync(dirPath)) {
        checks.push({ name: `Directory: ${dir}`, status: 'pass', detail: '✓' });
    } else {
        checks.push({ name: `Directory: ${dir}`, status: 'fail', detail: 'Missing' });
    }
});

// Check 4: Required files
const requiredFiles = [
    'index.html',
    'config.json',
    'package.json',
    'css/admin-styles.css',
    'js/admin.js',
    'tools/process-uploads.js',
    'tools/image-optimizer.js',
    'tools/markdown-to-json.js',
    'tools/update-metadata.js',
    'tools/git-auto-commit.js'
];

requiredFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        checks.push({ name: `File: ${file}`, status: 'pass', detail: '✓' });
    } else {
        checks.push({ name: `File: ${file}`, status: 'fail', detail: 'Missing' });
    }
});

// Check 5: Config file validity
try {
    const configPath = path.join(__dirname, 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (config.projectRoot && config.categories && config.imageSettings) {
        checks.push({ name: 'Configuration', status: 'pass', detail: 'Valid' });
    } else {
        checks.push({ name: 'Configuration', status: 'fail', detail: 'Invalid structure' });
    }
} catch (error) {
    checks.push({ name: 'Configuration', status: 'fail', detail: error.message });
}

// Check 6: Git repository
try {
    const projectRoot = require('./config.json').projectRoot;
    const gitPath = path.join(projectRoot, '.git');

    if (fs.existsSync(gitPath)) {
        checks.push({ name: 'Git repository', status: 'pass', detail: '✓' });
    } else {
        checks.push({ name: 'Git repository', status: 'warn', detail: 'Not a git repo' });
    }
} catch (error) {
    checks.push({ name: 'Git repository', status: 'warn', detail: 'Cannot verify' });
}

// Check 7: Project directories
try {
    const config = require('./config.json');
    const projectDirs = [
        path.join(config.projectRoot, 'images/life-science'),
        path.join(config.projectRoot, 'images/earth-science'),
        path.join(config.projectRoot, 'images/physical-science'),
        path.join(config.projectRoot, 'content/life-science'),
        path.join(config.projectRoot, 'content/earth-science'),
        path.join(config.projectRoot, 'content/physical-science')
    ];

    let allExist = true;
    projectDirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            allExist = false;
        }
    });

    if (allExist) {
        checks.push({ name: 'Project directories', status: 'pass', detail: '✓' });
    } else {
        checks.push({ name: 'Project directories', status: 'warn', detail: 'Some missing' });
    }
} catch (error) {
    checks.push({ name: 'Project directories', status: 'warn', detail: 'Cannot verify' });
}

// Display results
let passCount = 0;
let failCount = 0;
let warnCount = 0;

checks.forEach(check => {
    let icon, color;

    if (check.status === 'pass') {
        icon = '✓';
        color = chalk.green;
        passCount++;
    } else if (check.status === 'fail') {
        icon = '✗';
        color = chalk.red;
        failCount++;
    } else {
        icon = '⚠';
        color = chalk.yellow;
        warnCount++;
    }

    console.log(color(`${icon} ${check.name}: ${check.detail}`));
});

// Summary
console.log(chalk.cyan('\n========================================'));
console.log(chalk.cyan('  Summary'));
console.log(chalk.cyan('========================================\n'));

console.log(chalk.green(`✓ Passed: ${passCount}`));
if (warnCount > 0) {
    console.log(chalk.yellow(`⚠ Warnings: ${warnCount}`));
}
if (failCount > 0) {
    console.log(chalk.red(`✗ Failed: ${failCount}`));
}

// Overall status
console.log('');
if (failCount === 0) {
    console.log(chalk.green('🎉 Installation verified! You\'re ready to go!'));
    console.log(chalk.gray('\nNext steps:'));
    console.log(chalk.gray('  1. Open admin/index.html in your browser'));
    console.log(chalk.gray('  2. Upload some photos'));
    console.log(chalk.gray('  3. Run: npm run process'));
    console.log('');
    process.exit(0);
} else {
    console.log(chalk.red('❌ Installation has issues. Please fix the failed checks.'));
    console.log(chalk.gray('\nTo fix:'));
    console.log(chalk.gray('  1. Run: npm install'));
    console.log(chalk.gray('  2. Check file paths'));
    console.log(chalk.gray('  3. Run this script again'));
    console.log('');
    process.exit(1);
}

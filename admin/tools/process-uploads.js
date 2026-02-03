#!/usr/bin/env node

// ===================================
// Main Upload Processor
// Orchestrates the entire workflow
// ===================================

const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');
const ImageOptimizer = require('./image-optimizer');
const MarkdownToJsonConverter = require('./markdown-to-json');
const MetadataUpdater = require('./update-metadata');
const GitAutoCommit = require('./git-auto-commit');

class UploadProcessor {
    constructor(configPath) {
        this.loadConfig(configPath);
    }

    /**
     * Load configuration
     */
    async loadConfig(configPath) {
        try {
            const configFile = await fs.readFile(configPath, 'utf8');
            this.config = JSON.parse(configFile);

            // Initialize components
            this.imageOptimizer = new ImageOptimizer(this.config);
            this.markdownConverter = new MarkdownToJsonConverter();
            this.metadataUpdater = new MetadataUpdater(
                path.join(this.config.projectRoot, this.config.metadataFile)
            );
            this.gitCommit = new GitAutoCommit(this.config.projectRoot);

            console.log(chalk.green('✓ Configuration loaded'));
        } catch (error) {
            console.error(chalk.red('✗ Failed to load configuration:'), error.message);
            process.exit(1);
        }
    }

    /**
     * Get all files from pending directory
     * @returns {Promise<Object>} - Categorized files
     */
    async getPendingFiles() {
        const pendingDir = path.join(this.config.projectRoot, this.config.uploadsDir);

        try {
            const files = await fs.readdir(pendingDir);

            const categorized = {
                images: [],
                markdown: [],
                metadata: []
            };

            for (const file of files) {
                const ext = path.extname(file).toLowerCase();

                if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
                    categorized.images.push(file);
                } else if (['.md', '.markdown'].includes(ext)) {
                    categorized.markdown.push(file);
                } else if (ext === '.json') {
                    categorized.metadata.push(file);
                }
            }

            return categorized;
        } catch (error) {
            console.error(chalk.red('✗ Error reading pending directory:'), error.message);
            return { images: [], markdown: [], metadata: [] };
        }
    }

    /**
     * Load upload metadata file
     * @param {string} metadataFile - Metadata filename
     * @returns {Promise<Object>}
     */
    async loadUploadMetadata(metadataFile) {
        try {
            const metadataPath = path.join(
                this.config.projectRoot,
                this.config.uploadsDir,
                metadataFile
            );

            const content = await fs.readFile(metadataPath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error(chalk.yellow('⚠ No metadata file found, will process manually'));
            return null;
        }
    }

    /**
     * Process a single image
     * @param {Object} photoData - Photo metadata
     * @returns {Promise<Object>}
     */
    async processImage(photoData) {
        const { filename, title, category, hasMarkdown, markdownFilename } = photoData;

        console.log(chalk.blue(`\n📸 Processing: ${filename}`));

        try {
            // Paths
            const sourcePath = path.join(this.config.projectRoot, this.config.uploadsDir, filename);
            const destPath = path.join(this.config.projectRoot, this.config.imagesDir, category, filename);

            // Optimize and move image
            console.log(chalk.gray('  Optimizing image...'));
            const optimizeResult = await this.imageOptimizer.optimizeImage(sourcePath, destPath);

            if (!optimizeResult.success) {
                throw new Error(optimizeResult.error);
            }

            console.log(chalk.green(`  ✓ Image optimized (saved ${optimizeResult.savedPercent}%)`));

            // Process markdown if exists
            let contentResult = null;
            const contentPath = path.join(
                this.config.projectRoot,
                this.config.contentDir,
                category,
                `${path.parse(filename).name}.json`
            );

            if (hasMarkdown && markdownFilename) {
                console.log(chalk.gray('  Converting markdown to JSON...'));
                const markdownPath = path.join(
                    this.config.projectRoot,
                    this.config.uploadsDir,
                    markdownFilename
                );

                contentResult = await this.markdownConverter.convertFile(markdownPath, contentPath);

                if (contentResult.success) {
                    console.log(chalk.green('  ✓ Markdown converted'));
                } else {
                    console.log(chalk.yellow('  ⚠ Markdown conversion failed, creating empty content'));
                    await this.markdownConverter.createEmpty(contentPath);
                }
            } else {
                console.log(chalk.gray('  Creating empty content file...'));
                await this.markdownConverter.createEmpty(contentPath);
                console.log(chalk.green('  ✓ Empty content created'));
            }

            return {
                success: true,
                filename,
                title,
                category,
                hasContent: hasMarkdown && contentResult?.success,
                optimizeResult,
                contentResult
            };
        } catch (error) {
            console.error(chalk.red(`  ✗ Error processing ${filename}:`), error.message);
            return {
                success: false,
                filename,
                error: error.message
            };
        }
    }

    /**
     * Clean up processed files
     * @param {Array} files - Files to move to processed folder
     */
    async cleanupProcessedFiles(files) {
        const pendingDir = path.join(this.config.projectRoot, this.config.uploadsDir);
        const processedDir = path.join(this.config.projectRoot, this.config.processedDir);

        try {
            await fs.mkdir(processedDir, { recursive: true });

            for (const file of files) {
                const sourcePath = path.join(pendingDir, file);
                const destPath = path.join(processedDir, `${Date.now()}-${file}`);

                try {
                    await fs.rename(sourcePath, destPath);
                } catch (error) {
                    // File might not exist, that's okay
                }
            }

            console.log(chalk.green(`\n✓ Moved ${files.length} file(s) to processed folder`));
        } catch (error) {
            console.log(chalk.yellow('⚠ Cleanup warning:'), error.message);
        }
    }

    /**
     * Main processing workflow
     */
    async process() {
        console.log(chalk.cyan('\n========================================'));
        console.log(chalk.cyan('  SIAS Admin - Upload Processor'));
        console.log(chalk.cyan('========================================\n'));

        try {
            // Get pending files
            console.log(chalk.blue('📂 Scanning pending uploads...'));
            const files = await this.getPendingFiles();

            if (files.images.length === 0) {
                console.log(chalk.yellow('\n⚠ No images found in pending folder'));
                console.log(chalk.gray(`   Location: ${path.join(this.config.projectRoot, this.config.uploadsDir)}`));
                return;
            }

            console.log(chalk.green(`✓ Found ${files.images.length} image(s) to process`));

            // Try to load metadata file
            const metadata = files.metadata.length > 0
                ? await this.loadUploadMetadata(files.metadata[0])
                : null;

            // Process each image
            const results = [];
            const categoryCounts = {};

            if (metadata && metadata.photos) {
                // Process using metadata
                for (const photoData of metadata.photos) {
                    const result = await this.processImage(photoData);
                    results.push(result);

                    if (result.success) {
                        categoryCounts[result.category] = (categoryCounts[result.category] || 0) + 1;
                    }
                }
            } else {
                // Process manually (will need manual category assignment)
                console.log(chalk.yellow('\n⚠ Processing without metadata - using default settings'));

                for (const imageFile of files.images) {
                    // Extract title from filename
                    const title = path.parse(imageFile).name.replace(/[-_]/g, ' ');

                    // Default to life-science (you can change this)
                    const category = 'life-science';

                    const photoData = {
                        filename: imageFile,
                        title,
                        category,
                        hasMarkdown: false
                    };

                    const result = await this.processImage(photoData);
                    results.push(result);

                    if (result.success) {
                        categoryCounts[result.category] = (categoryCounts[result.category] || 0) + 1;
                    }
                }
            }

            // Update gallery metadata
            const successfulResults = results.filter(r => r.success);

            if (successfulResults.length > 0) {
                console.log(chalk.blue('\n📝 Updating gallery metadata...'));

                const newImages = successfulResults.map(r => ({
                    filename: r.filename,
                    title: r.title,
                    category: r.category,
                    hasContent: r.hasContent
                }));

                const metadataResult = await this.metadataUpdater.addImages(newImages);

                if (metadataResult.success) {
                    console.log(chalk.green(`✓ Gallery metadata updated (${metadataResult.totalImages} total images)`));
                } else {
                    console.error(chalk.red('✗ Failed to update metadata'));
                }
            }

            // Git commit and push
            if (this.config.git.autoCommit && successfulResults.length > 0) {
                console.log(chalk.blue('\n🔄 Committing to git...'));

                const commitMessage = GitAutoCommit.generateCommitMessage(
                    successfulResults.length,
                    categoryCounts
                );

                const gitResult = await this.gitCommit.autoCommitAndPush({
                    message: commitMessage,
                    pullFirst: true
                });

                if (gitResult.success) {
                    console.log(chalk.green('✓ Changes committed and pushed to GitHub'));
                } else {
                    console.error(chalk.red('✗ Git operation failed:'), gitResult.error);
                }
            }

            // Cleanup
            const filesToCleanup = [
                ...files.images,
                ...files.markdown,
                ...files.metadata
            ];
            await this.cleanupProcessedFiles(filesToCleanup);

            // Summary
            console.log(chalk.cyan('\n========================================'));
            console.log(chalk.cyan('  Processing Complete!'));
            console.log(chalk.cyan('========================================'));
            console.log(chalk.green(`\n✓ Successfully processed: ${successfulResults.length} image(s)`));

            const failedResults = results.filter(r => !r.success);
            if (failedResults.length > 0) {
                console.log(chalk.red(`✗ Failed: ${failedResults.length} image(s)`));
            }

            console.log(chalk.gray('\nCategory breakdown:'));
            Object.entries(categoryCounts).forEach(([category, count]) => {
                console.log(chalk.gray(`  ${category}: ${count}`));
            });

            console.log('');
        } catch (error) {
            console.error(chalk.red('\n✗ Processing failed:'), error.message);
            console.error(error);
            process.exit(1);
        }
    }
}

// Run if called directly
if (require.main === module) {
    const configPath = path.join(__dirname, '../config.json');
    const processor = new UploadProcessor(configPath);

    // Handle async initialization
    (async () => {
        await processor.loadConfig(configPath);
        await processor.process();
    })().catch(error => {
        console.error(chalk.red('Fatal error:'), error);
        process.exit(1);
    });
}

module.exports = UploadProcessor;

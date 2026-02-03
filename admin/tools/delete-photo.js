#!/usr/bin/env node

// ===================================
// Delete Photo Tool
// Removes photos and all associated files
// ===================================

const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');
const MetadataUpdater = require('./update-metadata');
const GitAutoCommit = require('./git-auto-commit');

class PhotoDeleter {
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
     * Delete a single photo by ID
     * @param {number} photoId - ID of photo to delete
     * @returns {Promise<Object>}
     */
    async deletePhotoById(photoId) {
        try {
            console.log(chalk.blue(`\n🗑️  Deleting photo ID: ${photoId}`));

            // Get photo metadata
            const metadata = await this.metadataUpdater.readMetadata();
            const photo = metadata.images.find(img => img.id === photoId);

            if (!photo) {
                return {
                    success: false,
                    error: `Photo with ID ${photoId} not found`
                };
            }

            console.log(chalk.gray(`   Title: ${photo.title}`));
            console.log(chalk.gray(`   Category: ${photo.category}`));

            // Delete image file
            const imagePath = path.join(this.config.projectRoot, photo.imagePath);
            console.log(chalk.gray('\n   Deleting image file...'));

            try {
                await fs.unlink(imagePath);
                console.log(chalk.green(`   ✓ Deleted: ${photo.imagePath}`));
            } catch (error) {
                console.log(chalk.yellow(`   ⚠ Image file not found: ${photo.imagePath}`));
            }

            // Delete content file
            const contentPath = path.join(this.config.projectRoot, photo.contentFile);
            console.log(chalk.gray('   Deleting content file...'));

            try {
                await fs.unlink(contentPath);
                console.log(chalk.green(`   ✓ Deleted: ${photo.contentFile}`));
            } catch (error) {
                console.log(chalk.yellow(`   ⚠ Content file not found: ${photo.contentFile}`));
            }

            // Remove from metadata
            console.log(chalk.gray('   Updating metadata...'));
            const removeResult = await this.metadataUpdater.removeImage(photoId);

            if (!removeResult.success) {
                throw new Error(removeResult.error);
            }

            console.log(chalk.green(`   ✓ Removed from metadata`));
            console.log(chalk.gray(`   Total images now: ${removeResult.totalImages}`));

            return {
                success: true,
                deletedPhoto: photo,
                totalImages: removeResult.totalImages
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                photoId
            };
        }
    }

    /**
     * Delete multiple photos
     * @param {Array<number>} photoIds - Array of photo IDs
     * @returns {Promise<Object>}
     */
    async deleteMultiplePhotos(photoIds) {
        const results = [];

        for (const photoId of photoIds) {
            const result = await this.deletePhotoById(photoId);
            results.push(result);
        }

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        return {
            success: failCount === 0,
            successCount,
            failCount,
            results
        };
    }

    /**
     * Delete photos by category
     * @param {string} category - Category name
     * @returns {Promise<Object>}
     */
    async deleteByCategory(category) {
        try {
            const photos = await this.metadataUpdater.getImagesByCategory(category);

            if (photos.length === 0) {
                return {
                    success: false,
                    error: `No photos found in category: ${category}`
                };
            }

            console.log(chalk.yellow(`\n⚠️  WARNING: This will delete ${photos.length} photo(s) in ${category}`));

            const photoIds = photos.map(p => p.id);
            return await this.deleteMultiplePhotos(photoIds);
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Delete and commit to git
     * @param {number|Array<number>} photoIds - Photo ID(s) to delete
     * @param {boolean} autoCommit - Auto commit to git
     * @returns {Promise<Object>}
     */
    async deleteAndCommit(photoIds, autoCommit = true) {
        const ids = Array.isArray(photoIds) ? photoIds : [photoIds];

        console.log(chalk.cyan('\n========================================'));
        console.log(chalk.cyan('  Photo Deletion'));
        console.log(chalk.cyan('========================================\n'));

        // Delete photos
        const deleteResult = await this.deleteMultiplePhotos(ids);

        if (!deleteResult.success) {
            console.log(chalk.red(`\n✗ Deletion failed: ${deleteResult.failCount} error(s)`));
            return deleteResult;
        }

        console.log(chalk.green(`\n✓ Successfully deleted ${deleteResult.successCount} photo(s)`));

        // Commit to git
        if (autoCommit && this.config.git.autoCommit) {
            console.log(chalk.blue('\n🔄 Committing to git...'));

            const commitMessage = `Delete ${deleteResult.successCount} image${deleteResult.successCount > 1 ? 's' : ''} via admin interface\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`;

            const gitResult = await this.gitCommit.autoCommitAndPush({
                message: commitMessage,
                pullFirst: true
            });

            if (gitResult.success) {
                console.log(chalk.green('✓ Changes committed and pushed to GitHub'));
            } else {
                console.log(chalk.yellow('⚠ Git operation failed (files still deleted locally)'));
            }

            return {
                ...deleteResult,
                gitResult
            };
        }

        return deleteResult;
    }

    /**
     * List all photos for selection
     * @returns {Promise<Array>}
     */
    async listPhotos() {
        const metadata = await this.metadataUpdater.readMetadata();
        return metadata.images;
    }

    /**
     * Search photos
     * @param {string} searchTerm
     * @returns {Promise<Array>}
     */
    async searchPhotos(searchTerm) {
        return await this.metadataUpdater.searchImages(searchTerm);
    }
}

module.exports = PhotoDeleter;

// If run directly
if (require.main === module) {
    const configPath = path.join(__dirname, '../config.json');
    const deleter = new PhotoDeleter(configPath);

    // Get photo ID from command line
    const photoId = parseInt(process.argv[2]);

    if (!photoId || isNaN(photoId)) {
        console.log(chalk.red('Usage: node delete-photo.js <photo-id>'));
        console.log(chalk.gray('\nExample: node delete-photo.js 73'));
        console.log(chalk.gray('\nTo list all photos, use: npm run list-photos'));
        process.exit(1);
    }

    (async () => {
        await deleter.loadConfig(configPath);

        // Confirm deletion
        console.log(chalk.yellow('\n⚠️  WARNING: This action cannot be undone!'));
        console.log(chalk.gray('Press Ctrl+C to cancel, or wait 3 seconds to proceed...'));

        await new Promise(resolve => setTimeout(resolve, 3000));

        const result = await deleter.deleteAndCommit(photoId);

        if (result.success) {
            console.log(chalk.green('\n✓ Deletion complete!'));
            process.exit(0);
        } else {
            console.log(chalk.red('\n✗ Deletion failed'));
            process.exit(1);
        }
    })();
}

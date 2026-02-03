// ===================================
// Metadata Updater
// Updates gallery-metadata.json
// ===================================

const fs = require('fs').promises;
const path = require('path');

class MetadataUpdater {
    constructor(metadataPath) {
        this.metadataPath = metadataPath;
        this.encoding = 'utf8';
    }

    /**
     * Read existing metadata file
     * @returns {Promise<Object>} - Current metadata
     */
    async readMetadata() {
        try {
            const content = await fs.readFile(this.metadataPath, this.encoding);
            return JSON.parse(content);
        } catch (error) {
            // If file doesn't exist, return empty structure
            if (error.code === 'ENOENT') {
                return {
                    lastUpdated: new Date().toISOString(),
                    totalImages: 0,
                    images: []
                };
            }
            throw error;
        }
    }

    /**
     * Write metadata to file
     * @param {Object} metadata - Metadata object to write
     * @returns {Promise<void>}
     */
    async writeMetadata(metadata) {
        await fs.writeFile(
            this.metadataPath,
            JSON.stringify(metadata, null, 2),
            this.encoding
        );
    }

    /**
     * Add new images to metadata
     * @param {Array} newImages - Array of image objects to add
     * @returns {Promise<Object>} - Updated metadata
     */
    async addImages(newImages) {
        const metadata = await this.readMetadata();

        // Get the highest existing ID
        let maxId = 0;
        if (metadata.images.length > 0) {
            maxId = Math.max(...metadata.images.map(img => img.id));
        }

        // Add new images with incremented IDs
        newImages.forEach((image, index) => {
            const newImage = {
                id: maxId + index + 1,
                filename: image.filename,
                category: image.category,
                imagePath: `images/${image.category}/${image.filename}`,
                contentFile: `content/${image.category}/${path.parse(image.filename).name}.json`,
                title: image.title,
                hasContent: image.hasContent || false
            };

            metadata.images.push(newImage);
        });

        // Update metadata
        metadata.totalImages = metadata.images.length;
        metadata.lastUpdated = new Date().toISOString();

        await this.writeMetadata(metadata);

        return {
            success: true,
            addedCount: newImages.length,
            totalImages: metadata.totalImages,
            metadata
        };
    }

    /**
     * Update an existing image entry
     * @param {number} imageId - ID of image to update
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} - Update result
     */
    async updateImage(imageId, updates) {
        const metadata = await this.readMetadata();

        const imageIndex = metadata.images.findIndex(img => img.id === imageId);

        if (imageIndex === -1) {
            return {
                success: false,
                error: `Image with ID ${imageId} not found`
            };
        }

        // Update the image
        metadata.images[imageIndex] = {
            ...metadata.images[imageIndex],
            ...updates
        };

        metadata.lastUpdated = new Date().toISOString();

        await this.writeMetadata(metadata);

        return {
            success: true,
            updatedImage: metadata.images[imageIndex]
        };
    }

    /**
     * Remove an image from metadata
     * @param {number} imageId - ID of image to remove
     * @returns {Promise<Object>} - Removal result
     */
    async removeImage(imageId) {
        const metadata = await this.readMetadata();

        const imageIndex = metadata.images.findIndex(img => img.id === imageId);

        if (imageIndex === -1) {
            return {
                success: false,
                error: `Image with ID ${imageId} not found`
            };
        }

        const removedImage = metadata.images[imageIndex];
        metadata.images.splice(imageIndex, 1);

        metadata.totalImages = metadata.images.length;
        metadata.lastUpdated = new Date().toISOString();

        await this.writeMetadata(metadata);

        return {
            success: true,
            removedImage,
            totalImages: metadata.totalImages
        };
    }

    /**
     * Get images by category
     * @param {string} category - Category to filter by
     * @returns {Promise<Array>} - Filtered images
     */
    async getImagesByCategory(category) {
        const metadata = await this.readMetadata();
        return metadata.images.filter(img => img.category === category);
    }

    /**
     * Search images by title
     * @param {string} searchTerm - Term to search for
     * @returns {Promise<Array>} - Matching images
     */
    async searchImages(searchTerm) {
        const metadata = await this.readMetadata();
        const term = searchTerm.toLowerCase();

        return metadata.images.filter(img =>
            img.title.toLowerCase().includes(term) ||
            img.filename.toLowerCase().includes(term)
        );
    }

    /**
     * Get statistics about the gallery
     * @returns {Promise<Object>} - Gallery statistics
     */
    async getStats() {
        const metadata = await this.readMetadata();

        const stats = {
            totalImages: metadata.totalImages,
            lastUpdated: metadata.lastUpdated,
            byCategory: {},
            withContent: 0,
            withoutContent: 0
        };

        metadata.images.forEach(img => {
            // Count by category
            if (!stats.byCategory[img.category]) {
                stats.byCategory[img.category] = 0;
            }
            stats.byCategory[img.category]++;

            // Count content
            if (img.hasContent) {
                stats.withContent++;
            } else {
                stats.withoutContent++;
            }
        });

        return stats;
    }

    /**
     * Validate metadata structure
     * @returns {Promise<Object>} - Validation result
     */
    async validate() {
        try {
            const metadata = await this.readMetadata();

            const errors = [];

            if (!metadata.lastUpdated) {
                errors.push('Missing lastUpdated field');
            }

            if (typeof metadata.totalImages !== 'number') {
                errors.push('totalImages must be a number');
            }

            if (!Array.isArray(metadata.images)) {
                errors.push('images must be an array');
            }

            if (metadata.totalImages !== metadata.images.length) {
                errors.push(`totalImages (${metadata.totalImages}) doesn't match images array length (${metadata.images.length})`);
            }

            // Validate each image
            metadata.images.forEach((img, index) => {
                if (!img.id) errors.push(`Image ${index}: missing id`);
                if (!img.filename) errors.push(`Image ${index}: missing filename`);
                if (!img.category) errors.push(`Image ${index}: missing category`);
                if (!img.imagePath) errors.push(`Image ${index}: missing imagePath`);
                if (!img.contentFile) errors.push(`Image ${index}: missing contentFile`);
                if (!img.title) errors.push(`Image ${index}: missing title`);
            });

            return {
                valid: errors.length === 0,
                errors,
                metadata
            };
        } catch (error) {
            return {
                valid: false,
                errors: [error.message]
            };
        }
    }
}

module.exports = MetadataUpdater;

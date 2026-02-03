// ===================================
// Image Optimizer
// Resizes and optimizes images
// ===================================

const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

class ImageOptimizer {
    constructor(config) {
        this.maxWidth = config.imageSettings.maxWidth || 2000;
        this.maxHeight = config.imageSettings.maxHeight || 2000;
        this.quality = config.imageSettings.quality || 90;
        this.format = config.imageSettings.format || 'jpeg';
    }

    /**
     * Optimize a single image
     * @param {string} inputPath - Path to input image
     * @param {string} outputPath - Path to save optimized image
     * @returns {Promise<Object>} - Optimization stats
     */
    async optimizeImage(inputPath, outputPath) {
        try {
            const stats = await fs.stat(inputPath);
            const originalSize = stats.size;

            // Get image metadata
            const metadata = await sharp(inputPath).metadata();

            // Determine if resize is needed
            const needsResize = metadata.width > this.maxWidth || metadata.height > this.maxHeight;

            let sharpInstance = sharp(inputPath);

            // Resize if needed
            if (needsResize) {
                sharpInstance = sharpInstance.resize(this.maxWidth, this.maxHeight, {
                    fit: 'inside',
                    withoutEnlargement: true
                });
            }

            // Apply format and quality
            if (this.format === 'jpeg' || this.format === 'jpg') {
                sharpInstance = sharpInstance.jpeg({ quality: this.quality });
            } else if (this.format === 'png') {
                sharpInstance = sharpInstance.png({ quality: this.quality });
            } else if (this.format === 'webp') {
                sharpInstance = sharpInstance.webp({ quality: this.quality });
            }

            // Ensure output directory exists
            const outputDir = path.dirname(outputPath);
            await fs.mkdir(outputDir, { recursive: true });

            // Save optimized image
            await sharpInstance.toFile(outputPath);

            const newStats = await fs.stat(outputPath);
            const optimizedSize = newStats.size;

            return {
                success: true,
                originalSize,
                optimizedSize,
                savedBytes: originalSize - optimizedSize,
                savedPercent: ((originalSize - optimizedSize) / originalSize * 100).toFixed(2),
                wasResized: needsResize,
                originalDimensions: { width: metadata.width, height: metadata.height },
                outputPath
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                inputPath,
                outputPath
            };
        }
    }

    /**
     * Optimize multiple images
     * @param {Array} images - Array of {input, output} objects
     * @returns {Promise<Array>} - Array of optimization results
     */
    async optimizeBatch(images) {
        const results = [];

        for (const image of images) {
            const result = await this.optimizeImage(image.input, image.output);
            results.push({
                filename: path.basename(image.input),
                ...result
            });
        }

        return results;
    }

    /**
     * Get image info without optimizing
     * @param {string} imagePath - Path to image
     * @returns {Promise<Object>} - Image metadata
     */
    async getImageInfo(imagePath) {
        try {
            const metadata = await sharp(imagePath).metadata();
            const stats = await fs.stat(imagePath);

            return {
                width: metadata.width,
                height: metadata.height,
                format: metadata.format,
                size: stats.size,
                sizeKB: (stats.size / 1024).toFixed(2),
                needsOptimization: metadata.width > this.maxWidth || metadata.height > this.maxHeight
            };
        } catch (error) {
            throw new Error(`Failed to get image info: ${error.message}`);
        }
    }

    /**
     * Format bytes to human-readable string
     * @param {number} bytes
     * @returns {string}
     */
    static formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

module.exports = ImageOptimizer;

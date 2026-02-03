// ===================================
// Markdown to JSON Converter
// Converts .md files to JSON format
// ===================================

const fs = require('fs').promises;
const path = require('path');

class MarkdownToJsonConverter {
    constructor() {
        this.encoding = 'utf8';
    }

    /**
     * Convert a markdown file to JSON format
     * @param {string} markdownPath - Path to .md file
     * @param {string} jsonPath - Path to save JSON file
     * @param {Object} additionalData - Additional data to include in JSON
     * @returns {Promise<Object>} - Conversion result
     */
    async convertFile(markdownPath, jsonPath, additionalData = {}) {
        try {
            // Read markdown content
            const markdownContent = await fs.readFile(markdownPath, this.encoding);

            // Create JSON structure matching the existing format
            const jsonData = {
                content: markdownContent,
                ...additionalData
            };

            // Ensure output directory exists
            const outputDir = path.dirname(jsonPath);
            await fs.mkdir(outputDir, { recursive: true });

            // Write JSON file
            await fs.writeFile(jsonPath, JSON.stringify(jsonData, null, 2), this.encoding);

            return {
                success: true,
                markdownPath,
                jsonPath,
                contentLength: markdownContent.length,
                message: 'Markdown successfully converted to JSON'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                markdownPath,
                jsonPath
            };
        }
    }

    /**
     * Convert multiple markdown files
     * @param {Array} conversions - Array of {markdownPath, jsonPath, additionalData}
     * @returns {Promise<Array>} - Array of conversion results
     */
    async convertBatch(conversions) {
        const results = [];

        for (const conversion of conversions) {
            const result = await this.convertFile(
                conversion.markdownPath,
                conversion.jsonPath,
                conversion.additionalData || {}
            );

            results.push({
                filename: path.basename(conversion.markdownPath),
                ...result
            });
        }

        return results;
    }

    /**
     * Create a JSON file from markdown string content
     * @param {string} markdownContent - Markdown content as string
     * @param {string} jsonPath - Path to save JSON file
     * @param {Object} additionalData - Additional data to include
     * @returns {Promise<Object>} - Creation result
     */
    async createFromString(markdownContent, jsonPath, additionalData = {}) {
        try {
            const jsonData = {
                content: markdownContent,
                ...additionalData
            };

            const outputDir = path.dirname(jsonPath);
            await fs.mkdir(outputDir, { recursive: true });

            await fs.writeFile(jsonPath, JSON.stringify(jsonData, null, 2), this.encoding);

            return {
                success: true,
                jsonPath,
                contentLength: markdownContent.length
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                jsonPath
            };
        }
    }

    /**
     * Create an empty JSON content file (for images without markdown)
     * @param {string} jsonPath - Path to save JSON file
     * @returns {Promise<Object>} - Creation result
     */
    async createEmpty(jsonPath) {
        try {
            const jsonData = {
                content: ""
            };

            const outputDir = path.dirname(jsonPath);
            await fs.mkdir(outputDir, { recursive: true });

            await fs.writeFile(jsonPath, JSON.stringify(jsonData, null, 2), this.encoding);

            return {
                success: true,
                jsonPath,
                isEmpty: true
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                jsonPath
            };
        }
    }

    /**
     * Validate markdown file exists and is readable
     * @param {string} markdownPath - Path to markdown file
     * @returns {Promise<boolean>}
     */
    async validateMarkdownFile(markdownPath) {
        try {
            const stats = await fs.stat(markdownPath);
            return stats.isFile() && (path.extname(markdownPath) === '.md' || path.extname(markdownPath) === '.markdown');
        } catch (error) {
            return false;
        }
    }

    /**
     * Read existing JSON content file
     * @param {string} jsonPath - Path to JSON file
     * @returns {Promise<Object>} - JSON content
     */
    async readJsonFile(jsonPath) {
        try {
            const content = await fs.readFile(jsonPath, this.encoding);
            return JSON.parse(content);
        } catch (error) {
            throw new Error(`Failed to read JSON file: ${error.message}`);
        }
    }
}

module.exports = MarkdownToJsonConverter;

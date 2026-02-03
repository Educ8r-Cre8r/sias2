#!/usr/bin/env node

// ===================================
// Complete API Server with File Uploads
// Handles everything automatically
// ===================================

const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const formidable = require('formidable');
const PhotoDeleter = require('./delete-photo');
const MetadataUpdater = require('./update-metadata');
const UploadProcessor = require('./process-uploads');
const ImageOptimizer = require('./image-optimizer');
const MarkdownToJsonConverter = require('./markdown-to-json');
const GitAutoCommit = require('./git-auto-commit');

const PORT = 3333;
const configPath = path.join(__dirname, '../config.json');

// Initialize tools
let config, photoDeleter, metadataUpdater, uploadProcessor, imageOptimizer, markdownConverter, gitCommit;

async function initialize() {
    const configFile = await fs.readFile(configPath, 'utf8');
    config = JSON.parse(configFile);

    photoDeleter = new PhotoDeleter(configPath);
    await photoDeleter.loadConfig(configPath);

    const metadataPath = path.join(config.projectRoot, config.metadataFile);
    metadataUpdater = new MetadataUpdater(metadataPath);

    imageOptimizer = new ImageOptimizer(config);
    markdownConverter = new MarkdownToJsonConverter();
    gitCommit = new GitAutoCommit(config.projectRoot);

    uploadProcessor = new UploadProcessor(configPath);
    await uploadProcessor.loadConfig(configPath);
}

// CORS headers
function setCORSHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// JSON response helper
function jsonResponse(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

// Serve static files
async function serveStatic(req, res, filePath) {
    try {
        const fullPath = path.join(__dirname, '..', filePath);
        const content = await fs.readFile(fullPath);

        const ext = path.extname(fullPath);
        const contentTypes = {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml'
        };

        res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
        res.end(content);
    } catch (error) {
        res.writeHead(404);
        res.end('Not found');
    }
}

// Handle file upload and processing
async function handleUpload(req, res) {
    const form = formidable({
        multiples: true,
        uploadDir: path.join(config.projectRoot, config.uploadsDir),
        keepExtensions: true,
        maxFileSize: 50 * 1024 * 1024, // 50MB
        allowEmptyFiles: true,
        minFileSize: 0
    });

    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error('Upload error:', err);
            return jsonResponse(res, 500, { success: false, error: err.message });
        }

        try {
            console.log('\n🚀 Processing upload request...');
            console.log('Files received:', Object.keys(files));

            // Parse photos data
            const photosData = JSON.parse(fields.photosData);
            const results = [];

            // Process each photo
            for (let i = 0; i < photosData.length; i++) {
                const photoData = photosData[i];
                const photoFile = Array.isArray(files[`photo_${i}`]) ? files[`photo_${i}`][0] : files[`photo_${i}`];
                const markdownFile = files[`markdown_${i}`] ?
                    (Array.isArray(files[`markdown_${i}`]) ? files[`markdown_${i}`][0] : files[`markdown_${i}`]) : null;

                console.log(`\n📸 Processing: ${photoData.title}`);

                // Rename uploaded file to original name
                const originalPath = photoFile.filepath;
                const newPath = path.join(path.dirname(originalPath), photoData.filename);
                await fs.rename(originalPath, newPath);

                // Process image - optimize and move to correct location
                const destPath = path.join(
                    config.projectRoot,
                    config.imagesDir,
                    photoData.category,
                    photoData.filename
                );

                console.log('  Optimizing image...');
                const optimizeResult = await imageOptimizer.optimizeImage(newPath, destPath);

                if (!optimizeResult.success) {
                    throw new Error(`Image optimization failed: ${optimizeResult.error}`);
                }

                console.log(`  ✓ Image optimized (saved ${optimizeResult.savedPercent}%)`);

                // Process markdown if exists
                let hasContent = false;
                const contentPath = path.join(
                    config.projectRoot,
                    config.contentDir,
                    photoData.category,
                    `${path.parse(photoData.filename).name}.json`
                );

                if (markdownFile) {
                    console.log('  Converting markdown to JSON...');
                    console.log('  Markdown file:', markdownFile.originalFilename || markdownFile.newFilename);
                    const mdPath = markdownFile.filepath;
                    const convertResult = await markdownConverter.convertFile(mdPath, contentPath);

                    if (convertResult.success) {
                        console.log('  ✓ Markdown converted');
                        hasContent = true;
                        await fs.unlink(mdPath); // Clean up temp file
                    } else {
                        console.log('  ⚠ Markdown conversion failed:', convertResult.error);
                        console.log('  Creating empty content instead');
                        await markdownConverter.createEmpty(contentPath);
                    }
                } else {
                    console.log('  No markdown file provided - creating empty content file...');
                    await markdownConverter.createEmpty(contentPath);
                }

                // Clean up temp file
                try {
                    await fs.unlink(newPath);
                } catch (e) {
                    // File already moved, that's fine
                }

                results.push({
                    success: true,
                    filename: photoData.filename,
                    title: photoData.title,
                    category: photoData.category,
                    hasContent
                });
            }

            // Update metadata
            console.log('\n📝 Updating gallery metadata...');
            const newImages = results.map(r => ({
                filename: r.filename,
                title: r.title,
                category: r.category,
                hasContent: r.hasContent
            }));

            const metadataResult = await metadataUpdater.addImages(newImages);
            console.log(`✓ Gallery metadata updated (${metadataResult.totalImages} total images)`);

            // Git commit and push
            if (config.git.autoCommit) {
                console.log('\n🔄 Committing to git...');

                const categoryCounts = {};
                results.forEach(r => {
                    categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1;
                });

                const commitMessage = GitAutoCommit.generateCommitMessage(results.length, categoryCounts);

                const gitResult = await gitCommit.autoCommitAndPush({
                    message: commitMessage,
                    pullFirst: true
                });

                if (gitResult.success) {
                    console.log('✓ Changes committed and pushed to GitHub\n');
                } else {
                    console.log('⚠ Git operation failed (files still processed locally)\n');
                }
            }

            // Success response
            jsonResponse(res, 200, {
                success: true,
                processed: results.length,
                results,
                totalImages: metadataResult.totalImages
            });

        } catch (error) {
            console.error('Processing error:', error);
            jsonResponse(res, 500, { success: false, error: error.message });
        }
    });
}

// Handle requests
async function handleRequest(req, res) {
    setCORSHeaders(res);

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);

    try {
        // Serve index.html at root
        if (req.method === 'GET' && url.pathname === '/') {
            await serveStatic(req, res, 'dashboard.html');
        }

        // Serve gallery images from parent directory
        else if (req.method === 'GET' && url.pathname.startsWith('/images/')) {
            try {
                // Decode URL to handle spaces and special characters
                const decodedPath = decodeURIComponent(url.pathname.substring(1));
                const imagePath = path.join(config.projectRoot, decodedPath);
                const content = await fs.readFile(imagePath);
                const ext = path.extname(imagePath);
                const contentTypes = {
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.png': 'image/png',
                    '.gif': 'image/gif',
                    '.webp': 'image/webp'
                };
                res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'image/jpeg' });
                res.end(content);
            } catch (error) {
                console.error('Image serve error:', error);
                res.writeHead(404);
                res.end('Image not found');
            }
        }

        // Serve static files
        else if (req.method === 'GET' && (url.pathname.startsWith('/css/') ||
                                           url.pathname.startsWith('/js/') ||
                                           url.pathname === '/dashboard.html' ||
                                           url.pathname === '/manage.html' ||
                                           url.pathname === '/index.html')) {
            await serveStatic(req, res, url.pathname.substring(1));
        }

        // POST /api/upload - Upload and process photos
        else if (req.method === 'POST' && url.pathname === '/api/upload') {
            await handleUpload(req, res);
        }

        // GET /api/photos - List all photos
        else if (req.method === 'GET' && url.pathname === '/api/photos') {
            const metadata = await metadataUpdater.readMetadata();
            jsonResponse(res, 200, {
                success: true,
                photos: metadata.images,
                totalImages: metadata.totalImages,
                lastUpdated: metadata.lastUpdated
            });
        }

        // GET /api/photos/:id - Get single photo
        else if (req.method === 'GET' && url.pathname.startsWith('/api/photos/')) {
            const id = parseInt(url.pathname.split('/')[3]);
            const metadata = await metadataUpdater.readMetadata();
            const photo = metadata.images.find(img => img.id === id);

            if (photo) {
                jsonResponse(res, 200, { success: true, photo });
            } else {
                jsonResponse(res, 404, { success: false, error: 'Photo not found' });
            }
        }

        // DELETE /api/photos/:id - Delete photo
        else if (req.method === 'DELETE' && url.pathname.startsWith('/api/photos/')) {
            const id = parseInt(url.pathname.split('/')[3]);
            const result = await photoDeleter.deleteAndCommit(id);

            if (result.success) {
                jsonResponse(res, 200, result);
            } else {
                jsonResponse(res, 400, result);
            }
        }

        // GET /api/stats - Get gallery statistics
        else if (req.method === 'GET' && url.pathname === '/api/stats') {
            const stats = await metadataUpdater.getStats();
            jsonResponse(res, 200, { success: true, stats });
        }

        // GET /api/search?q=term - Search photos
        else if (req.method === 'GET' && url.pathname === '/api/search') {
            const searchTerm = url.searchParams.get('q');
            const results = await metadataUpdater.searchImages(searchTerm);
            jsonResponse(res, 200, { success: true, results, count: results.length });
        }

        // 404 - Not found
        else {
            jsonResponse(res, 404, { success: false, error: 'Endpoint not found' });
        }
    } catch (error) {
        console.error('Error:', error);
        jsonResponse(res, 500, { success: false, error: error.message });
    }
}

// Start server
async function start() {
    console.log('🔧 Initializing SIAS Admin Server...\n');
    await initialize();

    const server = http.createServer(handleRequest);

    server.listen(PORT, () => {
        console.log('========================================');
        console.log(`✓ SIAS Admin Server Running!`);
        console.log('========================================\n');
        console.log(`📱 Open in browser: http://localhost:${PORT}`);
        console.log(`🖥️  Admin Dashboard: http://localhost:${PORT}/dashboard.html`);
        console.log(`📸 Manage Photos: http://localhost:${PORT}/manage.html`);
        console.log('\nFeatures:');
        console.log('  ✓ Drag & drop upload');
        console.log('  ✓ Automatic image optimization');
        console.log('  ✓ Markdown to JSON conversion');
        console.log('  ✓ Git auto-commit and push');
        console.log('  ✓ Photo management & deletion');
        console.log('\nPress Ctrl+C to stop\n');
    });
}

// Handle errors
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

// Start if run directly
if (require.main === module) {
    start().catch(error => {
        console.error('Failed to start server:', error);
        process.exit(1);
    });
}

module.exports = { start };

#!/usr/bin/env node

// ===================================
// Simple API Server for Admin Interface
// Provides endpoints for photo management
// ===================================

const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const PhotoDeleter = require('./delete-photo');
const MetadataUpdater = require('./update-metadata');
const UploadProcessor = require('./process-uploads');

const PORT = 3333;
const configPath = path.join(__dirname, '../config.json');

// Initialize tools
let config, photoDeleter, metadataUpdater, uploadProcessor;

async function initialize() {
    const configFile = await fs.readFile(configPath, 'utf8');
    config = JSON.parse(configFile);

    photoDeleter = new PhotoDeleter(configPath);
    await photoDeleter.loadConfig(configPath);

    const metadataPath = path.join(config.projectRoot, config.metadataFile);
    metadataUpdater = new MetadataUpdater(metadataPath);

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
        // GET /api/photos - List all photos
        if (req.method === 'GET' && url.pathname === '/api/photos') {
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

        // POST /api/photos/delete-multiple - Delete multiple photos
        else if (req.method === 'POST' && url.pathname === '/api/photos/delete-multiple') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                const { photoIds } = JSON.parse(body);
                const result = await photoDeleter.deleteAndCommit(photoIds);
                jsonResponse(res, 200, result);
            });
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

        // POST /api/process - Process pending uploads
        else if (req.method === 'POST' && url.pathname === '/api/process') {
            // This would trigger the upload processor
            jsonResponse(res, 200, {
                success: true,
                message: 'Processing started (run npm run process for now)'
            });
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
    console.log('🔧 Initializing...');
    await initialize();

    const server = http.createServer(handleRequest);

    server.listen(PORT, () => {
        console.log(`✓ API Server running at http://localhost:${PORT}`);
        console.log('\nAvailable endpoints:');
        console.log('  GET    /api/photos              - List all photos');
        console.log('  GET    /api/photos/:id          - Get single photo');
        console.log('  DELETE /api/photos/:id          - Delete photo');
        console.log('  POST   /api/photos/delete-multiple - Delete multiple');
        console.log('  GET    /api/stats               - Gallery statistics');
        console.log('  GET    /api/search?q=term       - Search photos');
        console.log('\nPress Ctrl+C to stop');
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

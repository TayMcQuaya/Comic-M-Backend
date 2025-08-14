/**
 * Standalone PDF Export Service
 * This is a separate Express application for handling PDF exports
 * Designed to be deployed on DigitalOcean App Platform
 */

import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';

// Import the puppeteer export logic from the main project
import configurePuppeteerExport from './src/puppeteer-export.js';
import pdfCompressionService from './src/pdf-compression.js';

// Load environment variables
config();

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Express app
const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration
const corsOptions = {
    origin: [
        'https://comic-pro.vercel.app', 
        'http://localhost:5173', 
        'http://localhost:3000',
        // Add your friend's specific origin if they are testing from a different one
        // or ensure your Vercel deployment URL is correctly whitelisted if that's what they use.
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

// Configure body parser with larger limits for bigger comics
app.use(express.json({ 
    limit: '300mb',  // Increased from 150mb to support larger comics
    verify: (req, res, buf) => {
        // Add request size logging
        const size = buf.length / (1024 * 1024);  // Convert to MB
        console.log(`[Server] Received request size: ${size.toFixed(2)}MB`);
        
        // Warn if approaching limit
        if (size > 250) {
            console.warn(`[Server] Large request warning: ${size.toFixed(2)}MB (limit: 300MB)`);
        }
    }
}));

app.use(express.urlencoded({ 
    extended: true, 
    limit: '300mb'  // Increased from 150mb
}));

// Add memory usage monitoring
setInterval(() => {
    const used = process.memoryUsage();
    const memUsage = {
        heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
        rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
        external: `${Math.round(used.external / 1024 / 1024)}MB`
    };
    
    // Add warning if memory usage is high
    const rssUsageMB = Math.round(used.rss / 1024 / 1024);
    if (rssUsageMB > 700) {
        console.warn(`[Server] HIGH MEMORY WARNING! RSS Usage: ${rssUsageMB}MB (Limit: 800MB)`);
    } else if (rssUsageMB > 600) {
        console.warn(`[Server] Memory usage elevated: ${rssUsageMB}MB`);
    } else {
        console.log('[Server] Memory usage:', memUsage);
    }
    
    // Force garbage collection if available and memory is high
    if (global.gc && rssUsageMB > 600) {
        console.log('[Server] Running garbage collection due to high memory usage...');
        global.gc();
    }
}, 60000);  // Log every minute

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Origin: ${req.get('Origin') || 'none'}`);
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        service: 'comic-pro-pdf-service',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Comic-Pro PDF Export Service',
        status: 'running',
        endpoints: {
            health: '/health',
            exportPdf: '/api/export-pdf',
            exportProgress: '/api/export-progress/:jobId',
            downloadPdf: '/api/download-pdf/:jobId'
        }
    });
});

// Set up output directory for exports
const outputDirBase = process.env.EXPORT_OUTPUT_DIR || path.join(__dirname, 'exports');
await fs.ensureDir(outputDirBase);
console.log(`[Server] Export output directory: ${outputDirBase}`);

// Determine the comic creator URL
const comicCreatorUrl = process.env.COMIC_CREATOR_URL || 'http://localhost:5173';
console.log(`[Server] Comic Creator URL: ${comicCreatorUrl}`);

// Configure the Puppeteer export routes
// Create router for API endpoints
const apiRouter = express.Router();
configurePuppeteerExport(apiRouter, comicCreatorUrl, outputDirBase);

// Mount the API router
app.use('/api', apiRouter);

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('[Server] Error:', error);
    
    if (error.message === 'Not allowed by CORS') {
        return res.status(403).json({ error: 'CORS policy violation' });
    }
    
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`[Server] Comic-Pro PDF Service running on port ${PORT}`);
    console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[Server] Comic Creator URL: ${comicCreatorUrl}`);
    console.log(`[Server] Export Directory: ${outputDirBase}`);
    console.log(`[Server] Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[Server] Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('[Server] Received SIGINT, shutting down gracefully...');
    process.exit(0);
}); 
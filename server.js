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

// Trust proxy for DigitalOcean App Platform
app.set('trust proxy', 1);

// CORS configuration
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, etc.)
        if (!origin) return callback(null, true);
        
        // Define allowed origins
        const allowedOrigins = [
            'http://localhost:5173',           // Local development
            'http://localhost:3000',           // Alternative local port
            'https://your-comic-app.vercel.app', // Production Vercel URL (replace with actual)
            /\.vercel\.app$/,                  // Any Vercel deployment
            /localhost:\d+/                    // Any localhost port
        ];
        
        // Check if origin is allowed
        const isAllowed = allowedOrigins.some(allowedOrigin => {
            if (typeof allowedOrigin === 'string') {
                return origin === allowedOrigin;
            }
            return allowedOrigin.test(origin);
        });
        
        if (isAllowed) {
            callback(null, true);
        } else {
            console.log(`[CORS] Blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
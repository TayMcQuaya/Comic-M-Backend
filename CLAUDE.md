# CLAUDE.md - PDF Export Service

This file provides guidance to Claude Code (claude.ai/code) when working with the PDF export service backend.

## Service Overview

Standalone Express.js service for handling PDF exports using Puppeteer, designed for deployment on DigitalOcean Droplets with limited memory (1GB).

## Directory Structure

```
comic-pro-pdf-service-deploy/
├── server.js              # Main Express server
├── src/
│   ├── puppeteer-export.js  # PDF generation with Puppeteer
│   └── pdf-compression.js   # Optional PDF compression via iLovePDF
├── exports/              # Temporary export output directory
├── logs/                 # PM2 log files
└── ecosystem.config.cjs # PM2 configuration
```

## Development Commands

```bash
# Start development server (port 3001)
npm start

# Development with auto-reload
npm run dev

# Production mode
npm run prod

# PM2 commands
npm run pm2:start    # Start with PM2
npm run pm2:restart  # Restart service
npm run pm2:stop     # Stop service
npm run pm2:logs     # View logs
npm run pm2:delete   # Delete from PM2
```

## Deployment Process

### Local Development
1. Navigate to directory: `cd comic-pro-pdf-service-deploy`
2. Install dependencies: `npm install`
3. Start server: `npm start`

### Production Deployment (DigitalOcean)
1. Commit changes: `git add . && git commit -m "message"`
2. Push to main: `git push origin main`
3. SSH to server: `ssh root@DROPLET_IP`
4. Navigate: `cd Comic-M-Backend`
5. Pull changes: `git pull`
6. Restart PM2: `pm2 restart all`

## Core Components

### Express Server (`server.js`)

- **Port**: 3001 (configurable via PORT env)
- **CORS**: Configured for Vercel and localhost origins
- **Body Limit**: 150MB for large project data
- **Memory Monitoring**: Logs memory usage every minute
- **Automatic GC**: Triggers garbage collection when memory > 600MB

### PDF Export Engine (`src/puppeteer-export.js`)

**Export Queue System:**
- Single concurrent export to manage memory
- Queue-based processing for multiple requests
- Job status tracking with unique IDs

**Export Process:**
1. Create job with unique ID
2. Queue export task
3. Launch Puppeteer with optimized settings
4. Render each page as PDF
5. Merge PDFs using pdf-lib
6. Optional compression via iLovePDF
7. Store result for download

**Puppeteer Configuration:**
```javascript
{
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--max_old_space_size=512',
    '--js-flags="--max-old-space-size=512"'
  ],
  executablePath: '/usr/bin/google-chrome' // Production
}
```

### PDF Compression (`src/pdf-compression.js`)

Optional compression using iLovePDF API:
- Requires ILOVEPDF_PUBLIC_KEY and ILOVEPDF_SECRET_KEY
- Compresses PDFs after generation
- Falls back gracefully if not configured

## API Endpoints

### Health Check
```
GET /health
Response: { status: 'healthy', service: 'comic-pro-pdf-service' }
```

### Start Export
```
POST /api/export-pdf
Body: { projectState, exportOptions }
Response: { jobId, status: 'processing' }
```

### Check Progress
```
GET /api/export-progress/:jobId
Response: { jobId, status, progress, message }
```

### Download PDF
```
GET /api/download-pdf/:jobId
Response: PDF file stream
```

## Environment Configuration

Required `.env` variables:
```bash
# Frontend URL for CORS
COMIC_CREATOR_URL=https://comic-pro.vercel.app

# Optional PDF compression
ILOVEPDF_PUBLIC_KEY=your_key
ILOVEPDF_SECRET_KEY=your_secret

# System settings
NODE_ENV=production
PORT=3001
EXPORT_OUTPUT_DIR=./exports
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
```

## PM2 Configuration (`ecosystem.config.cjs`)

- **Memory Limit**: 800MB (restarts if exceeded)
- **Node Args**: Optimized for low memory
- **Restart Policy**: Max 10 restarts, 4s delay
- **Logs**: Stored in `./logs/` directory

## Memory Management

### Strategies
1. **Single Export Queue**: Only one export at a time
2. **Aggressive GC**: Force garbage collection when memory > 600MB
3. **PM2 Auto-restart**: Restarts service if memory > 800MB
4. **Optimized Puppeteer**: Limited page pool, immediate cleanup
5. **Job Cleanup**: Removes completed jobs after 1 hour

### Memory Monitoring
```bash
# Check memory usage
pm2 status
pm2 monit

# View memory logs
npm run pm2:logs | grep "Memory usage"
```

## Error Handling

- Comprehensive try-catch blocks
- Job status tracking (pending → processing → complete/error)
- Detailed error messages in job status
- Graceful fallback for compression failures
- Memory warnings at 600MB, critical at 700MB

## Security

- CORS restricted to specific origins
- Request size logging
- No sensitive data in logs
- Environment variables for secrets

## Troubleshooting

### High Memory Usage
```bash
# Check current usage
free -h
pm2 status

# Force restart
npm run pm2:restart

# Check for memory leaks
npm run pm2:logs | grep "HIGH MEMORY"
```

### Puppeteer Issues
```bash
# Verify Chrome installation
which google-chrome
google-chrome --version

# Test headless Chrome
google-chrome --headless --disable-gpu --dump-dom https://google.com
```

### Export Failures
1. Check logs: `npm run pm2:logs`
2. Verify memory: `pm2 status`
3. Check queue length in logs
4. Verify CORS settings match frontend URL

## Production Notes

- Deployed on DigitalOcean Droplet (Ubuntu 20.04+)
- Nginx reverse proxy at `/etc/nginx/sites-available/comic-pro-pdf`
- Chrome installed via apt for Puppeteer
- PM2 for process management and auto-restart
- Minimum 1GB RAM recommended
# Comic-Pro PDF Service

This is the standalone PDF export service for Comic-Pro.

## Deployment

This service is designed to be deployed on DigitalOcean App Platform.

### Environment Variables Required:
- `NODE_ENV=production`
- `PORT=3001`
- `ILOVEPDF_PUBLIC_KEY=your_key_here`
- `ILOVEPDF_SECRET_KEY=your_secret_here`
- `COMIC_CREATOR_URL=https://your-frontend-url.vercel.app`

### Commands:
- `npm install` - Install dependencies
- `npm start` - Start the service

### Endpoints:
- `GET /health` - Health check
- `POST /api/export-pdf` - Start PDF export
- `GET /api/export-progress/:jobId` - Check export progress
- `GET /api/download-pdf/:jobId` - Download completed PDF

## 🌐 CORS Configuration

The service is configured to accept requests from:
- `localhost:*` (development)
- `*.vercel.app` (Vercel deployments)
- Your specific production domain

## 📝 Notes

- Requires Node.js 18+
- Uses Puppeteer for PDF generation
- Includes automatic job cleanup
- Supports PDF compression via iLovePDF API 
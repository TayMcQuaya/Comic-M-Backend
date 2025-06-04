# Comic-Pro PDF Service

This is the standalone PDF export service for Comic-Pro, optimized for deployment on **DigitalOcean Droplets**.

## 🚀 Quick Deployment on DigitalOcean Droplet

### Prerequisites
- Ubuntu 20.04+ Droplet (minimum 1GB RAM recommended)
- Root or sudo access

### One-Command Deployment
```bash
# Clone the repository
git clone <your-repo-url> comic-pro-pdf-service
cd comic-pro-pdf-service

# Make deployment script executable and run
chmod +x deploy.sh
./deploy.sh
```

### Manual Deployment Steps

#### 1. System Setup
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Chrome for Puppeteer
wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list'
sudo apt-get update
sudo apt-get install -y google-chrome-stable

# Install PM2 globally
sudo npm install -g pm2
```

#### 2. Application Setup
```bash
# Install dependencies
npm install --production

# Create environment file
cp env.example .env
# Edit .env with your values (see Environment Variables section)

# Create necessary directories
mkdir -p logs exports

# Start with PM2
npm run pm2:start

# Setup PM2 to start on boot
pm2 startup
pm2 save
```

## 🔧 Environment Variables

Copy `env.example` to `.env` and configure:

```bash
# Required - Your frontend URL
COMIC_CREATOR_URL=https://your-comic-app.vercel.app

# Optional - For PDF compression (get from https://developer.ilovepdf.com/)
ILOVEPDF_PUBLIC_KEY=your_public_key_here
ILOVEPDF_SECRET_KEY=your_secret_key_here

# System settings (usually don't need to change)
NODE_ENV=production
PORT=3001
EXPORT_OUTPUT_DIR=./exports
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
```

## 📋 Management Commands

```bash
# Start service
npm run pm2:start

# Stop service
npm run pm2:stop

# Restart service
npm run pm2:restart

# View logs
npm run pm2:logs

# Check status
pm2 status

# Direct start (without PM2)
npm run prod
```

## 🌐 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/export-pdf` | POST | Start PDF export |
| `/api/export-progress/:jobId` | GET | Check export progress |
| `/api/download-pdf/:jobId` | GET | Download completed PDF |

### Example Usage

```bash
# Health check
curl http://your-droplet-ip:3001/health

# Start PDF export
curl -X POST http://your-droplet-ip:3001/api/export-pdf \
  -H "Content-Type: application/json" \
  -d '{"projectState": {...}, "exportOptions": {...}}'
```

## 🔒 Security & Firewall

```bash
# Allow port 3001 through firewall
sudo ufw allow 3001

# Optional: Setup nginx reverse proxy for HTTPS
sudo apt install nginx
# Configure nginx to proxy to localhost:3001
```

## 📊 Monitoring & Logs

```bash
# View application logs
npm run pm2:logs

# View system logs
sudo journalctl -u comic-pro-pdf-service

# Monitor process
pm2 monit

# View PM2 logs location
ls -la logs/
```

## 🔧 Troubleshooting

### Chrome/Puppeteer Issues
```bash
# Check Chrome installation
which google-chrome
google-chrome --version

# Test Chrome headless
google-chrome --headless --disable-gpu --dump-dom https://www.google.com
```

### Memory Issues
```bash
# Check memory usage
free -h
pm2 status

# Restart if high memory usage
npm run pm2:restart
```

### Connection Issues
```bash
# Check if service is running
netstat -tulpn | grep 3001

# Check firewall
sudo ufw status

# Test internal connection
curl http://localhost:3001/health
```

## 🌐 CORS Configuration

The service accepts requests from:
- `localhost:*` (development)
- `*.vercel.app` (Vercel deployments)
- Your specific production domain

## 📝 Technical Notes

- **Node.js 18+** required
- **Chrome/Chromium** for PDF generation via Puppeteer
- **PM2** for process management and auto-restart
- **Automatic job cleanup** after 1 hour
- **PDF compression** via iLovePDF API (optional)
- **Memory limit**: 1GB per process (configurable in ecosystem.config.js)

## 🆘 Support

If you encounter issues:
1. Check logs: `npm run pm2:logs`
2. Verify Chrome: `google-chrome --version`
3. Test health endpoint: `curl http://localhost:3001/health`
4. Check system resources: `free -h` and `df -h` 
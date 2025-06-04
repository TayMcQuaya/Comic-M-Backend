#!/bin/bash

# Comic-Pro PDF Service Deployment Script for DigitalOcean Droplet
# This script automates the deployment process

set -e  # Exit on any error

echo "🚀 Starting Comic-Pro PDF Service Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root (not recommended)
if [ "$EUID" -eq 0 ]; then
    print_warning "Running as root. It's recommended to run as a regular user."
fi

# Update system packages
print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 18 if not installed
if ! command -v node &> /dev/null; then
    print_status "Installing Node.js 18..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    print_success "Node.js is already installed: $(node --version)"
fi

# Install Chrome/Chromium for Puppeteer
print_status "Installing Chrome for Puppeteer..."
sudo apt-get install -y wget gnupg
wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list'
sudo apt-get update
sudo apt-get install -y google-chrome-stable

# Install additional dependencies for Puppeteer
sudo apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils

# Install PM2 globally if not installed
if ! command -v pm2 &> /dev/null; then
    print_status "Installing PM2 globally..."
    sudo npm install -g pm2
else
    print_success "PM2 is already installed: $(pm2 --version)"
fi

# Create application directory
APP_DIR="/home/$(whoami)/comic-pro-pdf-service"
print_status "Setting up application directory at $APP_DIR"

# Create logs directory
mkdir -p logs
print_success "Created logs directory"

# Create exports directory
mkdir -p exports
print_success "Created exports directory"

# Install Node.js dependencies
print_status "Installing Node.js dependencies..."
npm install --production

# Create environment file template if it doesn't exist
if [ ! -f .env ]; then
    print_status "Creating environment file template..."
    cat > .env << EOL
# Production Environment Variables
NODE_ENV=production
PORT=3001

# Your frontend URL (replace with your actual Vercel URL)
COMIC_CREATOR_URL=https://your-comic-app.vercel.app

# iLovePDF API Keys (optional - for PDF compression)
ILOVEPDF_PUBLIC_KEY=your_public_key_here
ILOVEPDF_SECRET_KEY=your_secret_key_here

# Export settings
EXPORT_OUTPUT_DIR=./exports
EOL
    print_warning "Please update the .env file with your actual values!"
    print_warning "Especially update COMIC_CREATOR_URL with your Vercel URL"
else
    print_success "Environment file already exists"
fi

# Setup PM2 to start on boot
print_status "Setting up PM2 startup script..."
pm2 startup | grep -E "sudo.*pm2" | bash || print_warning "PM2 startup setup may have failed - please run manually if needed"

# Start the application with PM2
print_status "Starting application with PM2..."
npm run pm2:start

# Save PM2 configuration
print_status "Saving PM2 configuration..."
pm2 save

# Setup UFW firewall (if installed)
if command -v ufw &> /dev/null; then
    print_status "Configuring firewall to allow port 3001..."
    sudo ufw allow 3001
    print_success "Firewall configured"
fi

print_success "Deployment completed! 🎉"
echo ""
echo "📋 Next Steps:"
echo "1. Update .env file with your actual values"
echo "2. Test the service: curl http://localhost:3001/health"
echo "3. Check PM2 status: pm2 status"
echo "4. View logs: npm run pm2:logs"
echo ""
echo "🔧 Useful Commands:"
echo "- Restart service: npm run pm2:restart"
echo "- Stop service: npm run pm2:stop" 
echo "- View logs: npm run pm2:logs"
echo "- Check status: pm2 status"
echo ""
echo "🌐 Your service will be available at:"
echo "http://your-droplet-ip:3001" 
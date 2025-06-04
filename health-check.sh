#!/bin/bash

# Health Check Script for Comic-Pro PDF Service
# Run this to verify the service is working correctly

echo "🔍 Comic-Pro PDF Service Health Check"
echo "====================================="

# Check if Node.js is installed
if command -v node &> /dev/null; then
    echo "✅ Node.js: $(node --version)"
else
    echo "❌ Node.js: Not installed"
    exit 1
fi

# Check if PM2 is installed
if command -v pm2 &> /dev/null; then
    echo "✅ PM2: $(pm2 --version)"
else
    echo "❌ PM2: Not installed"
    exit 1
fi

# Check if Chrome is installed
if command -v google-chrome &> /dev/null; then
    echo "✅ Chrome: $(google-chrome --version)"
elif command -v google-chrome-stable &> /dev/null; then
    echo "✅ Chrome: $(google-chrome-stable --version)"
else
    echo "❌ Chrome: Not found"
    exit 1
fi

# Check if service is running on port 3001
if netstat -tulpn 2>/dev/null | grep -q :3001; then
    echo "✅ Service: Running on port 3001"
else
    echo "❌ Service: Not running on port 3001"
fi

# Check PM2 process
echo ""
echo "📊 PM2 Status:"
pm2 status

# Test health endpoint
echo ""
echo "🌐 Testing Health Endpoint:"
curl -s http://localhost:3001/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:3001/health

echo ""
echo "Health check completed!" 
# URGENT: Nginx CORS Fix Instructions

## Problem
Your friend is getting a CORS error because Nginx is adding duplicate `Access-Control-Allow-Origin` headers. Both Nginx and Express are adding the same headers, which violates CORS policy.

## Solution
Remove all CORS headers from Nginx configuration and let Express handle them.

## Steps to Fix (Execute on the DigitalOcean Droplet)

### 1. SSH into your server
```bash
ssh root@YOUR_DROPLET_IP
# Enter your password when prompted
```

### 2. Edit the Nginx configuration
```bash
sudo nano /etc/nginx/sites-available/comic-pro-pdf
```

### 3. Update the configuration
Replace the entire file content with this corrected version:

```nginx
server {
    listen 443 ssl;
    server_name pdf.conference-router-planner.org;

    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/pdf.conference-router-planner.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pdf.conference-router-planner.org/privkey.pem;

    # Client upload size limit for large comic files
    client_max_body_size 200M;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeout settings for large file processing
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        
        # IMPORTANT: NO CORS headers here!
        # Express handles all CORS via middleware
    }
}

server {
    listen 80;
    server_name pdf.conference-router-planner.org;
    return 301 https://$server_name$request_uri;
}
```

### 4. Test the configuration
```bash
sudo nginx -t
```

You should see:
```
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### 5. Reload Nginx
```bash
sudo systemctl reload nginx
```

### 6. Verify the service is running
```bash
# Check if the PDF service is running
pm2 status

# If not running, start it:
cd ~/Comic-M-Backend
pm2 restart all
```

### 7. Test the fix
Ask your friend to try exporting again. The CORS error should be resolved.

## What Changed?

1. **Removed all `add_header` directives for CORS** - These were causing duplicates
2. **Added timeout configurations** - 300 seconds for large file processing
3. **Added `client_max_body_size 200M`** - Allows larger comic files
4. **Added proper proxy headers** - For better request forwarding

## Why This Fixes It

- **Before**: Both Nginx AND Express were adding `Access-Control-Allow-Origin` headers
- **After**: Only Express adds the headers (via cors middleware in server.js)
- **Result**: No more duplicate headers, CORS works correctly

## Additional Notes

- The Express server already has proper CORS configuration for `https://comic-pro.vercel.app`
- The timeout settings (300s) give enough time for large comics to process
- The 200M upload limit matches the Express body parser limit (150MB) with buffer

## If Issues Persist

1. Check the logs:
```bash
pm2 logs comic-pro-pdf-service
```

2. Check memory usage:
```bash
pm2 status
free -h
```

3. Restart the service if needed:
```bash
pm2 restart comic-pro-pdf-service
```

## Monitoring

Watch for these in the logs:
- "HIGH MEMORY WARNING" - Service approaching memory limit
- "Received request size" - Shows size of incoming comics
- Any CORS-related errors should now be gone
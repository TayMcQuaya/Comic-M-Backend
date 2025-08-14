module.exports = {
  apps: [{
    name: 'comic-pro-pdf-service',
    script: 'server.js',
    interpreter: 'node',
    node_args: '--experimental-modules --max-old-space-size=768 --expose-gc --optimize-for-size',  // Increased heap from 512 to 768MB
    instances: 1, // Start with 1 instance, can scale up later
    exec_mode: 'fork', // Use fork mode for better memory management
    watch: false, // Disable in production
    max_memory_restart: '900M', // Increased from 800MB to allow more headroom for larger exports
    env: {
      NODE_ENV: 'development',
      PORT: 3001
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    // Auto restart configuration
    restart_delay: 4000, // Wait 4 seconds before restart
    max_restarts: 10, // Max 10 restarts in a row
    min_uptime: '10s' // Minimum uptime before considering restart successful
  }]
}; 
/** PM2 ecosystem config for PriceHunter */
module.exports = {
  apps: [
    {
      name: "pricehunter",
      script: "./dist/boot.js",
      cwd: "/root/.openclaw/workspace/projects/2-1-1-skill",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      // Logs
      log_file: "/var/log/pricehunter/combined.log",
      out_file: "/var/log/pricehunter/out.log",
      error_file: "/var/log/pricehunter/error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      // Auto-restart
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      // Memory limit
      max_memory_restart: "512M",
      // Graceful shutdown
      kill_timeout: 30000,
      listen_timeout: 10000,
      // Monitoring
      monitoring: false,
      // Advanced
      merge_logs: true,
      time: true,
    },
  ],
};

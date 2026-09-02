#!/bin/bash
set -e

echo "=== PriceHunter 2+1+1 Setup ==="

APP_DIR="/root/.openclaw/workspace/projects/2-1-1-skill"
cd "$APP_DIR"

# 1. Install dependencies
echo "[1/7] Installing npm dependencies..."
npm install --no-audit --no-fund

# 2. Build
echo "[2/7] Building application..."
npm run build

# 3. Setup MySQL
echo "[3/7] Setting up MySQL..."
if ! systemctl is-active --quiet mysql; then
    systemctl start mysql
fi

mysql -u root -e "CREATE DATABASE IF NOT EXISTS pricehunter CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null || true
mysql -u root -e "CREATE USER IF NOT EXISTS 'pricehunter'@'localhost' IDENTIFIED BY 'pricehunter_pass';" 2>/dev/null || true
mysql -u root -e "GRANT ALL PRIVILEGES ON pricehunter.* TO 'pricehunter'@'localhost'; FLUSH PRIVILEGES;"

# 4. Run migrations
echo "[4/7] Running database migrations..."
npm run db:push

# 5. Setup log directories
echo "[5/7] Setting up log directories..."
mkdir -p /var/log/pricehunter /var/backups/pricehunter
chmod 755 /var/log/pricehunter /var/backups/pricehunter

# 6. Install systemd service
echo "[6/7] Installing systemd service..."
cp pricehunter.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable pricehunter

# 7. Start service
echo "[7/7] Starting PriceHunter..."
systemctl restart pricehunter
sleep 2

if systemctl is-active --quiet pricehunter; then
    echo "✅ PriceHunter is running on http://localhost:3000"
else
    echo "❌ Failed to start PriceHunter. Check logs: journalctl -u pricehunter"
    exit 1
fi

echo ""
echo "=== Setup complete ==="
echo "Service: systemctl {start|stop|restart|status} pricehunter"
echo "Logs: journalctl -u pricehunter -f"
echo "API: http://localhost:3000"

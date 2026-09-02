#!/bin/bash
# Backup script for PriceHunter MySQL database

BACKUP_DIR="/var/backups/pricehunter"
DB_NAME="pricehunter"
DB_USER="pricehunter"
DB_PASS="pricehunter_pass"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

# Create backup
mysqldump -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" > "$BACKUP_DIR/${DB_NAME}_${DATE}.sql"

# Compress
gzip "$BACKUP_DIR/${DB_NAME}_${DATE}.sql"

# Delete old backups
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup created: $BACKUP_DIR/${DB_NAME}_${DATE}.sql.gz"

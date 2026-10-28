#!/usr/bin/env bash
# Online non-blocking SQLite snapshot backup script for brzl-shortener

set -euo pipefail

DATA_DIR="${1:-./data}"
DB_PATH="${DATA_DIR}/shortener.db"
BACKUP_DIR="${DATA_DIR}/backups"

mkdir -p "${BACKUP_DIR}"

if [ ! -f "${DB_PATH}" ]; then
  echo "[WARN] No database file found at ${DB_PATH}. Skipping backup."
  exit 0
fi

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
SNAPSHOT_FILE="${BACKUP_DIR}/shortener_backup_${TIMESTAMP}.db"
SNAPSHOT_NAME="shortener_backup_${TIMESTAMP}.db"

echo "[BACKUP] Creating online SQLite snapshot into ${SNAPSHOT_FILE}..."

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "${DB_PATH}" "VACUUM INTO '${SNAPSHOT_FILE}';"
  INTEGRITY=$(sqlite3 "${SNAPSHOT_FILE}" "PRAGMA integrity_check;")
elif docker ps --filter "name=brzl-shortener" --format '{{.Names}}' | grep -q "brzl-shortener"; then
  docker exec brzl-shortener sqlite3 /app/data/shortener.db "VACUUM INTO '/app/data/backups/${SNAPSHOT_NAME}'"
  INTEGRITY=$(docker exec brzl-shortener sqlite3 "/app/data/backups/${SNAPSHOT_NAME}" "PRAGMA integrity_check;")
else
  echo "[ERROR] Neither host sqlite3 nor running brzl-shortener container found."
  exit 1
fi
if [ "${INTEGRITY}" != "ok" ]; then
  echo "[ERROR] Backup integrity check failed: ${INTEGRITY}"
  rm -f "${SNAPSHOT_FILE}"
  exit 1
fi

echo "[BACKUP] Snapshot verified: OK ($(du -h "${SNAPSHOT_FILE}" | cut -f1))"

# Retention: keep last 7 daily backups
echo "[BACKUP] Pruning older backups (retaining latest 7 daily snapshots)..."
find "${BACKUP_DIR}" -name "shortener_backup_*.db" -type f | sort -r | tail -n +8 | xargs rm -f 2>/dev/null || true

echo "[BACKUP] Backup completed successfully."

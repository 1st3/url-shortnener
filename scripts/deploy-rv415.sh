#!/usr/bin/env bash
# Production deployment script for rv415 host

set -euo pipefail

TARGET_HOST="rv415"
REMOTE_DIR="/home/ds/projects/url-shortnener"

echo "========================================================"
echo "🚀 Deploying brzl-shortener to ${TARGET_HOST}:${REMOTE_DIR}"
echo "========================================================"

# Step 1: Ensure remote directory exists
echo "📁 [1/5] Ensuring remote target directory..."
ssh "${TARGET_HOST}" "mkdir -p ${REMOTE_DIR}/data"

# Step 2: Pre-deployment backup on rv415 if database exists
echo "💾 [2/5] Creating pre-deployment database backup on remote host..."
ssh "${TARGET_HOST}" "
  if [ -f ${REMOTE_DIR}/data/shortener.db ]; then
    mkdir -p ${REMOTE_DIR}/data/backups
    TIMESTAMP=\$(date +'%Y%m%d_%H%M%S')
    sqlite3 ${REMOTE_DIR}/data/shortener.db \"VACUUM INTO '${REMOTE_DIR}/data/backups/pre_deploy_\${TIMESTAMP}.db'\" 2>/dev/null || true
    echo 'Pre-deploy backup created.'
  else
    echo 'No existing database found; skipping pre-deploy backup.'
  fi
"

# Step 3: Rsync files to rv415
echo "📦 [3/5] Syncing project files to ${TARGET_HOST}..."
rsync -avz --delete \
  --exclude="node_modules" \
  --exclude="dist" \
  --exclude="data" \
  --exclude=".git" \
  --exclude=".env" \
  --exclude="*.db*" \
  ./ "${TARGET_HOST}:${REMOTE_DIR}/"

# Step 4: Build and restart Docker container on rv415
echo "🐳 [4/5] Building and starting Docker container on ${TARGET_HOST}..."
ssh "${TARGET_HOST}" "
  cd ${REMOTE_DIR}
  chmod +x scripts/*.sh
  docker compose up -d --build --remove-orphans
"

# Step 5: Verify health check on rv415
echo "🩺 [5/5] Verifying health check on ${TARGET_HOST}..."
HEALTH_CHECK=""
for i in {1..15}; do
  HEALTH_CHECK=$(ssh "${TARGET_HOST}" "curl -s -f http://127.0.0.1:3005/health || true")
  if [ -n "${HEALTH_CHECK}" ]; then
    break
  fi
  echo "Waiting for container to become healthy (attempt ${i}/15)..."
  sleep 2
done

if [ -z "${HEALTH_CHECK}" ]; then
  echo "❌ Health check failed after 30 seconds!"
  ssh "${TARGET_HOST}" "docker logs brzl-shortener --tail 30"
  exit 1
fi

echo "✅ Deployment successful! Health status:"
echo "${HEALTH_CHECK}" | jq . || echo "${HEALTH_CHECK}"
echo "========================================================"
